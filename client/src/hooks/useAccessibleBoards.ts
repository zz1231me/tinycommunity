import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUserAccessibleBoards } from '../api/boards';
import { useAuth } from '../store/auth';

interface AccessibleBoard {
  id: string;
  name: string;
  description?: string;
  order: number;
  isPersonal: boolean;
  /** 업무용 게시판. 담당자·업무 상태를 쓴다 */
  taskEnabled?: boolean;
  ownerId?: string;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
}

interface UseAccessibleBoardsReturn {
  boards: AccessibleBoard[];
  loading: boolean;
  error: string | null;
  regularBoards: AccessibleBoard[];
  personalBoards: AccessibleBoard[];
  refetch: () => Promise<void>;
  getBoardById: (id: string) => AccessibleBoard | undefined;
  hasWritePermission: (boardId: string) => boolean;
  hasDeletePermission: (boardId: string) => boolean;
  hasReadPermission: (boardId: string) => boolean;
}

// 기본값으로 새 배열 리터럴을 쓰면 렌더마다 참조가 바뀌어 소비자의 effect 가 다시 돈다.
const EMPTY_BOARDS: AccessibleBoard[] = [];

export function useAccessibleBoards(): UseAccessibleBoardsReturn {
  const { user } = useAuth();

  const {
    data: boards = EMPTY_BOARDS,
    isPending,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery({
    // 사용자가 바뀌면 다른 캐시를 쓴다. 이전 계정의 목록이 남지 않는다.
    queryKey: ['boards', 'accessible', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await fetchUserAccessibleBoards();
      if (!response.data?.success) {
        throw new Error(response.data?.message || '게시판 조회 실패');
      }
      const boardsData: AccessibleBoard[] = response.data.data;

      // 서버가 권한 없는 게시판을 섞어 보내지 않았는지 확인한다.
      const invalidBoards = boardsData.filter(
        board =>
          board.isPersonal
            ? board.ownerId !== user?.id // 개인 폴더는 소유자가 일치해야 한다
            : !board.permissions.canRead // 일반 게시판은 최소 읽기 권한이 있어야 한다
      );
      if (invalidBoards.length > 0) {
        if (import.meta.env.DEV) {
          console.error('❌ [useAccessibleBoards] 권한 불일치 발견:', invalidBoards);
        }
        throw new Error('권한 검증 오류가 발견되었습니다. 관리자에게 문의하세요.');
      }

      return boardsData;
    },
  });

  // 로그인 전에는 enabled:false 라 isPending 이 계속 true 다. 소비자는 대기해야 하므로 그대로 노출한다.
  const loading = isPending;
  const error = queryError
    ? ((queryError as { response?: { data?: { message?: string } }; message?: string })?.response
        ?.data?.message ??
      (queryError as Error).message ??
      '게시판을 불러올 수 없습니다')
    : null;

  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  const regularBoards = useMemo(() => boards.filter(b => !b.isPersonal), [boards]);
  const personalBoards = useMemo(() => boards.filter(b => b.isPersonal), [boards]);

  const getBoardById = useCallback(
    (id: string) => {
      return boards.find(b => b.id === id);
    },
    [boards]
  );

  const hasPermission = useCallback(
    (boardId: string, permissionType: keyof AccessibleBoard['permissions']) => {
      const board = getBoardById(boardId);
      return board?.permissions[permissionType] || false;
    },
    [getBoardById]
  );

  const hasReadPermission = useCallback(
    (boardId: string) => {
      return hasPermission(boardId, 'canRead');
    },
    [hasPermission]
  );

  const hasWritePermission = useCallback(
    (boardId: string) => {
      return hasPermission(boardId, 'canWrite');
    },
    [hasPermission]
  );

  const hasDeletePermission = useCallback(
    (boardId: string) => {
      return hasPermission(boardId, 'canDelete');
    },
    [hasPermission]
  );

  // 반환 객체 참조를 고정해 소비자 리렌더를 줄인다.
  const stableReturn = useMemo(
    () => ({
      boards,
      loading,
      error,
      regularBoards,
      personalBoards,
      refetch,
      getBoardById,
      hasReadPermission,
      hasWritePermission,
      hasDeletePermission,
    }),
    [
      boards,
      loading,
      error,
      regularBoards,
      personalBoards,
      refetch,
      getBoardById,
      hasReadPermission,
      hasWritePermission,
      hasDeletePermission,
    ]
  );

  return stableReturn;
}

export type { AccessibleBoard, UseAccessibleBoardsReturn };
