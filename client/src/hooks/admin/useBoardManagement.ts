import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { unwrap } from '../../api/utils';
import { adminKeys } from '../../api/queryKeys';
import { Board, BoardPermission, Role } from '../../types/admin.types';

export const useBoardManagement = () => {
  const queryClient = useQueryClient();

  // ── 서버 상태: React Query 가 소유 ─────────────────────────────────────────
  const {
    data: boards = [],
    isPending,
    isSuccess,
    error: boardsError,
  } = useQuery({
    queryKey: adminKeys.boards.all,
    queryFn: async () => unwrap<Board[]>(await api.get('/admin/boards')),
  });

  const invalidateBoards = () => queryClient.invalidateQueries({ queryKey: adminKeys.boards.all });

  // ── 로컬 편집 초안: 체크박스 토글을 모아 '저장' 버튼으로 일괄 반영 ──────────
  const [permissions, setPermissions] = useState<Record<string, BoardPermission[]>>({});
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  // permissions의 최신 스냅샷(ref). 토글 시 setState updater의 비동기 실행에 의존하지 않고
  // ref에서 동기적으로 최신 상태를 읽어 결정적으로 계산한다(연속 클릭 누적 + 누락 방지).
  const permissionsRef = useRef<Record<string, BoardPermission[]>>({});
  // 변경됐지만 아직 저장 안 된 게시판 id 집합 — 자동저장 대신 '저장' 버튼으로 일괄 저장한다.
  const [dirtyBoards, setDirtyBoards] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const addBoardMutation = useMutation({
    mutationFn: (boardData: {
      id: string;
      name: string;
      description: string;
      order: number;
      taskEnabled: boolean;
    }) => api.post('/admin/boards', boardData),
    onSuccess: invalidateBoards,
  });

  const updateBoardMutation = useMutation({
    mutationFn: ({ boardId, updates }: { boardId: string; updates: Partial<Board> }) =>
      api.put(`/admin/boards/${boardId}`, updates),
    onSuccess: invalidateBoards,
  });

  const deleteBoardMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/boards/${id}`),
    onSuccess: invalidateBoards,
  });

  // 드래그 정렬 결과를 저장 — 낙관적으로 캐시의 순서를 먼저 반영하고, 실패 시 되돌린다.
  const reorderBoardsMutation = useMutation({
    mutationFn: (orderedIds: string[]) => api.put('/admin/boards/reorder', { orderedIds }),
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.boards.all });
      const previous = queryClient.getQueryData<Board[]>(adminKeys.boards.all);
      if (previous) {
        const byId = new Map(previous.map(b => [b.id, b]));
        const next = orderedIds
          .map((id, i) => {
            const b = byId.get(id);
            return b ? { ...b, order: i } : null;
          })
          .filter((b): b is Board => b !== null);
        queryClient.setQueryData(adminKeys.boards.all, next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(adminKeys.boards.all, context.previous);
    },
    onSettled: invalidateBoards,
  });

  const fetchBoardPermissions = async (boardList: Board[]) => {
    // 보드별 N요청 대신 1요청으로 전체 권한을 받아 boardId로 그룹핑(권한 없는 보드도 []로 표시).
    const permissionsState: Record<string, BoardPermission[]> = {};
    for (const board of boardList) permissionsState[board.id] = [];
    setPermissionsError(null); // 재시도 시 이전 에러를 지워 성공 후 배너가 남지 않도록
    try {
      const rows = unwrap<Array<BoardPermission & { boardId: string }>>(
        await api.get('/admin/board-permissions')
      );
      for (const row of rows ?? []) {
        if (!permissionsState[row.boardId]) permissionsState[row.boardId] = [];
        permissionsState[row.boardId].push(row);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('게시판 권한 일괄 조회 실패:', err);
      setPermissionsError('게시판 권한을 불러오지 못했습니다.');
    }
    permissionsRef.current = permissionsState;
    setPermissions(permissionsState);
    setDirtyBoards(new Set()); // 새로 로드하면 미저장 표시 초기화
  };

  // 체크박스 토글 — 로컬 상태만 변경하고 해당 게시판을 dirty로 표시한다(저장은 saveAllPermissions에서 일괄).
  const updatePermission = (
    boardId: string,
    roleId: string,
    type: 'canRead' | 'canWrite' | 'canDelete',
    roles: Role[]
  ) => {
    const boardPerms = permissionsRef.current[boardId] || [];
    const existingIndex = boardPerms.findIndex(p => p.roleId === roleId);
    let updatedPerms: BoardPermission[];
    if (existingIndex >= 0) {
      updatedPerms = boardPerms.map(p => {
        if (p.roleId !== roleId) return p;
        const next = { ...p, [type]: !p[type] };
        // 읽기/쓰기/삭제 결합(서버 정규화와 일치): 읽기를 끄면 쓰기/삭제도 해제,
        // 쓰기/삭제를 켜면 읽기 자동 부여. read 없는 write/delete는 실제로 무력화되기 때문.
        if (type === 'canRead' && !next.canRead) {
          next.canWrite = false;
          next.canDelete = false;
        } else if ((type === 'canWrite' || type === 'canDelete') && next[type]) {
          next.canRead = true;
        }
        return next;
      });
    } else {
      const role = roles.find(r => r.id === roleId);
      if (!role) return;
      // 새 권한 행: 어떤 항목을 켜든 읽기는 전제이므로 canRead=true
      updatedPerms = [
        ...boardPerms,
        {
          roleId,
          roleName: role.name,
          canRead: true,
          canWrite: type === 'canWrite',
          canDelete: type === 'canDelete',
        },
      ];
    }

    const nextState = { ...permissionsRef.current, [boardId]: updatedPerms };
    permissionsRef.current = nextState;
    setPermissions(nextState);
    setDirtyBoards(prev => {
      const next = new Set(prev);
      next.add(boardId);
      return next;
    });
  };

  // 변경된 모든 게시판 권한을 서버에 일괄 저장. 성공한 게시판은 dirty 해제, 실패한 것만 유지한다.
  const saveAllPermissions = async (): Promise<{ failed: string[] }> => {
    if (saving) return { failed: [...dirtyBoards] };
    const targets = [...dirtyBoards];
    if (targets.length === 0) return { failed: [] };
    setSaving(true);
    const failed: string[] = [];
    for (const boardId of targets) {
      try {
        const perms = permissionsRef.current[boardId] || [];
        await api.put(`/admin/boards/${boardId}/permissions`, {
          permissions: perms.map(p => ({
            roleId: p.roleId,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
        });
      } catch (err) {
        if (import.meta.env.DEV) console.error(`권한 저장 실패: ${boardId}`, err);
        failed.push(boardId);
      }
    }
    setDirtyBoards(new Set(failed));
    setSaving(false);
    return { failed };
  };

  // 미저장 변경 폐기 — 서버 상태로 다시 로드.
  const discardChanges = async () => {
    await fetchBoardPermissions(boards);
  };

  return {
    boards,
    permissions,
    loading: isPending,
    saving,
    dataLoaded: isSuccess,
    dirtyBoards,
    fetchError: boardsError ? '게시판 목록을 불러오지 못했습니다.' : permissionsError,
    fetchBoards: invalidateBoards,
    addBoard: (boardData: {
      id: string;
      name: string;
      description: string;
      order: number;
      taskEnabled: boolean;
    }) => addBoardMutation.mutateAsync(boardData),
    updateBoard: (boardId: string, updates: Partial<Board>) =>
      updateBoardMutation.mutateAsync({ boardId, updates }),
    reorderBoards: (orderedIds: string[]) => reorderBoardsMutation.mutateAsync(orderedIds),
    deleteBoard: (id: string) => deleteBoardMutation.mutateAsync(id),
    fetchBoardPermissions,
    updatePermission,
    saveAllPermissions,
    discardChanges,
  };
};
