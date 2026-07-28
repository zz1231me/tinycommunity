// src/pages/PasswordResetRequest.tsx
// 비밀번호 찾기 — 2단계: ①아이디로 요청 → 6자리 인증번호 자동생성(관리자에게 표시)
//                    ②관리자에게 받은 인증번호 + 새 비밀번호 입력 → 변경
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset, verifyPasswordReset } from '../api/auth';
import { useSiteSettings } from '../store/siteSettings';

type Step = 'request' | 'verify' | 'done';

function PasswordResetRequest() {
  const { settings } = useSiteSettings();

  const [step, setStep] = useState<Step>('request');
  const [loginId, setLoginId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 에러는 6초 후 자동 소거
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = loginId.trim();
    if (!id) return setError('아이디를 입력해주세요.');
    setError('');
    setIsLoading(true);
    try {
      const res = await requestPasswordReset(id);
      setNotice(res.message);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setIsLoading(true);
    try {
      await requestPasswordReset(loginId.trim());
      setNotice('인증번호를 다시 발급했습니다. 관리자에게 새 인증번호를 확인해주세요.');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '재발급 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('인증번호 6자리를 입력해주세요.');
    if (!password) return setError('새 비밀번호를 입력해주세요.');
    if (password !== confirm) return setError('새 비밀번호가 일치하지 않습니다.');
    // 길이·복잡도는 서버 정책(minPasswordLength·대소문자·숫자/특수)이 검증 — 서버 메시지를 그대로 노출
    setError('');
    setIsLoading(true);
    try {
      await verifyPasswordReset(loginId.trim(), code, password);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 ' +
    'focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40 outline-none ' +
    'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ' +
    'placeholder:text-slate-400 dark:placeholder:text-slate-500';

  const primaryBtn =
    'w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-semibold ' +
    'rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2';

  const Spinner = () => (
    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        className="opacity-75"
      />
    </svg>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-md">
        {/* 알림 배너 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="card p-8">
          {/* 헤더 */}
          <div className="text-center mb-7">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.siteName}
                className="w-16 h-16 rounded-2xl object-cover mx-auto mb-5 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 bg-primary-600 rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-md">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
            )}
            <h1 className="text-2xl font-bold mb-1.5 text-slate-900 dark:text-white">비밀번호 찾기</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {step === 'request' && '아이디를 입력하면 관리자에게 인증번호가 표시됩니다'}
              {step === 'verify' && '관리자에게 받은 6자리 인증번호로 새 비밀번호를 설정하세요'}
              {step === 'done' && '비밀번호가 변경되었습니다'}
            </p>
          </div>

          {/* STEP 1 — 아이디 요청 */}
          {step === 'request' && (
            <form onSubmit={submitRequest} className="space-y-4">
              <div>
                <label htmlFor="loginId" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                  className={inputCls}
                  placeholder="가입 시 사용한 아이디"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  요청하면 6자리 인증번호가 만들어집니다. <b>관리자에게 인증번호를 문의</b>해 다음 단계에서 입력하세요.
                </p>
              </div>
              <button type="submit" disabled={isLoading} className={primaryBtn}>
                {isLoading ? (
                  <>
                    <Spinner />
                    <span>요청 중...</span>
                  </>
                ) : (
                  <span>인증번호 요청하기</span>
                )}
              </button>
            </form>
          )}

          {/* STEP 2 — 인증번호 + 새 비밀번호 */}
          {step === 'verify' && (
            <form onSubmit={submitVerify} className="space-y-4">
              {notice && (
                <div className="p-3 bg-secondary-50 dark:bg-secondary-900/20 border border-secondary-200 dark:border-secondary-800 rounded-xl">
                  <p className="text-xs text-secondary-700 dark:text-secondary-300">{notice}</p>
                </div>
              )}
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{loginId}</span> 계정 · 인증번호는 30분간 유효합니다.
              </div>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  인증번호 (6자리)
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={isLoading}
                  autoFocus
                  className={inputCls + ' text-center tracking-[0.5em] text-xl font-mono'}
                  placeholder="000000"
                />
              </div>

              <div>
                <label htmlFor="pw" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  새 비밀번호
                </label>
                <div className="relative">
                  <input
                    id="pw"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    className={inputCls + ' pr-12'}
                    placeholder="새 비밀번호"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showPw ? '숨기기' : '표시'}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="pw2" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  새 비밀번호 확인
                </label>
                <input
                  id="pw2"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                  className={inputCls}
                  placeholder="새 비밀번호를 다시 입력"
                />
                {confirm && password !== confirm && (
                  <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">비밀번호가 일치하지 않습니다.</p>
                )}
              </div>

              <button type="submit" disabled={isLoading} className={primaryBtn}>
                {isLoading ? (
                  <>
                    <Spinner />
                    <span>변경 중...</span>
                  </>
                ) : (
                  <span>비밀번호 변경</span>
                )}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={resend}
                  disabled={isLoading}
                  className="text-secondary-600 dark:text-secondary-400 hover:underline disabled:opacity-50"
                >
                  인증번호 재발급
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('request');
                    setCode('');
                    setPassword('');
                    setConfirm('');
                    setNotice('');
                  }}
                  className="text-slate-500 dark:text-slate-400 hover:underline"
                >
                  아이디 다시 입력
                </button>
              </div>
            </form>
          )}

          {/* STEP 3 — 완료 */}
          {step === 'done' && (
            <div className="space-y-5">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">비밀번호가 변경되었습니다</p>
                  <p className="text-sm text-green-700 dark:text-green-400 mt-1">새 비밀번호로 로그인해주세요.</p>
                </div>
              </div>
              <Link to="/" className={primaryBtn}>
                로그인하러 가기
              </Link>
            </div>
          )}

          {/* 로그인 링크 */}
          {step !== 'done' && (
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
          )}
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
