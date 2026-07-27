// client/src/pages/ChangePassword.tsx
// 관리자 초기화 후 강제 비밀번호 변경 페이지. 임시 비밀번호(123456)로 로그인하면
// ProtectedRoute가 이 페이지로 강제 이동시키고, 변경 완료 전까지 다른 화면 접근이 막힌다.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useSiteSettings } from '../store/siteSettings';
import { changePassword } from '../api/auth';
import { toast } from '../utils/toast';

const ChangePassword = () => {
  const navigate = useNavigate();
  const { isAuthenticated, getUser, clearUser } = useAuth();
  const { settings } = useSiteSettings();
  const mustChange = getUser()?.mustChangePassword;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 강제 변경 대상이 아니면(이미 변경했거나 일반 접근) 대시보드로
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!mustChange) return <Navigate to="/dashboard" replace />;

  const validate = (pw: string): string | null => {
    if (pw.length < settings.minPasswordLength)
      return `비밀번호는 ${settings.minPasswordLength}자 이상이어야 합니다.`;
    if (settings.requireUppercase && !/[A-Z]/.test(pw)) return '영문 대문자를 포함해야 합니다.';
    if (settings.requireLowercase && !/[a-z]/.test(pw)) return '영문 소문자를 포함해야 합니다.';
    if (settings.requireNumberOrSpecial && !/[0-9!@#$%^&*]/.test(pw))
      return '숫자 또는 특수문자(!@#$%^&*)를 포함해야 합니다.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    if (!current) return setError('임시 비밀번호를 입력해주세요.');
    const v = validate(next);
    if (v) return setError(v);
    if (next !== confirm) return setError('새 비밀번호가 일치하지 않습니다.');
    if (next === current) return setError('임시 비밀번호와 다른 비밀번호를 설정해주세요.');

    setSubmitting(true);
    try {
      await changePassword(current, next);
      // 변경 시 서버가 tokenVersion을 증가시켜 현재 세션이 무효화됨 → 새 비밀번호로 재로그인 유도
      clearUser();
      toast.success('비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.');
      navigate('/', { replace: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-[400px]">
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 rounded-xl">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            비밀번호 변경이 필요합니다
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
            관리자가 비밀번호를 초기화했습니다. 계속하려면 새 비밀번호를 설정해주세요.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4"
        >
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">새 비밀번호 설정</h1>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <input
            type="password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            placeholder="임시 비밀번호"
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          />
          <input
            type="password"
            value={next}
            onChange={e => setNext(e.target.value)}
            placeholder={`새 비밀번호 (${settings.minPasswordLength}자 이상${settings.requireUppercase ? ', 대문자' : ''}${settings.requireLowercase ? ', 소문자' : ''}${settings.requireNumberOrSpecial ? ', 숫자/특수문자' : ''} 포함)`}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          />
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="새 비밀번호 확인"
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;
