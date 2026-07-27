import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'warning';
  id?: string;
}

const TRACK_COLORS = {
  primary: 'peer-checked:bg-primary-600',
  danger: 'peer-checked:bg-red-600',
  warning: 'peer-checked:bg-yellow-500',
};

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  variant = 'primary',
  id,
}) => {
  // Always call useId unconditionally (Rules of Hooks) — use prop to override
  const generatedId = React.useId();
  const uid = id ?? generatedId;

  return (
    <label
      htmlFor={uid}
      className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} select-none`}
    >
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          id={uid}
          type="checkbox"
          checked={checked}
          onChange={e => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        {/* Track */}
        <div
          className={`w-11 h-6 rounded-full bg-slate-200 dark:bg-slate-600 transition-colors duration-200 ${TRACK_COLORS[variant]}`}
        />
        {/* Thumb */}
        <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-5" />
      </div>

      {(label || description) && (
        <div className="leading-tight">
          {label && <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>}
          {description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
      )}
    </label>
  );
};
