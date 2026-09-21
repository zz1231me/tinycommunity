import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useAccessibleBoards } from '../hooks/useAccessibleBoards';
import { checkUserBoardAccess } from '../api/boards';

interface Props {
  children: ReactElement;
  action?: 'read' | 'write' | 'delete';
}

const BoardProtectedRoute = ({ children, action = 'read' }: Props) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { boards, loading: boardsLoading } = useAccessibleBoards();
  const { boardType } = useParams<{ boardType: string }>();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  useEffect(() => {
    if (authLoading || boardsLoading || !isAuthenticated || !boardType) {
      setIsAllowed(null);
      return;
    }

    // 취소 표시와 타이머는 이 실행에만 속한다. 공유하면 앞 게시판의 늦은 응답이 지금 판정을 덮어쓴다.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    timer = setTimeout(() => {
      if (cancelled) return;
      if (import.meta.env.DEV) console.warn('[BoardProtectedRoute] 권한 체크 타임아웃 (10초)');
      setErrorMessage('권한 확인 시간이 초과되었습니다. 다시 시도해주세요.');
      setIsAllowed(false);
      timer = null;
    }, 10000);

    const checkAccess = async () => {
      try {
        // 사이드바 캐시에서 먼저 확인한다.
        const board = boards.find(b => b.id === boardType);

        if (board) {
          if (cancelled) return;
          const permissionMap: Record<string, boolean> = {
            read: board.permissions.canRead,
            write: board.permissions.canWrite,
            delete: board.permissions.canDelete,
          };
          const hasPermission = permissionMap[action] ?? false;
          if (!hasPermission) setErrorMessage('이 게시판에 접근할 권한이 없습니다.');
          setIsAllowed(hasPermission);
          return;
        }

        // 사이드바에 없으면 서버에 확인한다.
        const res = await checkUserBoardAccess(boardType);
        if (cancelled) return;
        const responseData = res.data.data || res.data;

        if (!responseData.hasAccess) {
          setErrorMessage('이 게시판에 접근할 권한이 없습니다.');
          setIsAllowed(false);
          return;
        }

        const permissions = responseData.permissions;
        const permissionMap: Record<string, boolean> = {
          read: permissions.canRead,
          write: permissions.canWrite,
          delete: permissions.canDelete,
        };
        const result = permissionMap[action] ?? false;
        if (!result) setErrorMessage('이 게시판에 접근할 권한이 없습니다.');
        setIsAllowed(result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error('[BoardProtectedRoute] 권한 체크 오류:', error);
        if (error.response?.status === 403 || error.response?.status === 404) {
          setErrorMessage('이 게시판에 접근할 권한이 없습니다.');
        } else {
          setErrorMessage('권한 확인 중 오류가 발생했습니다.');
        }
        setIsAllowed(false);
      } finally {
        clearTimer();
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardType, action, authLoading, boardsLoading, isAuthenticated, boards.length]);

  if (authLoading || boardsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">
            {authLoading ? '인증 확인 중...' : '게시판 정보 로딩 중...'}
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!boardType) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAllowed === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">권한 확인 중...</p>
        </div>
      </div>
    );
  }

  if (isAllowed === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 max-w-md">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              aria-hidden="true"
              className="w-8 h-8 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            접근 권한이 없습니다
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">{errorMessage}</p>
          <button onClick={() => window.history.back()} className="btn-primary">
            뒤로 가기
          </button>
        </div>
      </div>
    );
  }

  return children;
};

export default BoardProtectedRoute;
