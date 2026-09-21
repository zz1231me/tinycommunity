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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Swords, Loader2, Clock } from 'lucide-react';
import {
  acceptDuel,
  cancelDuel,
  createDuel,
  declineDuel,
  fetchDuels,
  tauntDuel,
  DUEL_MESSAGE_MAX,
  DUEL_TAUNT_MAX,
  type Duel,
  type DuelBoard,
  type DuelHand,
} from '../../api/points';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { UserPicker } from '../common/UserPicker';
import type { UserSuggestion } from '../../api/users';
import { PointsSection } from './PointsSection';
import { WinFanfare } from './WinFanfare';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { useNotificationArrival } from '../../hooks/useNotificationArrival';

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
  labelFor,
  large = false,
}: {
  value: DuelHand | null;
  onChange: (hand: DuelHand) => void;
  disabled?: boolean;
  /** 받은 대결에서는 크게 — 이 판에서 할 일이 이 세 버튼뿐이다 */
  large?: boolean;
  /**
   * 버튼을 읽어 줄 말. 받은 대결에서는 이 버튼이 '고르기' 가 아니라 '포인트를 걸고
   * 지금 받기' 라, 손 이름만 읽어 주면 무슨 일이 일어나는지 알 수 없다.
   */
  labelFor?: (hand: DuelHand) => string;
}) {
  return (
    <div className="flex gap-1.5">
      {HANDS.map(hand => (
        <button
          key={hand}
          type="button"
          disabled={disabled}
          onClick={() => onChange(hand)}
          // 고르는 자리에서만 토글이다. 받은 대결에서는 누르는 즉시 승부가 나므로
          // '눌린 상태' 라는 개념이 없다.
          aria-pressed={labelFor ? undefined : value === hand}
          aria-label={labelFor ? labelFor(hand) : HAND_LABEL[hand]}
          className={`flex-1 rounded-lg border transition-colors disabled:opacity-40 ${
            large
              ? 'flex flex-col items-center gap-1 border-violet-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-violet-500/10'
              : `px-2 py-1.5 text-sm ${
                  value === hand
                    ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`
          }`}
        >
          {large ? (
            <>
              <span aria-hidden className="text-2xl leading-none">
                {HAND_FACE[hand]}
              </span>
              <span>{HAND_LABEL[hand]}</span>
            </>
          ) : (
            <>
              <span aria-hidden>{HAND_FACE[hand]}</span> {HAND_LABEL[hand]}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export function DuelPanel({
  myId,
  focusDuelId = null,
  focusKey,
  onFocusHandled,
  refreshSignal = 0,
  onSpent,
}: {
  myId: string;
  /** 알림이 가리킨 판 (?duel=). 그 판으로 스크롤하고 잠깐 강조한다. */
  focusDuelId?: number | null;
  /** 알림을 누를 때마다 바뀐다 — 같은 알림을 다시 눌러도 다시 찾아간다 */
  focusKey?: string;
  /**
   * 알림이 가리킨 판을 찾아간 뒤(찾았든 못 찾았든) — 부모가 주소에서 ?duel= 을 지운다.
   * 남겨 두면 다른 탭에 갔다 돌아올 때마다 다시 스크롤하고 번쩍인다.
   */
  onFocusHandled?: () => void;
  /** 같은 화면의 다른 판이 포인트를 움직이면 바뀐다 — 잔액을 다시 읽는다 */
  refreshSignal?: number;
  /** 이 판에서 포인트가 움직인 뒤 — 같은 화면의 다른 판들이 잔액을 다시 읽게 한다 */
  onSpent?: () => void;
}) {
  const [board, setBoard] = useState<DuelBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // 신청 폼
  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const [stake, setStake] = useState('');
  const [hand, setHand] = useState<DuelHand | null>(null);
  const [message, setMessage] = useState('');

  // 이긴 판에 남길 한마디 — 어느 판에 쓰는 중인지
  const [tauntFor, setTauntFor] = useState<number | null>(null);
  /** 이겼을 때 잠깐 터지는 축하 — 딴 포인트 */
  const [fanfare, setFanfare] = useState<number | null>(null);
  const focusTauntInput = useRef(false);

  /**
   * 답한 판으로 포커스를 옮긴다. 누른 손·거절 단추는 판이 '받은 대결' 에서 빠지며 사라져,
   * 그대로 두면 포커스가 페이지 맨 위로 떨어진다 — 키보드·화면 낭독기 사용자는 처음부터 다시다.
   * 끝난 판은 최근 결과 줄(id=duel-N)로 옮겨 가 있다.
   */
  const focusRow = (id: number) =>
    window.requestAnimationFrame(() =>
      document.getElementById(`duel-${id}`)?.focus({ preventScroll: true })
    );
  const [tauntText, setTauntText] = useState('');

  // 다시 읽는 길이 여럿이다(첫 로딩·주기·알림·동작 뒤·알림에서 넘어온 판 찾기). 응답은
  // 보낸 순서대로 오지 않으므로, 가장 나중에 보낸 요청의 응답만 화면에 둔다. 그러지 않으면
  // 받기 전에 떠난 주기 요청이 받은 뒤에 도착해, 이미 끝난 판을 다시 '받은 대결' 로 되살린다.
  const requestSeq = useRef(0);
  const reload = useCallback(async (): Promise<DuelBoard> => {
    const mine = ++requestSeq.current;
    const next = await fetchDuels();
    if (mine === requestSeq.current) {
      setBoard(next);
      // 첫 로딩이 실패했어도 나중에 읽히면 오류 화면에서 벗어난다(예전에는 새로고침 전까지 갇혔다)
      setFailed(false);
    }
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    reload()
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
  }, [reload]);

  // 같은 화면의 다른 판(뽑기·공격권·방어권)이 포인트를 쓰면 잔액을 다시 읽는다.
  // 0 은 첫 렌더라 건너뛴다 — 위의 첫 조회와 겹친다.
  useEffect(() => {
    if (refreshSignal === 0) return;
    void reload().catch(() => {});
  }, [refreshSignal, reload]);

  // 주기적으로 다시 읽는다. 상대가 답했는지, 시간이 지났는지는 이쪽에서 물어보지 않으면
  // 알 수 없다. 기다리는 판이 있으면 15초, 없으면 느리게 1분.
  //
  // 기다리는 판이 없을 때 아예 묻지 않던 때는, 대결 알림을 꺼 둔 사람에게 도전장이 오면
  // 영영 보이지 않았다 — 알림을 끄면 서버가 알림 줄을 만들지 않아 도착 신호도 없는데,
  // 하필 '아무것도 없는' 그 상태에서만 주기 확인까지 쉬고 있었다.
  const waitingCount = (board?.incoming?.length ?? 0) + (board?.outgoing?.length ?? 0);
  useEffect(() => {
    const every = waitingCount > 0 ? 15_000 : 60_000;
    const id = window.setInterval(() => {
      void reload().catch(() => {});
    }, every);
    return () => window.clearInterval(id);
  }, [waitingCount, reload]);

  // 도전장·결과·한마디 알림이 오면 바로 다시 읽는다. 위의 주기적 확인은 기다리는 판이
  // 있을 때만 돌아서, 아무것도 없을 때 온 도전장은 새로고침을 해야 보였다.
  useNotificationArrival(['DUEL'], () => {
    void reload().catch(() => {});
  });

  // 부모가 매 렌더 새 함수를 넘겨도 찾아가기를 다시 돌리지 않는다
  const focusHandled = useRef(onFocusHandled);
  useEffect(() => {
    focusHandled.current = onFocusHandled;
  });

  // ── 알림에서 넘어온 판 찾아가기 ──
  //
  // 알림은 탭까지만 가리켜서, 받은 사람이 뽑기 판 아래로 내려가며 직접 찾아야 했다.
  // 이제 판 번호가 오면 그 판으로 스크롤하고 몇 번 빛나게 한다.
  // n 은 같은 판을 다시 강조할 때 효과를 다시 돌리려는 것이다. id 만 두면 강조가 남아 있는
  // 4초 안에 같은 알림을 다시 눌렀을 때 값이 같아 스크롤도 포커스도 일어나지 않았다.
  const [highlight, setHighlight] = useState<{ id: number; n: number } | null>(null);
  const highlightId = highlight?.id ?? null;
  const boardRef = useRef<DuelBoard | null>(null);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  // focusKey 는 본문에서 쓰지 않지만 의존성에 둔다. 알림을 누를 때마다 바뀌므로,
  // 같은 판을 가리키는 알림을 다시 눌러도 다시 찾아간다.
  useEffect(() => {
    if (loading || focusDuelId === null) return;

    let alive = true;
    const has = (b: DuelBoard | null) =>
      !!b && [...b.incoming, ...b.outgoing, ...b.recent].some(d => d.id === focusDuelId);

    void (async () => {
      let current = boardRef.current;
      let loadError = false;
      // 이미 이 화면에 있을 때 알림을 누르면, 목록은 그 사이에 온 판을 모른다 — 다시 읽는다
      if (!has(current)) {
        try {
          current = await reload();
        } catch {
          loadError = true;
        }
      }
      if (!alive) return;
      if (has(current)) setHighlight({ id: focusDuelId, n: Date.now() });
      // 못 읽은 것을 '사라진 대결' 이라고 하면, 살아 있는 도전장을 사람이 찾지 않게 된다
      else if (loadError)
        toast.error('대결 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      else toast.info('이미 끝났거나 시간이 지나 사라진 대결입니다.');
      focusHandled.current?.();
    })();

    return () => {
      alive = false;
    };
  }, [loading, focusDuelId, focusKey, reload]);

  useEffect(() => {
    if (!highlight) return;
    const highlightId = highlight.id;
    const el = document.getElementById(`duel-${highlightId}`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    // 포커스는 손 버튼이 아니라 카드에 둔다. 손 버튼에 두면 Enter 한 번에 포인트가 걸린
    // 승부가 나 버린다. 카드에 두면 화면 낭독기가 누가 얼마를 걸었는지부터 읽어 준다.
    el?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setHighlight(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  /** 무엇을 하든 끝나면 판을 다시 읽는다 — 포인트와 목록이 함께 바뀐다 */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    let done = false;
    try {
      // 동작과 뒤이은 갱신을 같은 try 에 두지 않는다. 한데 묶으면 신청은 성공했는데
      // 목록 갱신만 실패했을 때 '신청하지 못했습니다' 가 떠서, 사용자가 사실과 반대로
      // 알고 다시 걸게 된다 — 판돈은 이미 빠져 있는데 한 번 더 빠진다.
      await action();
      done = true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, fallback));
    } finally {
      // 성공이든 실패든 서버 쪽은 이미 바뀌었을 수 있어 늘 다시 읽는다
      await reload().catch(() => {});
      setBusy(false);
    }
    // 포인트가 움직였을 수 있다(신청·응수·취소) — 같은 화면의 다른 판에 알린다
    if (done) onSpent?.();
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
      await createDuel({
        opponentId: opponent.id,
        stake: amount,
        hand,
        message: message.trim() || undefined,
      });
      toast.success(`${opponent.name}님에게 ${amount.toLocaleString()}P 대결을 신청했습니다.`);
      setPicked([]);
      setStake('');
      setHand(null);
      setMessage('');
    }, '대결을 신청하지 못했습니다.');
  };

  const respond = async (duel: Duel, myHand: DuelHand) => {
    await run(async () => {
      const settled = await acceptDuel(duel.id, myHand);
      const mine = outcomeOf(settled, myId);
      if (mine === '승') {
        toast.success(`이겼습니다! ${(duel.stake * 2).toLocaleString()}P 획득`);
        // 이기는 순간이 이 기능에서 제일 기분 좋은 자리다 — 한 줄 토스트로는 심심하다
        setFanfare(duel.stake * 2);
        // 이긴 김에 한마디 — 최근 결과에 그 판의 입력칸을 바로 열어 둔다
        setTauntFor(duel.id);
        setTauntText('');
      } else if (mine === '패')
        toast.info(`졌습니다. ${duel.stake.toLocaleString()}P 를 잃었습니다.`);
      else toast.info('비겼습니다. 건 포인트를 돌려받았습니다.');
    }, '대결에 응하지 못했습니다.');
    focusRow(duel.id);
  };

  const sendTaunt = async (duelId: number) => {
    const text = tauntText.trim();
    if (!text) return;
    await run(async () => {
      await tauntDuel(duelId, text);
      toast.success('한마디를 보냈습니다.');
      setTauntFor(null);
      setTauntText('');
    }, '한마디를 보내지 못했습니다.');
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
    <>
      {fanfare !== null && <WinFanfare amount={fanfare} onDone={() => setFanfare(null)} />}
      <PointsSection
        icon={<Swords className="h-5 w-5" />}
        tone="violet"
        title="포인트 대결"
        badge={
          board.incoming.length > 0 && (
            <span className="animate-popIn rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              도전장 {board.incoming.length}
            </span>
          )
        }
        description={
          <>
            가위바위보로 겨룹니다. 건 포인트는 신청하는 순간 맡겨지고, 이긴 쪽이 두 배를 가져갑니다.{' '}
            {rules.expireMinutes}분 안에 답이 없으면 무효가 되어 돌려받습니다.
          </>
        }
      >
        {/* ── 받은 대결 ── 가장 먼저 보여 준다. 시간이 지나면 무효가 되기 때문이다. */}
        {board.incoming.length > 0 && (
          <section className="mt-4">
            <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              받은 대결
            </h4>
            <ul className="space-y-3">
              {board.incoming.map(duel => {
                const left = minutesLeft(duel.expiresAt);
                const urgent = left <= 3;
                const highlighted = highlightId === duel.id;
                return (
                  <li
                    key={duel.id}
                    id={`duel-${duel.id}`}
                    tabIndex={-1}
                    className={`rounded-xl border-2 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm transition-colors dark:from-violet-500/15 dark:to-slate-900 ${
                      highlighted
                        ? 'animate-duelPulse border-violet-500'
                        : 'border-violet-200 dark:border-violet-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold tracking-wide text-violet-600 dark:text-violet-300">
                          ⚔️ 도전장
                        </p>
                        <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {duel.challengerName}
                          </span>
                          님이 대결을 신청했습니다
                        </p>
                        {duel.message && (
                          <p className="mt-2 inline-block max-w-full break-words rounded-xl rounded-tl-sm bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800 dark:text-slate-200 dark:ring-violet-500/20">
                            “{duel.message}”
                          </p>
                        )}
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                          urgent
                            ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                            : 'bg-white text-violet-700 ring-1 ring-violet-200 dark:bg-slate-800 dark:text-violet-300 dark:ring-violet-500/30'
                        }`}
                      >
                        <Clock className="h-3 w-3" aria-hidden />
                        {urgent ? `곧 무효 · ${left}분` : `${left}분 남음`}
                      </span>
                    </div>

                    <p className="mt-2 text-2xl font-bold tabular-nums text-violet-700 dark:text-violet-200">
                      {duel.stake.toLocaleString()}P
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      이기면 {(duel.stake * 2).toLocaleString()}P · 손을 고르는 즉시 승부가 납니다
                    </p>

                    <div className="mt-3">
                      <HandPick
                        large
                        value={null}
                        onChange={h => void respond(duel, h)}
                        disabled={busy}
                        labelFor={hand =>
                          `${HAND_LABEL[hand]} 내고 ${duel.stake.toLocaleString()}P 대결 받기`
                        }
                      />
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(() => declineDuel(duel.id), '대결을 거절하지 못했습니다.').then(
                            () => focusRow(duel.id)
                          )
                        }
                        className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        거절
                      </button>
                    </div>
                  </li>
                );
              })}
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
          <label className="relative mt-2 block">
            <input
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, DUEL_MESSAGE_MAX))}
              maxLength={DUEL_MESSAGE_MAX}
              placeholder="도전장에 한마디 (선택)"
              aria-label="신청 메시지"
              className="input input-sm w-full pr-14"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs tabular-nums text-slate-400"
            >
              {message.length}/{DUEL_MESSAGE_MAX}
            </span>
          </label>
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
                  id={`duel-${duel.id}`}
                  tabIndex={-1}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                    highlightId === duel.id
                      ? 'animate-duelPulse border-violet-500'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {/* 남은 시간은 따로 둔다. 한 줄에 몰아 자르면 375px 에서 메시지가 긴 판은
                    남은 시간이 통째로 잘려 안 보였다 — 내가 건 판의 유일한 시계인데. */}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <span className="min-w-0 truncate">
                        {duel.opponentName}님에게{' '}
                        <span className="font-semibold tabular-nums">
                          {duel.stake.toLocaleString()}P
                        </span>
                        {duel.challengerHand && (
                          <span className="ml-1.5 text-xs text-slate-400">
                            내 손 {HAND_FACE[duel.challengerHand]}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">
                        · {minutesLeft(duel.expiresAt)}분 남음
                      </span>
                    </span>
                    {duel.message && (
                      <span className="block truncate text-xs text-slate-400">
                        “{duel.message}”
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => cancelDuel(duel.id), '대결을 취소하지 못했습니다.')
                    }
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
          <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            최근 결과
          </h4>
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
                    id={`duel-${duel.id}`}
                    tabIndex={-1}
                    className={`px-3 py-2 text-sm ${
                      highlightId === duel.id
                        ? 'animate-duelPulse bg-violet-50 dark:bg-violet-500/10'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
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
                      <span className="flex shrink-0 items-center gap-2">
                        {mine === '승' && !duel.taunt && tauntFor !== duel.id && (
                          <button
                            type="button"
                            onClick={() => {
                              focusTauntInput.current = true;
                              setTauntFor(duel.id);
                              setTauntText('');
                            }}
                            className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                          >
                            🔥 한마디 남기기
                          </button>
                        )}
                        <span
                          className={`font-semibold tabular-nums ${
                            mine === '승'
                              ? 'text-secondary-600 dark:text-secondary-400'
                              : mine === '패'
                                ? 'text-red-500'
                                : 'text-slate-400'
                          }`}
                        >
                          {mine ?? '—'}{' '}
                          <span className="text-xs font-medium">
                            {duel.stake.toLocaleString()}P
                          </span>
                        </span>
                      </span>
                    </div>

                    {/* 이긴 사람이 남긴 한마디. 진 쪽에서는 약 오르라고 분홍 말풍선으로 */}
                    {duel.taunt && (
                      <p
                        className={`mt-1.5 inline-block max-w-full break-words rounded-xl px-2.5 py-1 text-xs ${
                          mine === '패'
                            ? 'rounded-tl-sm bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                            : 'rounded-tr-sm bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {mine === '패' ? `💬 ${other}: ` : '내 한마디: '}“{duel.taunt}”
                      </p>
                    )}

                    {mine === '승' && !duel.taunt && tauntFor === duel.id && (
                      <form
                        className="mt-2 flex items-center gap-1.5"
                        onSubmit={e => {
                          e.preventDefault();
                          void sendTaunt(duel.id);
                        }}
                      >
                        <label className="relative min-w-0 flex-1">
                          <input
                            // 사람이 '한마디 남기기' 를 눌러 열었을 때만 포커스를 준다. autoFocus 로 두면
                            // 이긴 뒤 목록이 늦게 읽혀 칸이 나중에 뜰 때, 다른 칸에 쓰던 커서를 빼앗는다.
                            ref={el => {
                              if (el && focusTauntInput.current) {
                                focusTauntInput.current = false;
                                el.focus();
                              }
                            }}
                            value={tauntText}
                            onChange={e => setTauntText(e.target.value.slice(0, DUEL_TAUNT_MAX))}
                            maxLength={DUEL_TAUNT_MAX}
                            placeholder={`${other}님에게 한마디`}
                            aria-label="이긴 판에 남길 한마디"
                            className="input input-sm w-full pr-12"
                          />
                          <span
                            aria-hidden
                            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs tabular-nums text-slate-400"
                          >
                            {tauntText.length}/{DUEL_TAUNT_MAX}
                          </span>
                        </label>
                        <button
                          type="submit"
                          disabled={busy || tauntText.trim() === ''}
                          className="btn-primary btn-sm disabled:opacity-50"
                        >
                          보내기
                        </button>
                        <button
                          type="button"
                          onClick={() => setTauntFor(null)}
                          className="btn-secondary btn-sm"
                        >
                          닫기
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </PointsSection>
    </>
  );
}
