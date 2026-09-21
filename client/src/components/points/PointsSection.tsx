// 포인트 탭의 판들이 함께 쓰는 틀. 판 구분은 색과 아이콘으로만 한다.

import type { ReactNode } from 'react';

const TONE = {
  amber: 'from-amber-400 to-orange-500 shadow-amber-500/30',
  violet: 'from-violet-500 to-fuchsia-500 shadow-violet-500/30',
  rose: 'from-rose-500 to-pink-500 shadow-rose-500/30',
  gold: 'from-yellow-400 to-amber-500 shadow-yellow-500/30',
  slate: 'from-slate-500 to-slate-700 shadow-slate-500/30',
} as const;

export type SectionTone = keyof typeof TONE;

export function PointsSection({
  icon,
  tone,
  title,
  badge,
  description,
  children,
}: {
  icon: ReactNode;
  tone: SectionTone;
  title: string;
  /** 제목 옆에 붙일 뱃지. */
  badge?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
        <span
          aria-hidden
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md ${TONE[tone]}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
            {badge}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
