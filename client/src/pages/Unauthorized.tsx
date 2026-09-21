// client/src/pages/Unauthorized.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
  const navigate = useNavigate();
  // 사용자가 안내문(관리자 문의)을 읽을 시간을 확보하기 위해 15초로 늘리고,
  // 명시적으로 자동 이동을 중지할 수 있게 한다 (이전 5초는 정보 읽기 전 사라짐).
  const [countdown, setCountdown] = useState(15);
  const [autoRedirect, setAutoRedirect] = useState(true);

  useEffect(() => {
    if (!autoRedirect) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, autoRedirect]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg
            aria-hidden="true"
            className="h-10 w-10 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          접근 권한이 없습니다
        </h2>
        <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
          이 페이지에 접근할 수 있는 권한이 없습니다.
          <br />
          관리자에게 문의하거나 다른 페이지로 이동해주세요.
        </p>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-left dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            시스템 관리자에게 적절한 권한을 요청하세요. 권한 승인 후 다시 접속하면 이용할 수
            있습니다.
          </p>
          {autoRedirect && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {countdown}초
                </span>{' '}
                후 대시보드로 이동합니다
              </span>
              <button
                onClick={() => setAutoRedirect(false)}
                className="flex-shrink-0 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                자동 이동 중지
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            대시보드로 이동
          </button>
          <button onClick={() => navigate(-1)} className="btn-secondary">
            이전 페이지
          </button>
        </div>
        <p className="mt-8 font-mono text-xs text-slate-400">Error 403 · Forbidden</p>
      </div>
    </div>
  );
};

export default Unauthorized;
