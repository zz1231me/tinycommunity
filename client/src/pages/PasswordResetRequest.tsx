// src/pages/PasswordResetRequest.tsx - 비밀번호 초기화 요청 페이지 (아이디 → 관리자 승인)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api/auth';
import { useSiteSettings } from '../store/siteSettings';

function PasswordResetRequest() {
  const { settings } = useSiteSettings();

  const [loginId, setLoginId] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = loginId.trim();
    if (!trimmed) {
      setError('아이디를 입력해주세요.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const result = await requestPasswordReset(trimmed);
      setSuccessMessage(result.message);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-md">
        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">오류</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            {settings.logoUrl ? (
              <div className="mb-6">
                <img
                  src={settings.logoUrl}
                  alt={settings.siteName}
                  className="w-20 h-20 rounded-2xl object-cover mx-auto shadow-md"
                />
              </div>
            ) : (
              <div className="w-20 h-20 bg-primary-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-md">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
            )}

            <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">
              비밀번호 초기화 요청
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {submitted
                ? '관리자 승인을 기다려주세요'
                : '아이디를 입력하면 관리자에게 초기화 요청이 전달됩니다'}
            </p>
          </div>

          {/* 전송 완료 상태 */}
          {submitted ? (
            <div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl mb-6">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      요청 접수됨
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      {successMessage}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setLoginId('');
                  setSuccessMessage('');
                }}
                className="w-full py-3 px-4 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                다른 아이디로 다시 요청하기
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="loginId"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  아이디
                </label>
                <input
                  id="loginId"
                  type="text"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  disabled={isLoading}
                  required
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                            focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                            disabled:opacity-50 disabled:cursor-not-allowed
                            transition-all duration-200
                            placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="가입 시 사용한 아이디를 입력하세요"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  관리자가 본인 확인 후 승인하면, 새 비밀번호를 설정할 수 있는 링크를 안내받게
                  됩니다.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 mt-2
                          bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                          text-white font-semibold rounded-lg
                          shadow-sm hover:shadow-md
                          active:scale-[0.98]
                          transition-all duration-150
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                          flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="opacity-25"
                      ></circle>
                      <path
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        className="opacity-75"
                      ></path>
                    </svg>
                    <span>요청 중...</span>
                  </>
                ) : (
                  <span>초기화 요청하기</span>
                )}
              </button>
            </form>
          )}

          {/* 로그인 링크 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              비밀번호가 기억나셨나요?{' '}
              <Link
                to="/"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors"
              >
                로그인
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} {settings.siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PasswordResetRequest;
