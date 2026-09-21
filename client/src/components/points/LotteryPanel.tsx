import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Gift, Loader2, TicketCheck } from 'lucide-react';
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
import { PointsSection } from './PointsSection';
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

/** 숫자가 섞이는 최소 시간(ms) */
const ROLL_MS = 700;

/** 짧은 진동. 지원하지 않는 기기에서는 아무 일도 하지 않는다. */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 진동은 없어도 그만이다
  }
}

/** 숫자가 목표값까지 굴러 올라가게 한다. 처음 받은 값은 굴리지 않고 그대로 보여 준다. */
function useCountUp(target: number, enabled: boolean, ready: boolean): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const seeded = useRef(false);
  useEffect(() => {
    // 불러오는 동안의 0 을 시작점으로 삼으면 안 된다.
    if (!ready) return;
    // 화면이 숨겨져 있으면 requestAnimationFrame 이 멈추므로 굴리지 말고 바로 맞춘다.
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

/** 마이페이지의 포인트 뽑기. 결과와 확률·금액·횟수는 모두 서버가 정한다. */
export function LotteryPanel({
  refreshSignal = 0,
  onSpent,
}: {
  refreshSignal?: number;
  /** 뽑아서 잔액이 바뀌었을 때 같은 화면의 다른 판들이 다시 읽게 한다. */
  onSpent?: () => void;
}) {
  const [status, setStatus] = useState<PointStatus | null>(null);
  const [entries, setEntries] = useState<PointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [last, setLast] = useState<{ amount: number; cost: number; isBlank: boolean } | null>(null);
  /** 릴에 지금 떠 있는 숫자. null 이면 멈춘 상태. */
  const [reel, setReel] = useState<number | null>(null);
  const reelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 결과가 나온 순간 당첨 신호를 낸다 */
  const [celebrate, setCelebrate] = useState(0);
  const motionOk = !prefersReducedMotion();

  useEffect(
    () => () => {
      if (reelTimer.current) clearInterval(reelTimer.current);
    },
    []
  );

  // 응답이 보낸 순서대로 오지 않으므로 가장 나중에 보낸 요청의 응답만 반영한다.
  const requestSeq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++requestSeq.current;
    const [s, h] = await Promise.all([fetchPointStatus(), fetchPointHistory(1)]);
    if (mine !== requestSeq.current) return;
    setStatus(s);
    setEntries(h.entries);
    // 나중에 보낸 요청이 먼저 성공하면 그것으로 로딩·실패 화면을 끝낸다.
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
        // 토스트는 곧 사라지므로 화면에도 실패를 남긴다.
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

  // 같은 화면의 다른 곳에서 포인트를 쓰면 잔액을 다시 불러온다. 0 은 첫 렌더라 건너뛴다.
  useEffect(() => {
    if (refreshSignal === 0) return;
    void reload().catch(() => {});
  }, [refreshSignal, reload]);

  /** 결과가 나온 순간 잔액·내역 갱신과 알림·진동·신호를 한 번에 낸다. */
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

      // 결과는 이미 정해져 있고, 여기서 기다리는 것은 연출용 시간이다.
      if (roll) {
        const left = ROLL_MS - (Date.now() - startedAt);
        if (left > 0) await new Promise(r => setTimeout(r, left));
      }

      setLast({ amount: result.amount, cost: result.cost, isBlank: result.isBlank });
      // 남은 횟수와 참가비 여유를 맞춘다. 버튼을 막을지가 여기에 걸려 있다.
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
      revealResult(result.isBlank, result.amount);
      // 다른 판들이 옛 잔액으로 버튼을 열어 두지 않도록 알린다.
      onSpent?.();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        '뽑기에 실패했습니다.';
      toast.error(message);
      // 한도 초과·잔액 부족처럼 서버 상태가 이미 바뀐 경우가 있어 다시 읽는다.
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
      // 섞이는 숫자에는 aria-live 를 달지 않는다. 결과만 아래 role="status" 로 한 번 알린다.
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
          <p role="status" className="sr-only">
            {last.isBlank ? '미당첨입니다.' : `${last.amount.toLocaleString()}포인트 당첨입니다.`}
          </p>
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

  // 확률표 막대의 기준. 가장 흔한 것이 가득 찬다.
  const maxWeight = Math.max(1, status.blankWeight, ...status.prizes.map(p => p.weight));

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-lg shadow-primary-600/20 sm:p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-24 h-36 w-36 rounded-full bg-white/5"
        />
        <p className="relative flex items-center gap-1.5 text-xs font-medium text-white/75">
          <Coins className="h-3.5 w-3.5" />
          보유 포인트
        </p>
        <p className="relative mt-1 text-4xl font-extrabold tabular-nums tracking-tight">
          {shownBalance.toLocaleString()}
          <span className="ml-1 text-xl font-semibold text-white/70">P</span>
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium tabular-nums backdrop-blur-sm">
            🎟️ 오늘 남은 뽑기 {status.drawsLeft}/{status.dailyLimit}
          </span>
          {status.drawCost > 0 && (
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium tabular-nums backdrop-blur-sm">
              1회 참가비 −{status.drawCost.toLocaleString()}P
            </span>
          )}
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium tabular-nums backdrop-blur-sm">
            {status.attendanceClaimedToday ? '✅' : '📅'} 오늘 출석 +
            {status.attendanceBonus.toLocaleString()}P
          </span>
        </div>
      </div>

      <PointsSection
        icon={<Gift className="h-5 w-5" />}
        tone="amber"
        title="행운 뽑기"
        description={`접속하면 하루 한 번 출석 포인트 ${status.attendanceBonus.toLocaleString()}P 가 자동으로 쌓입니다.`}
      >
        {/* 추첨 표시창. 결과가 나올 때 아래가 밀리지 않도록 자리를 늘 차지한다. */}
        <div className="relative">
          {board}
          {celebrate > 0 && !last?.isBlank && <WinPulse key={celebrate} />}
        </div>

        <button
          type="button"
          onClick={() => void handleDraw()}
          disabled={drawing || soldOut || !status.canAfford}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-base font-bold text-white shadow-md shadow-amber-500/30 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none disabled:hover:translate-y-0 dark:focus-visible:ring-offset-slate-900 sm:w-auto"
        >
          {drawing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gift className="h-5 w-5" />}
          {soldOut
            ? '오늘은 모두 사용했어요'
            : !status.canAfford
              ? '포인트가 모자랍니다'
              : status.drawCost > 0
                ? `뽑기 (−${status.drawCost.toLocaleString()}P)`
                : '뽑기'}
        </button>

        <h4 className="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">
          당첨 확률
        </h4>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {status.prizes.map(p => (
            <li
              key={p.amount}
              className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
                  {p.amount.toLocaleString()}P
                </span>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {p.weight}%
                </span>
              </div>
              <div
                aria-hidden
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-500/10"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                  style={{ width: `${(p.weight / maxWeight) * 100}%` }}
                />
              </div>
            </li>
          ))}
          {status.blankWeight > 0 && (
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-slate-500 dark:text-slate-400">미당첨</span>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {status.blankWeight}%
                </span>
              </div>
              <div
                aria-hidden
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              >
                <div
                  className="h-full rounded-full bg-slate-400"
                  style={{ width: `${(status.blankWeight / maxWeight) * 100}%` }}
                />
              </div>
            </li>
          )}
        </ul>
      </PointsSection>

      <PointsSection
        icon={<TicketCheck className="h-5 w-5" />}
        tone="slate"
        title="포인트 내역"
        description="최근 8건입니다."
      >
        {entries.length === 0 ? (
          <ListState>아직 내역이 없습니다.</ListState>
        ) : (
          <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-700/60">
            {entries.slice(0, 8).map(e => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                      e.amount > 0
                        ? 'bg-secondary-100 text-secondary-600 dark:bg-secondary-500/15 dark:text-secondary-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700'
                    }`}
                  >
                    {e.amount > 0 ? '+' : '−'}
                  </span>
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
      </PointsSection>
    </div>
  );
}
