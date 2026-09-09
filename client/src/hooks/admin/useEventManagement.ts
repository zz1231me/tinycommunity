import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { unwrap } from '../../api/utils';
import { adminKeys } from '../../api/queryKeys';
import { Event, EventPermission } from '../../types/admin.types';

interface EventUpdatePayload {
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  calendarId?: string;
  body?: string;
  isAllday?: boolean;
  category?: string;
  isReadOnly?: boolean;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
}

export const useEventManagement = () => {
  const queryClient = useQueryClient();

  // 이벤트 목록은 순수 서버 캐시 — React Query 가 소유한다.
  const {
    data: events = [],
    isPending: loading,
    isSuccess: dataLoaded,
    error: eventsError,
  } = useQuery({
    queryKey: adminKeys.events.all,
    queryFn: async () => unwrap<Event[]>(await api.get('/admin/events')),
  });

  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: adminKeys.events.all });

  // 권한은 낙관적 토글 + 저장 직렬화(coalescing)를 직접 관리하므로 캐시로 옮기지 않는다.
  const [permissions, setPermissions] = useState<EventPermission[]>([]);
  const [saving, setSaving] = useState(false);
  // 저장 직렬화용 — 저장 진행 중 들어온 후속 토글의 최신 상태를 적재(coalescing)해 클릭 유실 방지
  const savingRef = useRef(false);
  const pendingRef = useRef<EventPermission[] | null>(null);
  // permissions의 최신 스냅샷(ref). setState updater의 비동기 실행에 의존해 토글 결과를 읽으면
  // 저장이 누락될 수 있어, ref에서 동기적으로 최신 상태를 읽어 결정적으로 계산한다.
  const permissionsRef = useRef<EventPermission[]>([]);

  const fetchPermissions = async () => {
    try {
      const data = unwrap<EventPermission[]>(await api.get('/admin/events/permissions'));
      permissionsRef.current = data;
      setPermissions(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error('이벤트 권한 오류:', err);
    }
  };

  const updateEventMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: EventUpdatePayload }) =>
      api.put(`/admin/events/${id}`, updates),
    onSuccess: invalidateEvents,
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/events/${id}`),
    onSuccess: invalidateEvents,
  });

  // 최신 권한 상태를 직렬로 저장. 저장 중 쌓인 변경은 끝난 뒤 이어서 저장(클릭 유실/out-of-order 방지)
  const flushPermissionSave = async (perms: EventPermission[]) => {
    savingRef.current = true;
    setSaving(true);
    const validPermissions = perms.map(p => ({
      roleId: p.roleId,
      canCreate: p.canCreate,
      canRead: p.canRead,
      canUpdate: p.canUpdate,
      canDelete: p.canDelete,
    }));
    try {
      await api.put('/admin/events/permissions', { permissions: validPermissions });
    } catch (err) {
      // 저장 실패 시 서버 상태로 롤백
      if (import.meta.env.DEV) console.error('이벤트 권한 저장 실패 — 서버 상태로 롤백', err);
      pendingRef.current = null; // 서버 상태를 다시 읽으므로 대기분은 폐기
      await fetchPermissions();
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        await flushPermissionSave(next);
      } else {
        setSaving(false);
      }
    }
  };

  const updatePermission = (
    roleId: string,
    type: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete'
  ) => {
    // ⚠ setState 업데이터의 비동기 실행에 의존하지 않고 ref(최신 스냅샷)에서 동기적으로 계산한다.
    //    updater 안에서 채운 값을 직후에 동기로 읽으면, 지연 실행 시 빈 배열로 읽혀
    //    저장이 건너뛰어진다. 저장 중이면 대기열에 넣어 이어서 저장한다.
    if (permissionsRef.current.length === 0) return;
    const updated = permissionsRef.current.map(p =>
      p.roleId === roleId ? { ...p, [type]: !p[type] } : p
    );
    permissionsRef.current = updated;
    setPermissions(updated);
    if (savingRef.current) {
      pendingRef.current = updated;
      return;
    }
    void flushPermissionSave(updated);
  };

  return {
    events,
    permissions,
    loading,
    saving,
    dataLoaded,
    fetchEvents: invalidateEvents,
    fetchPermissions,
    updateEvent: (id: number, updates: EventUpdatePayload) =>
      updateEventMutation.mutateAsync({ id, updates }),
    deleteEvent: (id: number) => deleteEventMutation.mutateAsync(id),
    updatePermission,
    fetchError: eventsError ? '이벤트 목록을 불러오지 못했습니다.' : null,
  };
};
