// client/src/pages/NotFound.tsx
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <svg
            className="h-10 w-10 text-slate-500 dark:text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
          <br />
          아래 버튼을 눌러 다른 페이지로 이동하세요.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            홈으로 가기
          </button>
          <button onClick={() => navigate(-1)} className="btn-secondary">
            이전 페이지
          </button>
        </div>
        <p className="mt-8 font-mono text-xs text-slate-400">Error 404 · Page Not Found</p>
      </div>
    </div>
  );
};

export default NotFound;
