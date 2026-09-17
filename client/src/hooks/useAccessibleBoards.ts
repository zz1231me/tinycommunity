// client/src/hooks/useAccessibleBoards.ts - 보안 강화 및 검증 추가
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
  /** 업무용 게시판 — 담당자·업무 상태를 쓴다 */
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

/**
 * 접근 가능한 게시판 목록.
 *
 * 사이드바·사용자 메뉴·커맨드 팔레트·게시글 화면이 동시에 쓴다.
 * React Query 캐시를 공유해 화면 하나를 여는 동안 요청이 한 번만 나가게 한다.
 */
// data 기본값으로 새 배열 리터럴을 쓰면 렌더마다 참조가 바뀌어, boards 를 의존성으로
// 쓰는 소비자(BoardProtectedRoute 등)의 effect 가 불필요하게 재실행된다.
const EMPTY_BOARDS: AccessibleBoard[] = [];

export function useAccessibleBoards(): UseAccessibleBoardsReturn {
  const { user } = useAuth();

  const {
    data: boards = EMPTY_BOARDS,
    isPending,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery({
    // 사용자가 바뀌면 다른 캐시를 쓴다(로그아웃 후 다른 계정 로그인 시 이전 목록 노출 방지)
    queryKey: ['boards', 'accessible', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await fetchUserAccessibleBoards();
      if (!response.data?.success) {
        throw new Error(response.data?.message || '게시판 조회 실패');
      }
      const boardsData: AccessibleBoard[] = response.data.data;

      // 권한 검증: 서버가 권한 없는 게시판을 섞어 보내지 않았는지 확인
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

  // 로그인 전에는 조회 자체를 하지 않으므로(enabled:false) isPending 이 계속 true 다.
  // 소비자(BoardProtectedRoute 등)는 "로딩 중"으로 보고 대기해야 하므로 그대로 노출한다.
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

  // 메모이제이션된 계산 값들
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

  // 반환 객체를 useMemo로 안정화하여 불필요한 리렌더링 방지
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
