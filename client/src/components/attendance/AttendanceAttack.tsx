// client/src/components/attendance/AttendanceAttack.tsx
// 퇴근 공격권·방어권의 화면.
//
// ⚠️ 잠기는 것은 이 화면의 버튼뿐이다. 서버의 퇴근 기록은 공격을 쳐다보지도 않는다 —
// 잠긴 동안에도 어떤 경로로든 퇴근을 찍으면 그 순간이 그대로 기록된다.
// 그래서 여기서 하는 일은 '누르고 싶게 만드는 것' 이지 '막는 것' 이 아니다.

import { useEffect, useState } from 'react';
import { Shield, Swords, Loader2 } from 'lucide-react';
import type { AttackState, IncomingAttack } from '../../api/attendance';
import { UserPicker } from '../common/UserPicker';
import type { UserSuggestion } from '../../api/users';

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

/** 공격받는 중임을 알리고, 방어권을 살 기회를 준다 */
export function AttackBanner({
  incoming,
  defendCost,
  balance,
  defending,
  onDefend,
  onExpire,
}: {
  incoming: IncomingAttack;
  defendCost: number;
  balance: number;
  defending: boolean;
  onDefend: () => void;
  onExpire: () => void;
}) {
  const left = useCountdown(incoming.expiresAt, onExpire);
  const affordable = balance >= defendCost;

  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10"
    >
      <Swords className="h-5 w-5 flex-shrink-0 text-rose-500" />
      <p className="min-w-0 flex-1 text-sm text-rose-800 dark:text-rose-300">
        <span className="font-semibold">{incoming.attackerName}</span>님이 공격권을 사용했습니다!
        <span className="ml-1.5 tabular-nums">퇴근 버튼이 {left}초 동안 잠깁니다.</span>
      </p>
      <button
        type="button"
        onClick={onDefend}
        disabled={defending || !affordable}
        title={affordable ? undefined : '포인트가 모자랍니다'}
        className="btn-primary inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {defending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Shield className="h-4 w-4" />
        )}
        방어권 구매 ({defendCost.toLocaleString()}P)
      </button>
    </div>
  );
}

/** 남의 퇴근 버튼을 잠글 사람을 고른다 */
export function AttackLauncher({
  state,
  myId,
  sending,
  onAttack,
}: {
  state: AttackState;
  myId: string;
  sending: boolean;
  onAttack: (targetId: string) => void;
}) {
  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const { rules } = state;
  const soldOut = state.remainingToday <= 0;
  const affordable = state.balance >= rules.cost;

  return (
    <section className="card mt-4 p-5">
      <h2 className="card-title flex items-center gap-1.5">
        <Swords className="h-4 w-4 text-rose-500" />
        퇴근 공격권
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        근무 중인 사람의 퇴근 버튼을 {rules.blockSeconds}초 동안 잠급니다. 화면에서만 잠기고,
        기록되는 퇴근 시각은 실제로 누른 순간 그대로입니다. 오늘 {state.remainingToday}/
        {rules.dailyLimit}번 남았습니다.
      </p>

      <div className="mt-3">
        <UserPicker
          selected={picked}
          onChange={setPicked}
          single
          excludeIds={[myId]}
          placeholder="공격할 사람을 검색"
        />
      </div>

      <button
        type="button"
        disabled={picked.length === 0 || sending || soldOut || !affordable}
        onClick={() => {
          onAttack(picked[0].id);
          setPicked([]);
        }}
        className="btn-secondary mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
        {soldOut
          ? '오늘은 모두 사용했어요'
          : !affordable
            ? '포인트가 모자랍니다'
            : `공격 (−${rules.cost.toLocaleString()}P)`}
      </button>
    </section>
  );
}
