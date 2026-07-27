import { useNavigate } from 'react-router-dom';

const Forbidden = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-4 w-full">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <svg
            className="h-10 w-10 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          접근이 차단되었습니다
        </h2>
        <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
          허용되지 않은 IP 주소이거나 접근 권한이 없습니다.
          <br />
          관리자에게 문의해주세요.
        </p>
        <div className="mt-8">
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
          >
            메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default Forbidden;
