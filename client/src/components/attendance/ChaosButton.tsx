// client/src/components/attendance/ChaosButton.tsx
// 공격받는 동안 퇴근 버튼을 성가시게 만든다.
//
// ⚠️ 막지는 않는다. 이 안의 버튼은 끝까지 살아 있다 —
//   · disabled 를 걸지 않는다
//   · 가리는 덮개는 pointer-events:none 이라 그 위를 눌러도 버튼에 닿는다
//   · 키보드(Tab → Enter)로는 연출과 상관없이 언제나 눌린다
//
// 그래서 끈질기게 누르면 반드시 눌리고, 기록되는 시각은 그 순간 그대로다.
// '누르기 성가시다' 와 '누를 수 없다' 사이의 선을 넘지 않기 위한 장치다.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../../utils/animations';

/**
 * 연출 한 가지가 유지되는 시간 — 공격이 하나일 때. 쌓일수록 짧아진다(switchMs).
 * (1.2초였을 때는 사람이 느긋하게 노려 누를 수 있었다.)
 */
const SWITCH_MS = 700;

/**
 * 쌓인 공격 수(level)에 따른 사나움.
 *  - 연출이 더 자주 바뀐다: 0.7초 → 한 개 쌓일 때마다 0.045초씩, 최소 0.3초
 *  - 마우스를 대도 안 달아나는 비율이 준다: 15% → 한 개마다 1%씩, 최소 6%
 *    (0 으로는 내리지 않는다 — 끈질기면 잡혀야 '못 누르게' 가 되지 않는다)
 */
function switchMs(level: number): number {
  return Math.max(300, SWITCH_MS - 45 * (level - 1));
}
function fleeMiss(level: number): number {
  return Math.max(0.06, FLEE_MISS - 0.01 * (level - 1));
}

type Effect = 'calm' | 'dodge' | 'shake' | 'vanish' | 'blackout';

// 'calm' 을 섞어 둔다. 계속 몰아치면 그냥 화만 나고, 가끔 멀쩡해야 노려서 누르는 맛이 있다.
// shake 는 제자리에서 부르르 떤다 — 자리를 지키므로 노리기는 쉽지만 손이 멈칫한다.
// (자리 순서를 바꾸지 말 것. 테스트가 Math.random 값으로 연출을 골라 본다.)
const EFFECTS: Effect[] = ['calm', 'dodge', 'shake', 'vanish', 'blackout'];

/** 이 연출로 바뀔 때 자리를 옮긴다 */
const MOVES = new Set<Effect>(['dodge', 'vanish', 'blackout']);

/** 카드 가장자리에서 이만큼은 떨어져 멈춘다 — 딱 붙으면 모서리에 반쯤 걸쳐 보인다 */
const EDGE = 12;

/**
 * 마우스를 대도 이 비율만큼은 달아나지 않는다.
 *
 * 카드 전체를 쓰게 되면서 매번 달아나면 마우스로는 영영 누를 수 없다. 그러면
 * '성가시게' 가 '못 누르게' 가 된다 — 끈질기게 노리면 잡혀야 한다.
 */
const FLEE_MISS = 0.15;

type Offset = { x: number; y: number };

/**
 * 카드 안에서 갈 수 있는 곳 중 한 점.
 *
 * 버튼을 감싼 카드([data-chaos-bounds])의 경계와 버튼의 원래 자리를 재서, 버튼이 카드
 * 안에 온전히 남는 범위에서 고른다. 카드는 overflow-hidden 이라 밖으로 나가면 잘리고,
 * 잘린 자리는 클릭도 받지 않는다.
 *
 * 잴 수 없으면(카드가 없거나 크기가 0 — 테스트 환경 등) null. 그때는 좁은 기본 범위를 쓴다.
 */
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

/**
 * 좁은 기본 범위 — 카드를 잴 수 없을 때만 쓴다.
 *
 * 오른쪽으로는 가지 않는다. 이 버튼은 카드(overflow-hidden) 의 오른쪽 끝에 붙어 있어서
 * 바깥으로 밀리면 잘려 나가고, 잘린 자리는 그려지지 않을 뿐 아니라 마우스 클릭도
 * 받지 못한다. 그러면 '성가시게' 가 '못 누르게' 로 바뀐다 — 이 파일이 지키기로 한 선을
 * 넘는 것이라, 안쪽(왼쪽)과 위아래로만 움직인다.
 */
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
  // 움직임을 줄여 달라고 설정한 사람에게는 '움직이는 모습' 만 뺀다 — 미끄러지듯 가는 대신
  // 순간이동하고, 부르르 떨지 않는다. 자리는 그대로 바뀐다.
  //
  // 예전에는 이 설정이면 연출을 통째로 껐다. 그런데 이 설정은 윈도 '애니메이션 효과' 끄기,
  // 성능 우선 모드, 원격 데스크톱에서도 켜진다 — 회사 PC 에 흔하다. 경고 띠는 공격받았다고
  // 하는데 버튼은 멀쩡해서 '공격이 작동하지 않는다' 로 보였다. 순간이동은 움직임에 민감한
  // 사람에게 문제가 되는 '움직이는 모습' 이 아니다.
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
      // 도망·사라지기·암전 때 자리를 옮긴다 — 사라졌다가 다른 데서 나타나고, 가려진 채로
      // 옮겨 간다. 예전에는 도망(다섯 중 하나) 때만 옮겨, 평균 3~4초에 한 번 움직일 뿐이라
      // '움직이지 않는다' 로 보였다.
      // 평온·떨기 때는 제자리를 지킨다. 제자리로 '되돌리지는' 않는다 — 되돌리면 달아났던
      // 버튼이 원래 자리로 순간이동해, 그 자리만 노리면 됐다. 제자리는 공격이 끝날 때 돌아간다.
      if (MOVES.has(next)) setOffset(pointInBounds(homeRef.current) ?? randomOffset());
    };
    pick();
    const id = window.setInterval(pick, switchMs(level));
    return () => window.clearInterval(id);
  }, [calm, level, reduced]);

  // 다가가면 달아난다 — 연출 중에서도 이게 제일 약 오른다
  // 달아날 때는 후보 셋 중 지금 자리에서 가장 먼 곳으로 간다 — 바로 옆으로 비키면 다시 잡힌다.
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
        // 터치에는 '다가감' 이 없다 — 손가락이 닿는 순간 달아난다. 누르고 떼는 사이에 버튼이
        // 자리를 옮겨 클릭이 성립하지 않는다. 마우스와 같은 비율로 봐주므로 끝내 눌린다.
        onPointerDown={e => {
          if (e.pointerType !== 'mouse') flee();
        }}
        className={effect === 'shake' ? 'animate-chaosShake' : undefined}
        style={{
          display: 'inline-flex',
          // 카드를 가로질러 다니며 숫자·글자 위를 지나간다 — 그 위에 떠 있어야 눌린다
          position: 'relative',
          zIndex: 10,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          // 멀리 가므로 조금 길게. 같은 시간이면 순간이동처럼 보여 따라갈 맛이 없다.
          transition: reduced
            ? 'none'
            : 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms linear',
          // 사라져도 자리는 지킨다. 레이아웃이 들썩이면 옆 버튼까지 같이 흔들린다.
          opacity: effect === 'vanish' ? 0 : 1,
        }}
      >
        {/* 감지 영역 — 버튼 둘레 20px. 여기에 마우스가 들어오면 버튼에 닿기 전에 달아난다.
            버튼에 정확히 닿아야 달아나던 때는 '빠르게 휙 가서 누르기' 가 통했다.
            보이지 않고, 버튼보다 아래층(-z-10)에 깔려 버튼 자체의 클릭은 가리지 않는다.
            (위치를 준 요소는 일반 요소보다 위에 그려지므로 z 를 내리지 않으면 버튼을 덮는다.
             움직이는 껍데기가 자체 쌓임 맥락(zIndex 10)이라 이 음수 z 는 그 안에서만 통한다.) */}
        <span data-chaos-halo aria-hidden className="absolute -inset-5 -z-10 rounded-2xl" />
        {children}
        {effect === 'blackout' && (
          // 눈만 가린다. 클릭은 그대로 통과한다.
          //
          // 버튼과 함께 움직이는 껍데기 안에 둔다. 바깥(원래 자리)에 두었을 때는 버튼이 달아나
          // 있으면 빈자리만 까맣게 가리고 버튼은 멀쩡히 보여, 이 연출이 아무 일도 하지 않았다.
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
