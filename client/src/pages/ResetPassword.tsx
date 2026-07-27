// src/pages/ResetPassword.tsx - 비밀번호 재설정 페이지 (토큰 기반)
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword as resetPasswordAPI } from '../api/auth';
import { useSiteSettings } from '../store/siteSettings';

function ResetPassword() {
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('유효하지 않은 재설정 링크입니다. 비밀번호 재설정을 다시 요청해주세요.');
    }
  }, [token]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 7000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [error]);

  const validatePassword = (pw: string): string | null => {
    if (pw.length < settings.minPasswordLength)
      return `비밀번호는 ${settings.minPasswordLength}자 이상이어야 합니다.`;
    if (settings.requireUppercase && !/[A-Z]/.test(pw))
      return '비밀번호는 영문 대문자를 포함해야 합니다.';
    if (settings.requireLowercase && !/[a-z]/.test(pw))
      return '비밀번호는 영문 소문자를 포함해야 합니다.';
    if (settings.requireNumberOrSpecial && !/[0-9!@#$%^&*]/.test(pw))
      return '비밀번호는 숫자 또는 특수문자(!@#$%^&*)를 포함해야 합니다.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('유효하지 않은 재설정 링크입니다.');
      return;
    }

    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (password !== passwordConfirm) {
      setError('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);

    try {
      await resetPasswordAPI(token, password);
      // 성공 시 로그인 페이지로 이동 (성공 메시지와 함께)
      navigate('/', {
        replace: true,
        state: {
          title: '비밀번호 변경 완료',
          message: '비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해주세요.',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '비밀번호 재설정에 실패했습니다.';
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
            )}

            <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">
              새 비밀번호 설정
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              새로운 비밀번호를 입력해주세요
            </p>
          </div>

          {/* 토큰이 없을 때 재요청 안내 */}
          {!token ? (
            <div className="text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                비밀번호 재설정 링크가 유효하지 않습니다.
              </p>
              <Link
                to="/password-reset-request"
                className="inline-flex items-center gap-2 py-2.5 px-6 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              >
                초기화 다시 요청하기
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 새 비밀번호 */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  새 비밀번호
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                    className="w-full pl-4 pr-12 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                              focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-all duration-200
                              placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    placeholder={`새 비밀번호 (${settings.minPasswordLength}자 이상${settings.requireUppercase ? ', 대문자' : ''}${settings.requireLowercase ? ', 소문자' : ''}${settings.requireNumberOrSpecial ? ', 숫자/특수문자' : ''} 포함)`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPassword ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label
                  htmlFor="passwordConfirm"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    id="passwordConfirm"
                    type={showPasswordConfirm ? 'text' : 'password'}
                    value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)}
                    disabled={isLoading}
                    required
                    className="w-full pl-4 pr-12 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                              focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-all duration-200
                              placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    placeholder="비밀번호를 다시 입력하세요"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                    aria-label={showPasswordConfirm ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPasswordConfirm ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 비밀번호 조건 안내 */}
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p
                  className={
                    password.length >= settings.minPasswordLength
                      ? 'text-green-600 dark:text-green-400'
                      : ''
                  }
                >
                  • {settings.minPasswordLength}자 이상
                </p>
                {settings.requireUppercase && (
                  <p className={/[A-Z]/.test(password) ? 'text-green-600 dark:text-green-400' : ''}>
                    • 대문자 포함
                  </p>
                )}
                {settings.requireLowercase && (
                  <p className={/[a-z]/.test(password) ? 'text-green-600 dark:text-green-400' : ''}>
                    • 소문자 포함
                  </p>
                )}
                {settings.requireNumberOrSpecial && (
                  <p
                    className={
                      /[0-9!@#$%^&*]/.test(password) ? 'text-green-600 dark:text-green-400' : ''
                    }
                  >
                    • 숫자 또는 특수문자(!@#$%^&*) 포함
                  </p>
                )}
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
                    <span>변경 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>비밀번호 변경</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* 로그인 링크 */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <Link
                to="/"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold transition-colors"
              >
                로그인 페이지로 돌아가기
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

export default ResetPassword;
