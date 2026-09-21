// 대결에서 이겼을 때의 축하 연출. 클릭은 통과시키고, 움직임 줄이기에서는 글자만 띄운다.

import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '../../utils/animations';

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];
const PIECES = 26;
/** 조각이 다 떨어지고 글자가 사라지기까지 */
const LIFE_MS = 1800;

export function WinFanfare({ amount, onDone }: { amount: number; onDone: () => void }) {
  const [gone, setGone] = useState(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const id = window.setTimeout(() => {
      setGone(true);
      onDone();
    }, LIFE_MS);
    return () => window.clearTimeout(id);
  }, [onDone]);

  // 매 렌더마다 뽑으면 조각이 제자리에서 떨리므로 한 번만 뽑는다.
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.round((i / PIECES) * 100 + (Math.random() * 6 - 3)),
        delay: Math.round(Math.random() * 350),
        drift: Math.round(Math.random() * 80 - 40),
        spin: Math.round(Math.random() * 540 + 180),
        color: COLORS[i % COLORS.length],
        square: i % 3 === 0,
      })),
    []
  );

  if (gone) return null;

  return (
    <div
      // 이겼다는 말은 토스트가 하므로 낭독기에는 감춘다.
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-14 z-toast flex justify-center overflow-hidden"
    >
      {!reduced && (
        <div className="absolute inset-x-0 top-0 h-40">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="animate-confettiFall absolute top-0 block h-2 w-1.5"
              style={{
                left: `${p.left}%`,
                backgroundColor: p.color,
                borderRadius: p.square ? 1 : 9999,
                animationDelay: `${p.delay}ms`,
                ['--confetti-x' as string]: `${p.drift}px`,
                ['--confetti-spin' as string]: `${p.spin}deg`,
              }}
            />
          ))}
        </div>
      )}
      {/* 알림 띠가 함께 떠 있을 수 있어 그 아래에 앉게 여유를 둔다 */}
      <div className="animate-winPop mt-16 rounded-2xl bg-slate-900/85 px-5 py-2.5 text-center text-white shadow-xl backdrop-blur-sm dark:bg-slate-100/90 dark:text-slate-900">
        <div className="text-lg font-extrabold">🎉 이겼습니다!</div>
        <div className="text-sm font-semibold tabular-nums">+{amount.toLocaleString()}P</div>
      </div>
    </div>
  );
}
