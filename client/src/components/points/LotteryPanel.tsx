// client/src/components/points/LotteryPanel.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
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

const REASON_LABEL: Record<PointEntry['reason'], string> = {
  lottery: '뽑기',
  lottery_cost: '참가비',
  attendance: '출석',
  admin: '관리자',
};

/** 릴이 도는 최소 시간(ms). 서버가 곧바로 답해도 이만큼은 굴러야 '뽑았다'로 읽힌다 */
const ROLL_MS = 900;

/** 움직임을 줄여 달라고 설정한 사람에게는 릴을 굴리지 않는다 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/**
 * 마이페이지의 포인트 뽑기.
 *
 * 결과는 서버가 정한다 — 이 화면은 눌러서 받아 적을 뿐이고, 확률·금액·횟수도
 * 서버에서 내려온 값을 그대로 보여준다(바꾸는 곳은 관리자 페이지다).
 */
export function LotteryPanel() {
  const [status, setStatus] = useState<PointStatus | null>(null);
  const [entries, setEntries] = useState<PointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [last, setLast] = useState<{ amount: number; cost: number; isBlank: boolean } | null>(null);
  /** 릴에 지금 떠 있는 숫자. null 이면 릴이 멈춘 상태 */
  const [reel, setReel] = useState<number | null>(null);
  const reelTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 화면을 떠날 때 릴이 계속 돌지 않도록 정리한다
  useEffect(
    () => () => {
      if (reelTimer.current) clearInterval(reelTimer.current);
    },
    []
  );

  const reload = useCallback(async () => {
    const [s, h] = await Promise.all([fetchPointStatus(), fetchPointHistory(1)]);
    setStatus(s);
    setEntries(h.entries);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, h] = await Promise.all([fetchPointStatus(), fetchPointHistory(1)]);
        if (!alive) return;
        setStatus(s);
        setEntries(h.entries);
      } catch {
        if (alive) toast.error('포인트 정보를 불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleDraw = async () => {
    if (drawing || !status) return;
    setDrawing(true);
    setLast(null);

    // 릴에 띄울 숫자는 실제로 나올 수 있는 것만 넣는다.
    // 꽝 확률이 0 인 표에서 '0P' 가 지나가면 나올 수 없는 결과를 보여 주게 된다.
    const faces = [...status.prizes.map(p => p.amount), ...(status.blankWeight > 0 ? [0] : [])];
    const roll = !prefersReducedMotion();
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
      await reload();
      if (result.isBlank) toast.info('아쉽지만 꽝입니다.');
      else toast.success(`${result.amount.toLocaleString()}P 당첨!`);
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

  if (loading) return <LoadingSpinner size="sm" message="포인트 정보를 불러오는 중..." />;
  if (!status) return null;

  const soldOut = status.drawsLeft <= 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">보유 포인트</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {status.balance.toLocaleString()}
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

      {/* 추첨 표시창 — 도는 동안 나올 수 있는 금액들이 지나가고, 멈추면 결과가 남는다.
          자리를 늘 차지하게 둬서, 결과가 나올 때 아래 내용이 밀리지 않는다. */}
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
            <p
              className={`text-3xl font-bold tabular-nums ${
                last.isBlank
                  ? 'text-slate-400 dark:text-slate-500'
                  : 'text-secondary-600 dark:text-secondary-400'
              }`}
            >
              {last.isBlank ? '꽝' : `+${last.amount.toLocaleString()}P`}
            </p>
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
          <span className="text-sm text-slate-400">뽑기를 눌러 보세요</span>
        )}
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
              <span className="text-slate-500 dark:text-slate-400">꽝</span>
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
