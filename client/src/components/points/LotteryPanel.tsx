// client/src/components/points/LotteryPanel.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Loader2, TicketCheck } from 'lucide-react';
import {
  drawLottery,
  fetchPointHistory,
  fetchPointStatus,
  type PointEntry,
  type PointStatus,
} from '../../api/points';
import { toast } from '../../utils/toast';
import { LoadingSpinner } from '../common/LoadingStates';
import { ListState } from '../common/ListState';
import { prefersReducedMotion } from '../../utils/animations';

const REASON_LABEL: Record<PointEntry['reason'], string> = {
  lottery: '뽑기',
  lottery_cost: '참가비',
  attendance: '출석',
  admin: '관리자',
  duel_stake: '대결',
  duel_win: '대결 승리',
  duel_refund: '대결 환불',
  attack_cost: '퇴근 공격',
  defend_cost: '퇴근 방어',
};

/** 숫자가 섞이는 최소 시간(ms). 서버가 곧바로 답해도 이만큼은 돌아야 '뽑았다'로 읽힌다 */
const ROLL_MS = 700;

/** 짧은 진동 — 지원하지 않는 기기에서는 아무 일도 일어나지 않는다 */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 진동은 있으면 좋은 것이지 없으면 안 되는 것이 아니다
  }
}

/**
 * 숫자가 목표값까지 굴러 올라가게 한다(잔액 표시용).
 *
 * 처음 받은 값은 굴리지 않고 그대로 보여 준다. 0 에서 굴려 올리면 값이 바뀐 것처럼
 * 보이고, 무엇보다 화면이 숨겨져 requestAnimationFrame 이 멈춘 상태에서는 0 인 채로
 * 굳는다 — 잔액이 0 으로 보이는 것은 연출이 아니라 틀린 값이다.
 */
function useCountUp(target: number, enabled: boolean, ready: boolean): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const seeded = useRef(false);
  useEffect(() => {
    // 아직 서버 값이 없다 — 불러오는 동안의 0 을 시작점으로 삼으면 안 된다
    if (!ready) return;
    // 화면이 숨겨져 있으면 requestAnimationFrame 이 멈춘다. 그대로 두면 굴러가다 만
    // 숫자가 화면에 남는다 — 보이지 않는 동안은 굴리지 말고 바로 맞춘다.
    if (!enabled || !seeded.current || document.hidden) {
      seeded.current = true;
      setShown(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const started = performance.now();
    const DUR = 650;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / DUR);
      // 끝에서 부드럽게 멈춘다
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, ready]);
  return shown;
}

/** 당첨 순간의 신호. 결과 판 테두리가 한 번 번지고 사라진다. */
function WinPulse() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {[0, 0.14].map((delay, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.55, scale: 0.97 }}
          animate={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.65, delay, ease: 'easeOut' }}
          className="absolute inset-0 rounded-xl border border-secondary-500 dark:border-secondary-400"
        />
      ))}
    </div>
  );
}

/**
 * 마이페이지의 포인트 뽑기.
 *
 * 결과는 서버가 정한다 — 이 화면은 눌러서 받아 적을 뿐이고, 확률·금액·횟수도
 * 서버에서 내려온 값을 그대로 보여준다(바꾸는 곳은 관리자 페이지다).
 */
export function LotteryPanel({
  refreshSignal = 0,
  onSpent,
}: {
  refreshSignal?: number;
  /** 뽑은 뒤 — 참가비·당첨금으로 잔액이 바뀌었다. 같은 화면의 다른 판들이 다시 읽게 한다. */
  onSpent?: () => void;
}) {
  const [status, setStatus] = useState<PointStatus | null>(null);
  const [entries, setEntries] = useState<PointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [last, setLast] = useState<{ amount: number; cost: number; isBlank: boolean } | null>(null);
  /** 릴에 지금 떠 있는 숫자. null 이면 릴이 멈춘 상태 */
  const [reel, setReel] = useState<number | null>(null);
  const reelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 결과가 나온 순간 당첨 신호를 낸다 */
  const [celebrate, setCelebrate] = useState(0);
  const motionOk = !prefersReducedMotion();

  // 화면을 떠날 때 릴이 계속 돌지 않도록 정리한다
  useEffect(
    () => () => {
      if (reelTimer.current) clearInterval(reelTimer.current);
    },
    []
  );

  // 다시 읽는 길이 여럿이다(첫 로딩·뽑은 뒤·다른 판의 신호). 응답은 보낸 순서대로 오지
  // 않으므로 가장 나중에 보낸 요청의 응답만 둔다. 그러지 않으면 먼저 떠난 요청이 늦게 도착해
  // 뽑기 전 잔액·남은 횟수로 되돌리고, 남은 횟수가 없는데 버튼이 열린다.
  const requestSeq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++requestSeq.current;
    const [s, h] = await Promise.all([fetchPointStatus(), fetchPointHistory(1)]);
    if (mine !== requestSeq.current) return;
    setStatus(s);
    setEntries(h.entries);
    // 나중에 보낸 요청이 먼저 성공하면 그것으로 로딩·실패 화면을 끝낸다 — 첫 로딩이 늦거나
    // 실패했다고 계속 빈 화면·오류 화면에 머물지 않게
    setFailed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const mine = ++requestSeq.current;
      try {
        const [s, h] = await Promise.all([fetchPointStatus(), fetchPointHistory(1)]);
        if (!alive || mine !== requestSeq.current) return;
        setStatus(s);
        setEntries(h.entries);
      } catch {
        // 토스트는 곧 사라진다. 그것만 띄우고 화면을 통째로 비우면, 잠시 뒤에는
        // 실패했다는 사실조차 남지 않고 '포인트 기능이 없는 화면' 처럼 보인다.
        if (alive) {
          setFailed(true);
          toast.error('포인트 정보를 불러오지 못했습니다.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 같은 화면의 다른 곳에서 포인트를 쓰면(공격권 등) 잔액을 다시 불러온다.
  // 이것이 없으면 아래 공격권 칸의 잔액만 줄고 여기 적힌 숫자는 그대로라, 한 화면에
  // 서로 다른 잔액이 둘 뜬다.
  //
  // 0 은 첫 렌더라 건너뛴다 — 위의 첫 조회와 겹쳐 같은 것을 두 번 부르게 된다.
  useEffect(() => {
    if (refreshSignal === 0) return;
    void reload().catch(() => {});
  }, [refreshSignal, reload]);

  /** 결과가 나온 순간 — 잔액·내역 갱신과 알림·진동·신호를 여기서 한 번에 낸다 */
  const revealResult = useCallback(
    (isBlank: boolean, amount: number) => {
      void reload().catch(() => {});
      if (isBlank) {
        toast.info('이번에는 당첨되지 않았습니다.');
        buzz(18);
      } else {
        toast.success(`${amount.toLocaleString()}P 당첨!`);
        buzz([0, 28, 45, 28]);
        setCelebrate(c => c + 1);
      }
    },
    [reload]
  );

  const handleDraw = async () => {
    if (drawing || !status) return;
    setDrawing(true);
    setLast(null);

    // 릴에 띄울 숫자는 실제로 나올 수 있는 것만 넣는다.
    // 꽝 확률이 0 인 표에서 '0P' 가 지나가면 나올 수 없는 결과를 보여 주게 된다.
    const faces = [...status.prizes.map(p => p.amount), ...(status.blankWeight > 0 ? [0] : [])];
    const roll = motionOk;
    if (roll) {
      setReel(faces[0]);
      reelTimer.current = setInterval(() => {
        setReel(faces[Math.floor(Math.random() * faces.length)]);
      }, 70);
    }
    const startedAt = Date.now();

    try {
      const result = await drawLottery();

      // 서버가 곧바로 답하면 릴이 한 번 깜빡이고 끝난다 — 그러면 뽑았다는 느낌이 안 난다.
      // 결과는 이미 정해져 있고, 여기서 기다리는 건 보여 주기 위한 시간일 뿐이다.
      if (roll) {
        const left = ROLL_MS - (Date.now() - startedAt);
        if (left > 0) await new Promise(r => setTimeout(r, left));
      }

      setLast({ amount: result.amount, cost: result.cost, isBlank: result.isBlank });
      // 남은 횟수와 참가비 여유를 맞춘다 — 버튼을 막을지가 걸려 있다.
      setStatus(prev =>
        prev
          ? {
              ...prev,
              drawsToday: result.drawsToday,
              drawsLeft: result.drawsLeft,
              canAfford: result.balance >= prev.drawCost,
            }
          : prev
      );
      // 결과가 나오면 바로 보여 준다. 예전에는 '결과 확인' 덮개를 한 번 더 눌러야 했는데,
      // 하루에도 여러 번 누르는 자리라 그 한 단계가 번거로웠다.
      revealResult(result.isBlank, result.amount);
      // 뽑기만 알리지 않아서, 뽑아서 잔액이 줄어도 대결·공격권 판은 옛 잔액으로 버튼을 열어 뒀다
      onSpent?.();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '뽑기에 실패했습니다.';
      toast.error(message);
      // 한도 초과·잔액 부족처럼 서버 상태가 이미 바뀐 경우가 있어 다시 읽는다
      await reload().catch(() => {});
    } finally {
      if (reelTimer.current) {
        clearInterval(reelTimer.current);
        reelTimer.current = null;
      }
      setReel(null);
      setDrawing(false);
    }
  };

  const shownBalance = useCountUp(status?.balance ?? 0, motionOk, !!status);

  if (loading) return <LoadingSpinner size="sm" message="포인트 정보를 불러오는 중..." />;
  // 같은 폴더의 PointRanking·DuelPanel 과 같은 방식으로 실패를 실패라고 말한다
  if (failed || !status) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <ListState>포인트 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      </div>
    );
  }

  const soldOut = status.drawsLeft <= 0;

  const board = (
    <div
      aria-live="polite"
      className="flex h-24 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
    >
      {reel !== null ? (
        <span
          key={reel}
          className="animate-[pulse_0.5s_ease-in-out_infinite] text-3xl font-bold tabular-nums text-slate-400 dark:text-slate-500"
        >
          {reel.toLocaleString()}P
        </span>
      ) : last ? (
        <div className="text-center">
          <motion.p
            key={`${last.amount}-${celebrate}`}
            initial={motionOk ? { scale: 0.6, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            className={`text-3xl font-bold tabular-nums ${
              last.isBlank
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-secondary-600 dark:text-secondary-400'
            }`}
          >
            {last.isBlank ? '미당첨' : `+${last.amount.toLocaleString()}P`}
          </motion.p>
          {last.cost > 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              참가비 −{last.cost.toLocaleString()}P · 합계{' '}
              <span className="font-semibold">
                {last.amount - last.cost >= 0 ? '+' : ''}
                {(last.amount - last.cost).toLocaleString()}P
              </span>
            </p>
          )}
        </div>
      ) : (
        <span className="text-sm text-slate-400">결과가 여기에 표시됩니다</span>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">보유 포인트</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {shownBalance.toLocaleString()}
            <span className="ml-1 text-base font-semibold text-slate-500 dark:text-slate-400">
              P
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">오늘 남은 횟수</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {status.drawsLeft}
            <span className="text-slate-400"> / {status.dailyLimit}</span>
          </p>
        </div>

        {status.drawCost > 0 && (
          <div className="text-right">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">1회 참가비</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              −{status.drawCost.toLocaleString()}
              <span className="ml-1 text-base font-semibold text-slate-400">P</span>
            </p>
          </div>
        )}
      </div>

      {/* 추첨 표시창.
          누르면 숫자가 섞이고(서버를 기다리는 동안), 답이 오면 그 자리에 결과가 바로 뜬다.
          자리를 늘 차지하게 둬서, 결과가 나올 때 아래 내용이 밀리지 않는다. */}
      <div className="relative">
        {board}
        {celebrate > 0 && !last?.isBlank && <WinPulse key={celebrate} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleDraw()}
          disabled={drawing || soldOut || !status.canAfford}
          className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          {soldOut
            ? '오늘은 모두 사용했어요'
            : !status.canAfford
              ? '포인트가 모자랍니다'
              : status.drawCost > 0
                ? `뽑기 (−${status.drawCost.toLocaleString()}P)`
                : '뽑기'}
        </button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">당첨 확률</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700/60 dark:border-slate-700">
          {status.prizes.map(p => (
            <li key={p.amount} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {p.amount.toLocaleString()}P
              </span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{p.weight}%</span>
            </li>
          ))}
          {status.blankWeight > 0 && (
            <li className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">미당첨</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                {status.blankWeight}%
              </span>
            </li>
          )}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          접속하면 하루 한 번 출석 포인트 {status.attendanceBonus.toLocaleString()}P 가 자동으로
          쌓입니다.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">최근 내역</h3>
        {entries.length === 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            <ListState>아직 내역이 없습니다.</ListState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700/60 dark:border-slate-700">
            {entries.slice(0, 8).map(e => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <TicketCheck className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {e.memo ?? REASON_LABEL[e.reason]}
                  </span>
                </span>
                <span
                  className={`flex-shrink-0 font-semibold tabular-nums ${
                    e.amount > 0 ? 'text-secondary-600 dark:text-secondary-400' : 'text-slate-400'
                  }`}
                >
                  {e.amount > 0 ? `+${e.amount.toLocaleString()}` : e.amount.toLocaleString()}P
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
