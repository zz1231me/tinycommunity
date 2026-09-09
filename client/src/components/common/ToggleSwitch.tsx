// client/src/components/common/ToggleSwitch.tsx
// on/off 스위치.
//
// 기능 설정(관리자)과 알림 설정(사용자)이 같은 모양을 따로 들고 있었다.
// 같은 것이 두 벌이면 한쪽만 고쳐져 서서히 어긋난다 — 접근성 속성처럼
// 눈에 안 보이는 부분에서 특히 그렇다.

interface Props {
  checked: boolean;
  /** 스크린리더가 읽을 이름 — 무엇을 켜고 끄는지 */
  label: string;
  disabled?: boolean;
  /** 켜면 서비스가 멈추는 종류(점검 모드 등)는 빨강으로 구분한다 */
  tone?: 'primary' | 'danger';
  onChange: (next: boolean) => void;
  id?: string;
}

export function ToggleSwitch({
  checked,
  label,
  disabled = false,
  tone = 'primary',
  onChange,
  id,
}: Props) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? tone === 'danger'
            ? 'bg-red-600'
            : 'bg-primary-600'
          : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
