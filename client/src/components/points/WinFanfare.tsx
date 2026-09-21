// client/src/components/points/WinFanfare.tsx
// 대결에서 이겼을 때 잠깐 터지는 축하.
//
// 이겨도 초록 토스트 한 줄이 전부라 너무 심심했다. 이기는 순간은 이 기능에서 제일
// 기분 좋은 자리라, 눈에 보이는 보상을 준다.
//
// 화면을 막지는 않는다(클릭은 통과시킨다) — 이긴 뒤 바로 한마디를 쓰러 가는 길이
// 막히면 안 된다. 움직임을 줄여 달라고 한 사람에게는 흩날리는 조각 없이 글자만 띄운다.

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

  // 조각마다 다른 자리·색·기울기. 한 번만 뽑는다 — 매 렌더마다 뽑으면 제자리에서 떤다.
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
      // 축하일 뿐이라 낭독기에는 감춘다 — 이겼다는 말은 토스트가 이미 한다
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
      {/* 알림 띠가 함께 떠 있을 수 있다 — 그 아래에 앉게 여유를 둔다 */}
      <div className="animate-winPop mt-16 rounded-2xl bg-slate-900/85 px-5 py-2.5 text-center text-white shadow-xl backdrop-blur-sm dark:bg-slate-100/90 dark:text-slate-900">
        <div className="text-lg font-extrabold">🎉 이겼습니다!</div>
        <div className="text-sm font-semibold tabular-nums">+{amount.toLocaleString()}P</div>
      </div>
    </div>
  );
}
