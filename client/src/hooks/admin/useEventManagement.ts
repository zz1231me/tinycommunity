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

  // 이벤트 목록은 React Query 가 소유한다.
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

  // 권한은 낙관적 토글과 저장 직렬화를 직접 관리하므로 캐시로 옮기지 않는다.
  const [permissions, setPermissions] = useState<EventPermission[]>([]);
  const [saving, setSaving] = useState(false);
  // 목록이 비었다는 것만으로는 미도착과 실패를 구분할 수 없어 따로 들고 있는다.
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  // 저장 중에 들어온 토글을 모아 두어 클릭이 유실되지 않게 한다.
  const savingRef = useRef(false);
  const pendingRef = useRef<EventPermission[] | null>(null);
  // setState updater 는 비동기라 저장할 값은 이 ref 에서 동기로 읽는다.
  const permissionsRef = useRef<EventPermission[]>([]);

  const fetchPermissions = async () => {
    try {
      const data = unwrap<EventPermission[]>(await api.get('/admin/events/permissions'));
      permissionsRef.current = data;
      setPermissions(data);
      setPermissionsError(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('이벤트 권한 오류:', err);
      setPermissionsError('권한 설정을 불러오지 못했습니다.');
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

  // 저장은 직렬로 하고, 저장 중 쌓인 변경은 끝난 뒤 이어서 저장한다.
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
      // 저장에 실패하면 서버 상태로 되돌린다.
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
    // 저장할 값은 ref 에서 동기로 읽는다. updater 결과를 바로 읽으면 빈 배열이 될 수 있다.
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
    permissionsError,
  };
};
