// client/src/hooks/useAccessibleBoards.ts - 보안 강화 및 검증 추가
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchUserAccessibleBoards } from '../api/boards';
import { useAuth } from '../store/auth';

interface AccessibleBoard {
  id: string;
  name: string;
  description?: string;
  order: number;
  isPersonal: boolean;
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

export function useAccessibleBoards(): UseAccessibleBoardsReturn {
  const { user } = useAuth();
  const [boards, setBoards] = useState<AccessibleBoard[]>([]);
  // ✅ 초기값 true: 첫 렌더링에서 boards=[], loading=false 상태를 피해
  //    BoardProtectedRoute가 빈 배열로 checkAccess() 조기 실행하는 것을 방지
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      if (import.meta.env.DEV) {
        console.info(
          `🔐 [useAccessibleBoards] ${user.name}(${user.role}) - 게시판 목록 조회 중...`
        );
      }

      const response = await fetchUserAccessibleBoards();

      if (response.data?.success) {
        const boardsData = response.data.data;

        if (import.meta.env.DEV) {
          console.info(
            `✅ [useAccessibleBoards] ${user.name} - ${boardsData.length}개 게시판 조회 완료`
          );
          console.info(
            `🔒 [useAccessibleBoards] 보안 검증: 사용자 ${user.id}(${user.role})에게 허용된 게시판만 수신됨`
          );
        }

        // ✅ 권한 검증: 모든 게시판이 적절한 권한을 가지고 있는지 확인
        const invalidBoards = boardsData.filter((board: AccessibleBoard) => {
          if (board.isPersonal) {
            // 개인 폴더: 반드시 ownerId가 현재 사용자와 일치해야 함
            return board.ownerId !== user.id;
          } else {
            // 일반 게시판: 최소한 읽기 권한은 있어야 함
            return !board.permissions.canRead;
          }
        });

        if (invalidBoards.length > 0) {
          if (import.meta.env.DEV) {
            console.error(`❌ [useAccessibleBoards] 권한 불일치 발견:`, invalidBoards);
          }
          setError('권한 검증 오류가 발견되었습니다. 관리자에게 문의하세요.');
          setBoards([]);
          return;
        }

        const regularCount = boardsData.filter((b: AccessibleBoard) => !b.isPersonal).length;
        const personalCount = boardsData.filter((b: AccessibleBoard) => b.isPersonal).length;

        if (import.meta.env.DEV) {
          console.info(`   📋 일반 게시판: ${regularCount}개`);
          console.info(`   📁 개인 폴더: ${personalCount}개`);
          console.info(
            `🔐 [useAccessibleBoards] 권한 검증 완료: 모든 게시판이 적절한 권한을 가지고 있음`
          );
        }

        setBoards(boardsData);
      } else {
        throw new Error(response.data?.message || '게시판 조회 실패');
      }
    } catch (err: unknown) {
      if (import.meta.env.DEV) {
        console.error(`❌ [useAccessibleBoards] ${user.name} - 게시판 조회 실패:`, err);
      }
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage =
        axiosErr?.response?.data?.message || axiosErr?.message || '게시판을 불러올 수 없습니다';
      setError(errorMessage);
      setBoards([]);
    } finally {
      setLoading(false);
    }
    // ✅ user 객체 대신 user?.id만 의존성으로 사용 (참조 변경으로 인한 무한 루프 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

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
      refetch: loadBoards,
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
      loadBoards,
      getBoardById,
      hasReadPermission,
      hasWritePermission,
      hasDeletePermission,
    ]
  );

  return stableReturn;
}

export type { AccessibleBoard, UseAccessibleBoardsReturn };
