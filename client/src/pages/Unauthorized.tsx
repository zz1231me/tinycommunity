// client/src/pages/Unauthorized.tsx - 디자인 일관성 개선
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-2xl">
        {/* ✅ 메인 카드 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden animate-scaleIn">
          <div className="p-12 text-center">
            {/* ✅ 아이콘 - 빨간색 그라디언트 */}
            <div className="mb-8 flex justify-center">
              <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg">
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
            </div>

            {/* ✅ 403 에러 코드 */}
            <div className="mb-6">
              <div className="text-8xl font-extrabold bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent">
                403
              </div>
            </div>

            {/* ✅ 제목 */}
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              접근 권한이 없습니다
            </h1>

            {/* ✅ 설명 */}
            <p className="text-slate-600 dark:text-slate-400 text-lg mb-10 leading-relaxed max-w-md mx-auto">
              죄송합니다. 이 페이지에 접근할 수 있는 권한이 없습니다.
              <br />
              관리자에게 문의하거나 다른 페이지로 이동해주세요.
            </p>

            {/* ✅ 카운트다운 - 인라인 스타일 */}
            {autoRedirect && (
              <div className="mb-10 p-6 bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-slate-700 dark:to-slate-700 rounded-xl border border-primary-200 dark:border-slate-600">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-md">
                    <svg
                      className="w-6 h-6 text-primary-600 dark:text-primary-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                      {countdown}초
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">후 자동 이동</div>
                  </div>
                  <button
                    onClick={() => setAutoRedirect(false)}
                    className="ml-4 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                  >
                    자동 이동 중지
                  </button>
                </div>
              </div>
            )}

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
                대시보드로 이동
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

            {/* ✅ 안내 섹션 */}
            <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <div className="flex items-start gap-4 text-left">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-800 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-amber-600 dark:text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="text-sm">
                  <p className="font-bold text-amber-900 dark:text-amber-200 mb-2">
                    권한이 필요하신가요?
                  </p>
                  <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                    시스템 관리자에게 문의하여 적절한 권한을 요청하세요. 권한 승인 후 다시 접속해
                    주시기 바랍니다.
                  </p>
                </div>
              </div>
            </div>

            {/* ✅ 구분선 */}
            <div className="my-8 border-t border-slate-200 dark:border-slate-700"></div>

            {/* ✅ 에러 코드 */}
            <div className="text-sm text-slate-500 dark:text-slate-400 font-mono">
              Error Code: 403 - Forbidden
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

export default Unauthorized;
