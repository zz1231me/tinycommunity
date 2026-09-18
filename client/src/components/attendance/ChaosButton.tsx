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

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../../utils/animations';

/** 연출 한 가지가 유지되는 시간 */
const SWITCH_MS = 1200;

type Effect = 'calm' | 'dodge' | 'shake' | 'vanish' | 'blackout';

// 'calm' 을 섞어 둔다. 계속 몰아치면 그냥 화만 나고, 가끔 멀쩡해야 노려서 누르는 맛이 있다.
// shake 는 제자리에서 부르르 떤다 — 자리를 지키므로 노리기는 쉽지만 손이 멈칫한다.
// (자리 순서를 바꾸지 말 것. 테스트가 Math.random 값으로 연출을 골라 본다.)
const EFFECTS: Effect[] = ['calm', 'dodge', 'shake', 'vanish', 'blackout'];

/**
 * 달아날 거리.
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

export function ChaosButton({ active, children }: { active: boolean; children: ReactNode }) {
  const [effect, setEffect] = useState<Effect>('calm');
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // 움직임을 줄여 달라고 설정한 사람에게는 연출을 걸지 않는다.
  // 그 설정을 켠 사람에게 이건 재미가 아니라 그냥 못 쓰는 화면이다.
  const calm = !active || prefersReducedMotion();

  useEffect(() => {
    if (calm) {
      setEffect('calm');
      setOffset({ x: 0, y: 0 });
      return;
    }
    const pick = () => {
      const next = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
      setEffect(next);
      setOffset(next === 'dodge' ? randomOffset() : { x: 0, y: 0 });
    };
    pick();
    const id = window.setInterval(pick, SWITCH_MS);
    return () => window.clearInterval(id);
  }, [calm]);

  // 다가가면 달아난다 — 연출 중에서도 이게 제일 약 오른다
  const flee = useCallback(() => {
    if (calm) return;
    setEffect('dodge');
    setOffset(randomOffset());
  }, [calm]);

  if (calm) return <>{children}</>;

  return (
    <span className="relative inline-flex">
      <span
        onMouseEnter={flee}
        className={effect === 'shake' ? 'animate-chaosShake' : undefined}
        style={{
          display: 'inline-flex',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: 'transform 160ms ease-out, opacity 160ms linear',
          // 사라져도 자리는 지킨다. 레이아웃이 들썩이면 옆 버튼까지 같이 흔들린다.
          opacity: effect === 'vanish' ? 0 : 1,
        }}
      >
        {children}
      </span>

      {effect === 'blackout' && (
        // 눈만 가린다. 클릭은 그대로 통과한다.
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-3 rounded-xl bg-slate-900/95"
        />
      )}
    </span>
  );
}
