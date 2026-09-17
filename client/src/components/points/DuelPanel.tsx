// client/src/components/points/DuelPanel.tsx
// 포인트를 걸고 하는 가위바위보.
//
// 신청할 때 손을 함께 정한다 — 상대가 받는 순간 그 자리에서 승부가 나야 하기 때문이다.
// 신청자가 나중에 손을 내는 방식이면 양쪽이 서로를 기다리며 판이 멈춰 있게 된다.
//
// 내 손은 신청하는 순간 서버로 가고, 상대에게는 승부가 날 때까지 내려가지 않는다.
// 가리는 일은 서버가 한다 — 화면이 숨기는 것은 가린 것이 아니다.
//
// 받아 오는 방식은 같은 폴더의 다른 판들과 맞춘다(React Query 대신 useEffect).

import { useCallback, useEffect, useState } from 'react';
import { Swords, Loader2 } from 'lucide-react';
import {
  acceptDuel,
  cancelDuel,
  createDuel,
  declineDuel,
  fetchDuels,
  type Duel,
  type DuelBoard,
  type DuelHand,
} from '../../api/points';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { UserPicker } from '../common/UserPicker';
import type { UserSuggestion } from '../../api/users';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';

const HANDS: DuelHand[] = ['rock', 'paper', 'scissors'];
const HAND_LABEL: Record<DuelHand, string> = { rock: '바위', paper: '보', scissors: '가위' };
const HAND_FACE: Record<DuelHand, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

/** 남은 시간을 분으로 — 초 단위로 세어 봐야 눈에 띄지도 않고 1초마다 다시 그리게 된다 */
function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

/** 이 판이 나에게 어떻게 끝났는가 */
function outcomeOf(duel: Duel, myId: string): '승' | '패' | '무' | null {
  if (duel.status !== 'done' || !duel.result) return null;
  if (duel.result === 'draw') return '무';
  const iWon =
    (duel.result === 'challenger' && duel.challengerId === myId) ||
    (duel.result === 'opponent' && duel.opponentId === myId);
  return iWon ? '승' : '패';
}

function HandPick({
  value,
  onChange,
  disabled,
}: {
  value: DuelHand | null;
  onChange: (hand: DuelHand) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      {HANDS.map(hand => (
        <button
          key={hand}
          type="button"
          disabled={disabled}
          onClick={() => onChange(hand)}
          aria-pressed={value === hand}
          aria-label={HAND_LABEL[hand]}
          className={`flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors disabled:opacity-40 ${
            value === hand
              ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
          }`}
        >
          <span aria-hidden>{HAND_FACE[hand]}</span> {HAND_LABEL[hand]}
        </button>
      ))}
    </div>
  );
}

export function DuelPanel({ myId }: { myId: string }) {
  const [board, setBoard] = useState<DuelBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // 신청 폼
  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const [stake, setStake] = useState('');
  const [hand, setHand] = useState<DuelHand | null>(null);

  const reload = useCallback(async () => {
    const next = await fetchDuels();
    setBoard(next);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchDuels()
      .then(b => {
        if (alive) setBoard(b);
      })
      .catch(() => {
        // 실패를 '대결이 없습니다' 로 보여 주면 비어 있는 것으로 오해한다
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 기다리는 판이 있으면 주기적으로 다시 읽는다. 상대가 답했는지, 시간이 지났는지는
  // 이쪽에서 물어보지 않으면 알 수 없다 — 알림이 와도 이 목록은 그대로였다.
  // 기다리는 판이 없을 때는 묻지 않는다.
  const waitingCount = (board?.incoming.length ?? 0) + (board?.outgoing.length ?? 0);
  useEffect(() => {
    if (waitingCount === 0) return;
    const id = window.setInterval(() => {
      void reload().catch(() => {});
    }, 15_000);
    return () => window.clearInterval(id);
  }, [waitingCount, reload]);

  /** 무엇을 하든 끝나면 판을 다시 읽는다 — 포인트와 목록이 함께 바뀐다 */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err, fallback));
      // 거절·시간 초과처럼 서버 쪽이 이미 바뀐 경우가 있어 다시 읽는다
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const opponent = picked[0];
    const amount = Number(stake);
    if (!opponent || !hand) return;
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error('걸 포인트를 정수로 입력해주세요.');
      return;
    }
    await run(async () => {
      await createDuel({ opponentId: opponent.id, stake: amount, hand });
      toast.success(`${opponent.name}님에게 ${amount.toLocaleString()}P 대결을 신청했습니다.`);
      setPicked([]);
      setStake('');
      setHand(null);
    }, '대결을 신청하지 못했습니다.');
  };

  const respond = async (duel: Duel, myHand: DuelHand) => {
    await run(async () => {
      const settled = await acceptDuel(duel.id, myHand);
      const mine = outcomeOf(settled, myId);
      if (mine === '승') toast.success(`이겼습니다! ${(duel.stake * 2).toLocaleString()}P 획득`);
      else if (mine === '패') toast.info(`졌습니다. ${duel.stake.toLocaleString()}P 를 잃었습니다.`);
      else toast.info('비겼습니다. 건 포인트를 돌려받았습니다.');
    }, '대결에 응하지 못했습니다.');
  };

  if (loading) return <LoadingSpinner size="sm" message="대결 정보를 불러오는 중..." />;
  if (failed) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <ListState>대결 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      </div>
    );
  }
  if (!board) return null;

  const { rules } = board;
  const canSubmit = picked.length > 0 && hand !== null && stake.trim() !== '' && !busy;

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Swords className="h-4 w-4 text-violet-500" />
        포인트 대결
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        건 포인트는 신청하는 순간 맡겨지고, 이긴 쪽이 두 배를 가져갑니다. {rules.expireMinutes}분
        안에 답이 없으면 무효가 되어 돌려받습니다.
      </p>

      {/* ── 받은 대결 ── 가장 먼저 보여 준다. 시간이 지나면 무효가 되기 때문이다. */}
      {board.incoming.length > 0 && (
        <section className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            받은 대결
          </h4>
          <ul className="space-y-2">
            {board.incoming.map(duel => (
              <li
                key={duel.id}
                className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/10"
              >
                <p className="text-sm text-slate-800 dark:text-slate-100">
                  <span className="font-semibold">{duel.challengerName}</span>님이{' '}
                  <span className="font-semibold tabular-nums">
                    {duel.stake.toLocaleString()}P
                  </span>{' '}
                  를 걸었습니다
                  <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
                    · {minutesLeft(duel.expiresAt)}분 남음
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="min-w-[180px] flex-1">
                    <HandPick value={null} onChange={h => void respond(duel, h)} disabled={busy} />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => declineDuel(duel.id), '대결을 거절하지 못했습니다.')
                    }
                    className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 신청 ── */}
      <section className="mt-4">
        <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          대결 신청
        </h4>
        <UserPicker
          selected={picked}
          onChange={setPicked}
          single
          excludeIds={[myId]}
          placeholder="대결할 사람을 검색"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-slate-600 dark:text-slate-300">걸 포인트</span>
            <input
              type="number"
              inputMode="numeric"
              value={stake}
              min={rules.minStake}
              max={rules.maxStake}
              onChange={e => setStake(e.target.value)}
              aria-label="걸 포인트"
              className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <span className="text-xs text-slate-400">
            {rules.minStake.toLocaleString()}~{rules.maxStake.toLocaleString()}P · 보유{' '}
            {board.balance.toLocaleString()}P
          </span>
        </div>
        <div className="mt-2">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            낼 손 (상대에게는 승부가 날 때까지 보이지 않습니다)
          </p>
          <HandPick value={hand} onChange={setHand} disabled={busy} />
        </div>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="btn-primary mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
          대결 신청
        </button>
      </section>

      {/* ── 내가 건 대결 ── */}
      {board.outgoing.length > 0 && (
        <section className="mt-4">
          <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            기다리는 중
          </h4>
          <ul className="space-y-1">
            {board.outgoing.map(duel => (
              <li
                key={duel.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                  {duel.opponentName}님에게{' '}
                  <span className="font-semibold tabular-nums">
                    {duel.stake.toLocaleString()}P
                  </span>
                  {duel.challengerHand && (
                    <span className="ml-1.5 text-xs text-slate-400">
                      내 손 {HAND_FACE[duel.challengerHand]}
                    </span>
                  )}
                  <span className="ml-1.5 text-xs text-slate-400">
                    · {minutesLeft(duel.expiresAt)}분 남음
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => cancelDuel(duel.id), '대결을 취소하지 못했습니다.')}
                  className="shrink-0 text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-40 dark:text-slate-400"
                >
                  취소
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 지난 판 ── */}
      <section className="mt-4">
        <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">최근 결과</h4>
        {board.recent.length === 0 ? (
          <ListState>아직 끝난 대결이 없습니다.</ListState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700/60 dark:border-slate-700">
            {board.recent.map(duel => {
              const mine = outcomeOf(duel, myId);
              const other = duel.challengerId === myId ? duel.opponentName : duel.challengerName;
              return (
                <li
                  key={duel.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                    {other}
                    {duel.status === 'canceled' ? (
                      <span className="ml-1.5 text-xs text-slate-400">무효</span>
                    ) : (
                      duel.challengerHand &&
                      duel.opponentHand && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          {HAND_FACE[duel.challengerHand]} vs {HAND_FACE[duel.opponentHand]}
                        </span>
                      )
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      mine === '승'
                        ? 'text-secondary-600 dark:text-secondary-400'
                        : mine === '패'
                          ? 'text-red-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {mine ?? '—'}{' '}
                    <span className="text-xs font-medium">{duel.stake.toLocaleString()}P</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
