// client/src/components/attendance/AttendanceAttack.tsx
// 퇴근 공격을 '받는 쪽' 의 화면 — 경고 띠와 받은 쪽지.
//
// 보내는 쪽(공격권 사용)은 포인트 화면으로 옮겼다(components/points/AttackPanel).
// 포인트를 쓰는 일이니 포인트가 있는 곳에서 하는 편이 자연스럽고, 이 화면에는
// 방해받는 당사자에게 필요한 것만 남는다.
//
// ⚠️ 방해할 뿐 막지는 않는다. 서버의 퇴근 기록은 이 기능을 쳐다보지도 않고,
// 퇴근 버튼도 끝까지 살아 있다(ChaosButton 참고). 여기서 하는 일은
// '누르기 성가시게 만드는 것' 이지 '못 누르게 하는 것' 이 아니다.

import { useEffect, useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import type { IncomingAttack } from '../../api/attendance';

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/** 1초마다 남은 시간을 다시 센다. 0 이 되면 한 번만 알린다. */
function useCountdown(expiresAt: string, onDone: () => void): number {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    setLeft(secondsLeft(expiresAt));
    const id = window.setInterval(() => {
      const next = secondsLeft(expiresAt);
      setLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
        onDone();
      }
    }, 1000);
    return () => window.clearInterval(id);
    // onDone 이 매 렌더 새 함수여도 타이머를 다시 깔지 않는다 — 시각이 기준이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return left;
}

const KIND_FACE = { chaos: '🌀', hide: '🙈' } as const;

/** 방해받는 중임을 알리고, 방어권을 살 기회를 준다 */
export function AttackBanner({
  incoming,
  totalSeconds,
  defendCost,
  balance,
  defending,
  onDefend,
  onExpire,
}: {
  incoming: IncomingAttack;
  /**
   * 이 공격이 처음에 몇 초짜리였는가 — 남은 시간 막대의 기준.
   * 주지 않으면 처음 그릴 때 남아 있던 시간을 기준으로 삼는다.
   */
  totalSeconds?: number;
  defendCost: number;
  balance: number;
  defending: boolean;
  onDefend: () => void;
  onExpire: () => void;
}) {
  const left = useCountdown(incoming.expiresAt, onExpire);
  const affordable = balance >= defendCost;
  const [total] = useState(() => Math.max(1, totalSeconds ?? secondsLeft(incoming.expiresAt)));
  const percent = Math.min(100, Math.round((left / total) * 100));

  return (
    <div
      role="status"
      className="animate-attackIn relative mb-3 flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-rose-200 bg-rose-50 px-4 pb-4 pt-3 dark:border-rose-500/30 dark:bg-rose-500/10"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 flex-shrink-0 animate-pulse items-center justify-center rounded-full bg-rose-100 text-xl dark:bg-rose-500/20"
      >
        {KIND_FACE[incoming.kind]}
      </span>
      <p className="min-w-0 flex-1 text-sm text-rose-800 dark:text-rose-300">
        <span className="font-semibold">{incoming.attackerName}</span>님이 공격권을 사용했습니다!
        <span className="ml-1.5 tabular-nums">
          {left}초 동안 퇴근 버튼이{' '}
          {incoming.kind === 'hide' ? '보이지 않습니다' : '말을 안 듣습니다'}.
        </span>
      </p>
      <button
        type="button"
        onClick={onDefend}
        disabled={defending || !affordable}
        title={affordable ? undefined : '포인트가 모자랍니다'}
        className={`btn-primary inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50 ${
          affordable && !defending ? 'animate-shieldGlow' : ''
        }`}
      >
        {defending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        방어권 구매 ({defendCost.toLocaleString()}P)
      </button>

      {/* 남은 시간 — 줄어드는 막대. 애니메이션이 아니라 매초 바뀌는 폭이다
          (움직임 줄이기 설정에서 애니메이션이 꺼지면 막대가 바로 비어 '끝났다' 로 읽힌다). */}
      <div
        role="progressbar"
        aria-label="공격이 풀리기까지 남은 시간"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={left}
        className="absolute inset-x-0 bottom-0 h-1 bg-rose-200/70 dark:bg-rose-500/20"
      >
        <div
          className="h-full bg-rose-500 transition-[width] duration-1000 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 방어에 성공한 직후 잠깐 보이는 띠.
 *
 * 값을 치르고 공격을 푼 순간이 이 기능에서 제일 통쾌해야 할 때라, 토스트 한 줄로
 * 지나가지 않게 경고 띠가 있던 자리에서 초록으로 바꿔 보여 준다.
 */
export function DefendedBanner({ attackerName }: { attackerName: string }) {
  return (
    <div
      role="status"
      className="animate-fadeIn mb-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10"
    >
      <span className="relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="animate-ringBurst absolute inset-0 rounded-full bg-emerald-400/40"
        />
        <Shield className="animate-shieldPop relative h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="text-sm text-emerald-800 dark:text-emerald-300">
        <span className="font-semibold">방어 성공!</span> {attackerName}님의 공격을 막았습니다. 퇴근
        버튼이 돌아왔습니다.
      </p>
    </div>
  );
}
