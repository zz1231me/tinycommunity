// client/src/pages/LoginTwoFactor.tsx - 2FA 로그인 검증 페이지
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { verifyLogin2FA } from '../api/twoFactor';

export default function LoginTwoFactor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const state = location.state as { tempToken?: string; userId?: string } | null;
  const tempToken = state?.tempToken;
  const userId = state?.userId;

  useEffect(() => {
    // tempToken이 없으면 로그인 페이지로
    if (!tempToken || !userId) {
      navigate('/', { replace: true });
    }
  }, [tempToken, userId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || token.length !== 6) {
      setError('6자리 인증 코드를 입력해주세요.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const response = await verifyLogin2FA(tempToken!, token);
      // sendSuccess 구조: axios res.data → { success, data: { user, tokenInfo } }
      const payload = response.data ?? response;

      // 사용자 정보 설정
      if (payload.user) {
        setUser(payload.user, payload.tokenInfo);
      }

      // 강제 비밀번호 변경 대상이면 변경 페이지로, 아니면 대시보드로 (Login.tsx와 동일 분기)
      navigate(payload.user?.mustChangePassword ? '/change-password' : '/dashboard', {
        replace: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.message || '인증 코드가 올바르지 않습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-8">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl">🔐</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">2단계 인증</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Authenticator 앱의 6자리 코드를 입력하세요
            </p>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                인증 코드
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                className="
                  w-full px-4 py-4 text-center text-2xl font-mono tracking-[0.5em]
                  border-2 border-slate-200 dark:border-slate-600 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                  bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                  transition-all duration-200
                "
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || token.length !== 6}
              className="
                w-full py-4 px-6 text-white font-semibold rounded-xl
                bg-primary-600 hover:bg-primary-700
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
              "
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  인증 중...
                </div>
              ) : (
                '인증하기'
              )}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="
                w-full py-3 px-6 text-slate-700 dark:text-slate-300 font-medium rounded-xl
                bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
                transition-all duration-200
              "
            >
              취소
            </button>
          </form>

          {/* 도움말 */}
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              💡 코드를 확인하려면 Google Authenticator, Authy, 또는
              <br />
              다른 TOTP 앱을 열어 코드를 확인하세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
