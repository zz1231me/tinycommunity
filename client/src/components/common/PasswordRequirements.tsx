// client/src/components/common/PasswordRequirements.tsx
// 비밀번호 작성 시 실시간 체크리스트 — 사용자가 어느 조건을 못 채웠는지 즉시 확인.
// Register / ResetPassword / Profile(비밀번호 변경) 등에서 재사용.

import { useSiteSettings } from '../../store/siteSettings';

interface PasswordRequirementsProps {
  password: string;
}

export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({ password }) => {
  const { settings } = useSiteSettings();

  const checks: Array<{ key: string; label: string; passed: boolean }> = [
    {
      key: 'len',
      label: `${settings.minPasswordLength}자 이상`,
      passed: password.length >= settings.minPasswordLength,
    },
  ];
  if (settings.requireUppercase) {
    checks.push({ key: 'upper', label: '영문 대문자 포함', passed: /[A-Z]/.test(password) });
  }
  if (settings.requireLowercase) {
    checks.push({ key: 'lower', label: '영문 소문자 포함', passed: /[a-z]/.test(password) });
  }
  if (settings.requireNumberOrSpecial) {
    checks.push({
      key: 'numspec',
      label: '숫자 또는 특수문자(!@#$%^&*) 포함',
      passed: /[0-9!@#$%^&*]/.test(password),
    });
  }

  return (
    <div
      role="list"
      aria-label="비밀번호 요구 사항"
      className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs text-slate-500 dark:text-slate-400 space-y-1"
    >
      {checks.map(c => (
        <div
          key={c.key}
          role="listitem"
          className={`flex items-center gap-2 ${
            c.passed ? 'text-green-600 dark:text-green-400' : ''
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] ${
              c.passed
                ? 'bg-green-500 text-white'
                : 'bg-slate-300 dark:bg-slate-600 text-transparent'
            }`}
          >
            ✓
          </span>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  );
};
