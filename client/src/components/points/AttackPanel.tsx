// client/src/components/points/AttackPanel.tsx
// 퇴근 공격권 — 포인트를 주고 남의 퇴근 버튼을 잠깐 성가시게 만든다.
//
// 보내는 쪽만 여기 있다. 받는 쪽(경고 띠·받은 쪽지·도망다니는 퇴근 버튼)은 출퇴근
// 화면에 그대로 남아 있다 — 방해받는 대상이 그 화면의 퇴근 버튼이기 때문이다.
//
// 받아 오는 방식은 같은 폴더의 다른 판들과 맞춘다(React Query 대신 useEffect).
// 출퇴근 화면은 같은 API 를 React Query 로 읽는데, 거기서는 1분이면 저절로 풀리는
// 공격을 짧은 주기로 다시 물어봐야 해서다. 여기에는 그럴 이유가 없다.
//
// ⚠️ 방해할 뿐 막지는 않는다. 서버의 퇴근 기록은 이 기능을 쳐다보지도 않고, 퇴근
// 버튼도 끝까지 살아 있다. 하는 일은 '누르기 성가시게 만드는 것' 이지 '못 누르게
// 하는 것' 이 아니다.

import { useCallback, useEffect, useState } from 'react';
import { Swords, Loader2 } from 'lucide-react';
import {
  fetchAttackState,
  sendAttack,
  type AttackKind,
  type AttackState,
} from '../../api/attendance';
import { UserPicker } from '../common/UserPicker';
import type { UserSuggestion } from '../../api/users';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

const KINDS: Array<{ kind: AttackKind; label: string; hint: string }> = [
  { kind: 'chaos', label: '퇴근 방해', hint: '퇴근 버튼이 도망다니고 깜빡입니다' },
  { kind: 'popup', label: '쪽지', hint: '상대 화면에 알림창으로 한 번 뜹니다' },
];

/**
 * @param myId 나 자신은 고를 수 없게 빼기 위한 것
 * @param onSpent 포인트를 쓴 뒤 — 같은 화면의 잔액 표시를 다시 불러오게 한다
 */
export function AttackPanel({ myId, onSpent }: { myId: string; onSpent?: () => void }) {
  const [state, setState] = useState<AttackState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const [kind, setKind] = useState<AttackKind>('chaos');
  const [message, setMessage] = useState('');

  const reload = useCallback(async () => {
    setState(await fetchAttackState());
  }, []);

  useEffect(() => {
    let alive = true;
    fetchAttackState()
      .then(s => {
        if (alive) setState(s);
      })
      .catch(() => {
        // 실패를 빈 화면으로 두면 '공격권 기능이 없는 화면' 처럼 보인다
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSend = async () => {
    if (!state || picked.length === 0 || sending) return;
    setSending(true);
    try {
      await sendAttack({
        targetId: picked[0].id,
        kind,
        ...(kind === 'popup' ? { message: message.trim() } : {}),
      });
      toast.success('공격권을 사용했습니다.');
      // 보내진 뒤에만 비운다. 한도 초과·포인트 부족처럼 거절당하는 길이 여럿이라,
      // 미리 비우면 그때마다 사람을 다시 찾고 글을 다시 써야 한다.
      setPicked([]);
      setMessage('');
      await reload().catch(() => {});
      onSpent?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '공격권을 사용하지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  const rules = state?.rules;
  const cost = !rules ? 0 : kind === 'popup' ? rules.popupCost : rules.cost;
  const soldOut = (state?.remainingToday ?? 0) <= 0;
  const affordable = (state?.balance ?? 0) >= cost;
  const chosen = KINDS.find(k => k.kind === kind);

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Swords className="h-4 w-4 text-rose-500" />
        퇴근 공격권
      </h3>

      {loading ? (
        <LoadingSpinner size="sm" message="공격권을 불러오는 중..." />
      ) : failed || !state || !rules ? (
        <ListState>공격권 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            근무 중인 사람을 {rules.blockSeconds}초 동안 방해합니다. 버튼이 잠기는 것은 아니라
            끝까지 누르면 눌리고, 기록되는 퇴근 시각은 실제로 누른 순간 그대로입니다. 오늘{' '}
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
            onClick={() => void handleSend()}
            className="btn-secondary mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Swords className="h-4 w-4" />
            )}
            {soldOut
              ? '오늘은 모두 사용했어요'
              : !affordable
                ? '포인트가 모자랍니다'
                : `보내기 (−${cost.toLocaleString()}P)`}
          </button>
        </>
      )}
    </div>
  );
}
