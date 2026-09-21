// 공격받는 동안 퇴근 버튼을 성가시게 만든다.
// 막지는 않는다: disabled 를 걸지 않고, 덮개는 pointer-events:none 이며 키보드로는 언제나 눌린다.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../../utils/animations';

/** 연출 하나가 유지되는 시간. 공격이 쌓이면 짧아진다(switchMs). */
const SWITCH_MS = 700;

/** 쌓인 공격 수(level)에 따른 사나움. 연출 주기와 회피 확률을 정한다. */
function switchMs(level: number): number {
  return Math.max(300, SWITCH_MS - 45 * (level - 1));
}
function fleeMiss(level: number): number {
  return Math.max(0.06, FLEE_MISS - 0.01 * (level - 1));
}

type Effect = 'calm' | 'dodge' | 'shake' | 'vanish' | 'blackout';

// 자리 순서를 바꾸지 말 것. 테스트가 Math.random 값으로 연출을 고른다.
const EFFECTS: Effect[] = ['calm', 'dodge', 'shake', 'vanish', 'blackout'];

/** 이 연출로 바뀔 때 자리를 옮긴다 */
const MOVES = new Set<Effect>(['dodge', 'vanish', 'blackout']);

/** 카드 가장자리에서 떨어져 멈출 여백 */
const EDGE = 12;

/** 마우스를 대도 이 비율만큼은 달아나지 않는다. 끈질기게 노리면 잡혀야 한다. */
const FLEE_MISS = 0.15;

type Offset = { x: number; y: number };

/** 카드([data-chaos-bounds]) 안에 버튼이 온전히 남는 범위의 한 점. 잴 수 없으면 null. */
function pointInBounds(home: HTMLElement | null): Offset | null {
  const bounds = home?.closest<HTMLElement>('[data-chaos-bounds]');
  if (!home || !bounds) return null;
  const b = bounds.getBoundingClientRect();
  const r = home.getBoundingClientRect();
  if (b.width === 0 || r.width === 0) return null;

  const minX = b.left + EDGE - r.left;
  const maxX = b.right - EDGE - r.right;
  const minY = b.top + EDGE - r.top;
  const maxY = b.bottom - EDGE - r.bottom;
  if (maxX < minX || maxY < minY) return null;

  return {
    x: Math.round(minX + Math.random() * (maxX - minX)),
    y: Math.round(minY + Math.random() * (maxY - minY)),
  };
}

/** 카드를 잴 수 없을 때 쓰는 좁은 기본 범위. 오른쪽으로는 가지 않는다(잘리면 클릭도 못 받는다). */
function randomOffset() {
  return {
    x: -Math.round(Math.random() * 96),
    y: Math.round((Math.random() - 0.5) * 36),
  };
}

export function ChaosButton({
  active,
  level = 1,
  children,
}: {
  active: boolean;
  /** 쌓인 공격 수(1~10) */
  level?: number;
  children: ReactNode;
}) {
  const [effect, setEffect] = useState<Effect>('calm');
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  // 버튼의 원래 자리. 움직이지 않는 바깥 껍데기라 여기서 재면 늘 제자리가 나온다.
  const homeRef = useRef<HTMLSpanElement>(null);

  const calm = !active;
  // 움직임 줄이기 설정에서는 '움직이는 모습' 만 뺀다. 자리는 그대로 바뀐다.
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (calm) {
      setEffect('calm');
      setOffset({ x: 0, y: 0 });
      return;
    }
    const pick = () => {
      const rolled = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
      // 떨기는 제자리에서 움직이는 모습 그 자체라, 움직임을 줄인 사람에게는 도망으로 바꾼다
      const next = reduced && rolled === 'shake' ? 'dodge' : rolled;
      setEffect(next);
      // 도망·사라지기·암전 때 자리를 옮긴다. 제자리로 되돌리지는 않는다(그 자리만 노리면 되므로).
      if (MOVES.has(next)) setOffset(pointInBounds(homeRef.current) ?? randomOffset());
    };
    pick();
    const id = window.setInterval(pick, switchMs(level));
    return () => window.clearInterval(id);
  }, [calm, level, reduced]);

  // 달아날 때는 후보 셋 중 지금 자리에서 가장 먼 곳으로 간다.
  const flee = useCallback(() => {
    if (calm) return;
    if (Math.random() < fleeMiss(level)) return;
    setEffect('dodge');
    setOffset(prev => {
      const candidates = [0, 1, 2].map(() => pointInBounds(homeRef.current) ?? randomOffset());
      const far = (o: Offset) => (o.x - prev.x) ** 2 + (o.y - prev.y) ** 2;
      return candidates.reduce((best, o) => (far(o) > far(best) ? o : best));
    });
  }, [calm, level]);

  if (calm) return <>{children}</>;

  return (
    <span ref={homeRef} className="relative inline-flex">
      <span
        onMouseEnter={flee}
        // 터치는 닿는 순간 달아난다. 마우스와 같은 비율로 봐주므로 끝내 눌린다.
        onPointerDown={e => {
          if (e.pointerType !== 'mouse') flee();
        }}
        className={effect === 'shake' ? 'animate-chaosShake' : undefined}
        style={{
          display: 'inline-flex',
          // 숫자·글자 위를 지나가므로 그 위에 떠 있어야 눌린다.
          position: 'relative',
          zIndex: 10,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          // 멀리 가므로 조금 길게 준다.
          transition: reduced
            ? 'none'
            : 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms linear',
          // 사라져도 자리는 지킨다. 레이아웃이 들썩이면 옆 버튼까지 같이 흔들린다.
          opacity: effect === 'vanish' ? 0 : 1,
        }}
      >
        {/* 감지 영역. 버튼에 닿기 전에 달아나게 한다. 버튼보다 아래층(-z-10)이라 클릭은 가리지 않는다. */}
        <span data-chaos-halo aria-hidden className="absolute -inset-5 -z-10 rounded-2xl" />
        {children}
        {effect === 'blackout' && (
          // 눈만 가린다. 클릭은 통과한다. 버튼과 함께 움직이는 껍데기 안에 둬야 달아난 버튼을 가린다.
          <span
            data-chaos-blackout
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-xl bg-slate-900/95"
          />
        )}
      </span>
    </span>
  );
}
