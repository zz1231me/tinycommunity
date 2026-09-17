// client/src/components/attendance/AttendanceAttack.tsx
// 퇴근 공격권·방어권의 화면.
//
// ⚠️ 방해할 뿐 막지는 않는다. 서버의 퇴근 기록은 이 기능을 쳐다보지도 않고,
// 퇴근 버튼도 끝까지 살아 있다(ChaosButton 참고). 여기서 하는 일은
// '누르기 성가시게 만드는 것' 이지 '못 누르게 하는 것' 이 아니다.

import { useEffect, useState } from 'react';
import { Shield, Swords, MessageSquareWarning, Loader2 } from 'lucide-react';
import type { AttackKind, AttackState, IncomingAttack, IncomingPopup } from '../../api/attendance';
import { ModalShell } from '../common/ModalShell';
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

/** 방해받는 중임을 알리고, 방어권을 살 기회를 준다 */
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
        <span className="ml-1.5 tabular-nums">{left}초 동안 퇴근 버튼이 말을 안 듣습니다.</span>
      </p>
      <button
        type="button"
        onClick={onDefend}
        disabled={defending || !affordable}
        title={affordable ? undefined : '포인트가 모자랍니다'}
        className="btn-primary inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {defending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        방어권 구매 ({defendCost.toLocaleString()}P)
      </button>
    </div>
  );
}

/** 받은 쪽지 — 한 번 뜨고 닫으면 끝이다 */
export function PopupAlert({ popup, onClose }: { popup: IncomingPopup; onClose: () => void }) {
  return (
    <ModalShell label="받은 쪽지" onClose={onClose} className="w-full max-w-sm">
      <div className="p-5 text-center">
        <MessageSquareWarning className="mx-auto h-8 w-8 text-rose-500" />
        {/*
          보낸 사람을 늘 함께 보여 준다. 익명으로 남의 화면에 글을 띄울 수 있으면
          그건 장난이 아니라 괴롭힘 창구가 된다.
        */}
        <h2 className="card-title mt-3">{popup.attackerName}님의 쪽지</h2>
        {/* 글은 그대로 글로만 그린다 — 보낸 내용이 화면의 일부가 되게 두지 않는다 */}
        <p className="mt-2 break-words text-base font-medium text-slate-800 dark:text-slate-100">
          {popup.message}
        </p>
        <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">
          닫기
        </button>
      </div>
    </ModalShell>
  );
}

const KINDS: Array<{ kind: AttackKind; label: string; hint: string }> = [
  { kind: 'chaos', label: '퇴근 방해', hint: '퇴근 버튼이 도망다니고 깜빡입니다' },
  { kind: 'popup', label: '쪽지', hint: '상대 화면에 알림창으로 한 번 뜹니다' },
];

/** 누구에게 무엇을 보낼지 고른다 */
export function AttackLauncher({
  state,
  myId,
  sending,
  onAttack,
}: {
  state: AttackState;
  myId: string;
  sending: boolean;
  /** 보냈으면 true. 실패했는데 고른 사람과 쓴 글을 지우면 처음부터 다시 해야 한다. */
  onAttack: (payload: {
    targetId: string;
    kind: AttackKind;
    message?: string;
  }) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const [kind, setKind] = useState<AttackKind>('chaos');
  const [message, setMessage] = useState('');

  const { rules } = state;
  const cost = kind === 'popup' ? rules.popupCost : rules.cost;
  const soldOut = state.remainingToday <= 0;
  const affordable = state.balance >= cost;
  const chosen = KINDS.find(k => k.kind === kind);

  return (
    <section className="card mt-4 p-5">
      <h2 className="card-title flex items-center gap-1.5">
        <Swords className="h-4 w-4 text-rose-500" />
        퇴근 공격권
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        근무 중인 사람을 {rules.blockSeconds}초 동안 방해합니다. 버튼이 잠기는 것은 아니라 끝까지
        누르면 눌리고, 기록되는 퇴근 시각은 실제로 누른 순간 그대로입니다. 오늘{' '}
        {state.remainingToday}/{rules.dailyLimit}번 남았습니다.
      </p>

      <div className="mt-3 flex gap-1.5">
        {KINDS.map(option => (
          <button
            key={option.kind}
            type="button"
            onClick={() => setKind(option.kind)}
            aria-pressed={kind === option.kind}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
              kind === option.kind
                ? 'border-rose-500 bg-rose-50 font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
            <span className="ml-1 text-xs font-normal text-slate-400">
              {(option.kind === 'popup' ? rules.popupCost : rules.cost).toLocaleString()}P
            </span>
          </button>
        ))}
      </div>
      {chosen && <p className="mt-1.5 text-xs text-slate-500">{chosen.hint}</p>}

      {kind === 'popup' && (
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={rules.messageMaxLength}
          placeholder="한 줄만 — 상대 화면에 그대로 뜹니다"
          aria-label="쪽지 내용"
          className="input input-sm mt-2 w-full"
        />
      )}

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
          void (async () => {
            const sent = await onAttack({
              targetId: picked[0].id,
              kind,
              ...(kind === 'popup' ? { message: message.trim() } : {}),
            });
            // 보내진 뒤에만 비운다. 한도 초과·포인트 부족처럼 거절당하는 길이 여럿이라,
            // 미리 비우면 그때마다 사람을 다시 찾고 글을 다시 써야 한다.
            if (sent) {
              setPicked([]);
              setMessage('');
            }
          })();
        }}
        className="btn-secondary mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
        {soldOut
          ? '오늘은 모두 사용했어요'
          : !affordable
            ? '포인트가 모자랍니다'
            : `보내기 (−${cost.toLocaleString()}P)`}
      </button>
    </section>
  );
}
