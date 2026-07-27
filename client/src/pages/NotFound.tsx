// client/src/pages/NotFound.tsx - 디자인 일관성 개선
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-2xl">
        {/* ✅ 메인 카드 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden animate-scaleIn">
          <div className="p-12 text-center">
            {/* ✅ 404 숫자 - 그라디언트 */}
            <div className="mb-8">
              <div className="text-9xl font-extrabold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                404
              </div>
            </div>

            {/* ✅ 아이콘 - 그라디언트 배경 */}
            <div className="mb-8 flex justify-center">
              <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center shadow-lg">
                <svg
                  className="w-12 h-12 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>

            {/* ✅ 제목 */}
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              페이지를 찾을 수 없어요
            </h1>

            {/* ✅ 설명 */}
            <p className="text-slate-600 dark:text-slate-400 text-lg mb-10 leading-relaxed max-w-md mx-auto">
              요청하신 페이지가 존재하지 않거나 이동되었습니다.
              <br />
              아래 버튼을 눌러 다른 페이지로 이동하세요.
            </p>

            {/* ✅ 버튼 그룹 */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-primary px-8 py-4 text-base font-semibold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                홈으로 가기
              </button>

              <button
                onClick={() => navigate(-1)}
                className="btn-secondary px-8 py-4 text-base font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                이전 페이지
              </button>
            </div>

            {/* ✅ 구분선 */}
            <div className="my-8 border-t border-slate-200 dark:border-slate-700"></div>

            {/* ✅ 에러 코드 */}
            <div className="text-sm text-slate-500 dark:text-slate-400 font-mono">
              Error Code: 404 - Page Not Found
            </div>
          </div>
        </div>

        {/* ✅ 하단 안내 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            문제가 지속되면 관리자에게 문의하세요
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
