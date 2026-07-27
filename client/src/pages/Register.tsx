// client/src/pages/Register.tsx - 보안 강화된 회원가입 페이지 (role 선택 제거)
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  Eye,
  EyeOff,
  UserPlus,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { register } from '../api/auth';
import { useSiteSettings } from '../store/siteSettings';
import { logger } from '../utils/logger';
import { PasswordRequirements } from '../components/common/PasswordRequirements';

function Register() {
  const { settings } = useSiteSettings();
  const navigate = useNavigate();

  // ✅ role 필드 제거 - 보안상 클라이언트에서 역할 선택 불가
  const [formData, setFormData] = useState({
    id: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '', // ✅ 이메일 필드 추가 (선택사항)
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [error]);

  // 검증 실패 시 해당 input에 포커스 + 스크롤. 사용자가 어느 필드를 고쳐야 하는지 즉시 알 수 있도록.
  const failWith = (message: string, fieldId: string) => {
    setError(message);
    const el = document.getElementById(fieldId) as HTMLInputElement | null;
    if (el) {
      el.focus({ preventScroll: false });
      el.setAttribute('aria-invalid', 'true');
    }
    return;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // 이전에 invalid 표시된 필드 모두 초기화
    ['id', 'name', 'email', 'password', 'confirmPassword'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.removeAttribute('aria-invalid');
    });

    // ✅ 강화된 클라이언트 검증
    if (!formData.id.trim() || formData.id.length < 4 || formData.id.length > 20) {
      return failWith('아이디는 4-20자 사이여야 합니다.', 'id');
    }

    // ✅ 서버와 동일한 ID 형식 검증 (영문, 숫자, 언더스코어만 허용)
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(formData.id)) {
      return failWith('아이디는 영문자, 숫자, 언더스코어(_)만 사용 가능합니다.', 'id');
    }

    if (!formData.name.trim() || formData.name.length < 2 || formData.name.length > 10) {
      return failWith('이름은 2-10자 사이여야 합니다.', 'name');
    }

    if (formData.password.length < settings.minPasswordLength) {
      return failWith(`비밀번호는 ${settings.minPasswordLength}자 이상이어야 합니다.`, 'password');
    }

    // ✅ 비밀번호 복잡도 검증 (관리자 설정 기반)
    if (settings.requireUppercase && !/[A-Z]/.test(formData.password)) {
      return failWith('비밀번호는 영문 대문자를 포함해야 합니다.', 'password');
    }
    if (settings.requireLowercase && !/[a-z]/.test(formData.password)) {
      return failWith('비밀번호는 영문 소문자를 포함해야 합니다.', 'password');
    }
    if (settings.requireNumberOrSpecial && !/[0-9!@#$%^&*]/.test(formData.password)) {
      return failWith('비밀번호는 숫자 또는 특수문자(!@#$%^&*)를 포함해야 합니다.', 'password');
    }

    if (formData.password !== formData.confirmPassword) {
      return failWith('비밀번호가 일치하지 않습니다.', 'confirmPassword');
    }

    // ✅ 이메일 검증 (선택사항)
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return failWith('올바른 이메일 형식이 아닙니다.', 'email');
    }

    setIsLoading(true);

    try {
      // ✅ role 필드 제거 - 서버에서 자동으로 'guest' 역할 부여
      const regData = await register(
        formData.id,
        formData.password,
        formData.name,
        formData.email || undefined
      );
      const serverMessage = regData.message || '회원가입이 완료되었습니다.';

      logger.success('회원가입 성공');

      navigate('/', {
        replace: true,
        state: {
          message: serverMessage,
          type: regData.data?.status === 'pending_approval' ? 'pending' : 'active',
          registeredId: formData.id,
          showApprovalInfo: regData.data?.status === 'pending_approval',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '회원가입 중 오류가 발생했습니다.';
      logger.error('회원가입 실패', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-md">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">회원가입 실패</p>
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
                <Building2 className="w-10 h-10 text-white" />
              </div>
            )}

            <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-white">
              {settings.siteName} 회원가입
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">새 계정을 만들어보세요</p>
            {/* ✅ 승인 시스템 안내 추가 */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 회원가입 후 관리자 승인을 받아야 로그인할 수 있습니다
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 사용자 ID */}
            <div>
              <label
                htmlFor="id"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                사용자 ID *
              </label>
              <input
                id="id"
                type="text"
                value={formData.id}
                onChange={e => handleChange('id', e.target.value)}
                disabled={isLoading}
                required
                minLength={4}
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                          focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                          disabled:opacity-50 disabled:cursor-not-allowed
                          transition-all duration-200
                          placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="영문, 숫자 4-20자"
                pattern="[a-zA-Z0-9_]{4,20}"
                title="영문자, 숫자, 언더스코어(_)만 사용 가능 (4-20자)"
              />
            </div>

            {/* 이름 */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                이름 *
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={e => handleChange('name', e.target.value)}
                disabled={isLoading}
                required
                minLength={2}
                maxLength={10}
                className="w-full px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                          focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                          disabled:opacity-50 disabled:cursor-not-allowed
                          transition-all duration-200
                          placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="실명 2-10자"
              />
            </div>

            {/* ✅ 이메일 추가 (선택사항) */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                이메일 (선택사항)
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => handleChange('email', e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                          focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                          disabled:opacity-50 disabled:cursor-not-allowed
                          transition-all duration-200
                          placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="이메일@example.com (선택)"
              />
            </div>

            {/* 비밀번호 */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                비밀번호 *
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={e => handleChange('password', e.target.value)}
                  disabled={isLoading}
                  required
                  minLength={settings.minPasswordLength}
                  className="w-full pl-4 pr-12 py-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                            focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                            disabled:opacity-50 disabled:cursor-not-allowed
                            transition-all duration-200
                            placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder={`${settings.minPasswordLength}자 이상, 대소문자+숫자/특수문자 포함`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* 비밀번호 실시간 체크리스트 — 어느 조건을 못 채웠는지 즉시 확인 */}
              {formData.password.length > 0 && (
                <div className="mt-2">
                  <PasswordRequirements password={formData.password} />
                </div>
              )}
            </div>

            {/* 비밀번호 확인 */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                비밀번호 확인 *
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={e => handleChange('confirmPassword', e.target.value)}
                  disabled={isLoading}
                  required
                  className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100
                            focus:bg-slate-50 dark:focus:bg-slate-600 focus:ring-2 focus:ring-primary-500/40
                            disabled:opacity-50 disabled:cursor-not-allowed
                            transition-all duration-200
                            placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="비밀번호를 다시 입력"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
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
                        focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                        flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>가입 중...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>회원가입 신청</span>
                </>
              )}
            </button>

            {/* ✅ 승인 프로세스 안내 */}
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
                    승인 프로세스
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                    1. 회원가입 → 2. 관리자 검토 → 3. 역할 부여 → 4. 로그인 가능
                  </p>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              이미 계정이 있으신가요?{' '}
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

export default Register;
