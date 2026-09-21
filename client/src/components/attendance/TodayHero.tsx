// 오늘 카드. 경과 시간은 이 안에서만 센다(부모에서 세면 아래 표까지 다시 그려진다).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LogIn, LogOut, RotateCcw } from 'lucide-react';
import type { AttendanceRecord } from '../../types/attendance.types';
import type { AttackKind } from '../../api/attendance';
import { ChaosButton } from './ChaosButton';
import { QuizGate } from './QuizGate';

/** 퇴근 취소 마감이 없을 때 쓰는 시각. 늘 지난 시각이라 남은 시간이 0 이다. */
const NEVER = new Date(0).toISOString();
import { prefersReducedMotion } from '../../utils/animations';
import { useCountdown } from '../../hooks/useCountdown';
import { formatClock, formatDay, formatMinutes, minutesBetween } from '../../utils/attendance';

interface Props {
  workDate: string;
  /** 지금 살아 있는 기록. 오늘 것이거나 자정을 넘겨 이어지는 어제 것. */
  record: AttendanceRecord | null;
  standardWorkMinutes: number;
  /** 오늘 몫을 아직 안 찍었는가. 어제 것이 안 닫혔어도 오늘 출근은 따로 찍을 수 있다. */
  canCheckIn: boolean;
  /** 자정을 넘겨 남은 어제 기록이 있으면 오늘 출근 전이라도 퇴근을 누를 수 있다 */
  canCheckOut: boolean;
  checkingOut: boolean;
  /** 지금 걸린 퇴근 공격의 종류. chaos 는 버튼이 도망다니고, hide 는 잠깐 누를 수 없다. */
  attackKind?: AttackKind | null;
  /** 걸린 공격이 풀리는 시각 */
  attackExpiresAt?: string | null;
  /** 쌓인 공격 수(1~10). 클수록 가짜가 늘어난다. */
  attackLevel?: number;
  onCheckIn: () => void;
  onCheckOut: () => void;
  /** 이 시각까지 퇴근을 되돌릴 수 있다. 없으면 null. */
  undoCheckOutUntil?: string | null;
  /** 서버 시각 − 내 시계. 남은 시간은 서버 기준으로 센다. */
  clockOffset?: number;
  undoingCheckOut?: boolean;
  onUndoCheckOut?: () => void;
}

/** 퇴근 취소 막대의 기준 길이(초). 서버 마감은 '퇴근 시각 + 11분' 이라 600 이 아니다. */
const UNDO_WINDOW_SECONDS = 660;

/** 퇴근 취소 단추. 퇴근 단추 자리에 대신 선다. */
function UndoCheckOut({ left, busy, onUndo }: { left: number; busy: boolean; onUndo: () => void }) {
  const m = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={busy}
      className="animate-popIn group relative inline-flex items-center gap-2 overflow-hidden rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
    >
      <RotateCcw className="h-4 w-4 transition-transform group-hover:-rotate-45" />
      퇴근 취소
      <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-700 dark:bg-slate-900/40 dark:text-amber-300">
        {m}:{ss}
      </span>
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 bg-amber-400 transition-[width] duration-1000 ease-linear"
        style={{ width: `${Math.min(100, (left / UNDO_WINDOW_SECONDS) * 100)}%` }}
      />
    </button>
  );
}

function secondsUntil(at: string | null, offsetMs = 0): number | null {
  if (!at) return null;
  return Math.max(0, Math.ceil((new Date(at).getTime() - (Date.now() + offsetMs)) / 1000));
}

/** 숨은 퇴근 버튼의 자리. 실제로 누를 수 없고 화면 낭독기에는 감춘다. */
function HiddenSlot({
  expiresAt,
  clockOffset = 0,
}: {
  expiresAt: string | null;
  clockOffset?: number;
}) {
  const [left, setLeft] = useState(() => secondsUntil(expiresAt, clockOffset));
  useEffect(() => {
    setLeft(secondsUntil(expiresAt, clockOffset));
    if (!expiresAt) return;
    const id = window.setInterval(() => setLeft(secondsUntil(expiresAt, clockOffset)), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, clockOffset]);

  const [teased, setTeased] = useState(0);
  useEffect(() => {
    if (teased === 0) return;
    const id = window.setTimeout(() => setTeased(0), 1400);
    return () => window.clearTimeout(id);
  }, [teased]);

  return (
    // disabled 버튼이 아니라 span 이다. Tab 으로도 잡히지 않아야 감춘 것이 된다.
    <span
      aria-hidden
      data-testid="checkout-slot"
      onClick={() => setTeased(k => k + 1)}
      className="relative inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
    >
      <span className="inline-flex items-center gap-2 opacity-0">
        <LogOut className="h-4 w-4" />
        퇴근
      </span>
      <span className="animate-poof absolute inset-0 flex items-center justify-center text-xl">
        💨
      </span>
      <span
        key={teased}
        className={`absolute inset-0 flex items-center justify-center gap-1 text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400 ${
          teased > 0 ? 'animate-chaosShake' : 'animate-fadeInLate'
        }`}
        style={teased > 0 ? { animationIterationCount: 2 } : undefined}
      >
        <span className="text-lg">🙈</span>
        {left !== null && left > 0 && <span>{left}</span>}
      </span>
      {teased > 0 && (
        // translate 와 scale 을 한 요소에 두면 애니메이션 transform 이 translate 를 덮는다.
        <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2">
          <span className="animate-popIn block whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
            아직 숨어 있어요
          </span>
        </span>
      )}
    </span>
  );
}

type Rect = { l: number; t: number; r: number; b: number };
type Decoy = { key: number; left: string; top: string; leaving: boolean };

/** 가짜 버튼 하나의 대략적인 크기(px). 겹침을 피할 때만 쓴다. */
const DECOY_W = 84;
const DECOY_H = 38;
const MARGIN = 8;

function decoyCount(level: number): number {
  return Math.min(10, 8 + Math.max(0, level - 1));
}

/** 가짜가 자리를 바꾸는 간격(ms) */
function blinkMs(level: number): number {
  return Math.max(220, 500 - 30 * (level - 1));
}

/** 가짜가 가리면 안 되는 영역. 진짜 버튼 위에 얹히면 그 버튼을 누를 수 없다. */
function blockedIn(card: HTMLElement, box: DOMRect): Rect[] {
  return [
    ...card.querySelectorAll<HTMLElement>(
      'button, a, input, [role="progressbar"], [data-testid="checkout-slot"]'
    ),
  ]
    .map(el => el.getBoundingClientRect())
    .map(r => ({
      l: r.left - box.left,
      t: r.top - box.top,
      r: r.right - box.left,
      b: r.bottom - box.top,
    }));
}

function hits(x: number, y: number, rects: Rect[]): boolean {
  return rects.some(
    r =>
      x < r.r + MARGIN &&
      x + DECOY_W > r.l - MARGIN &&
      y < r.b + MARGIN &&
      y + DECOY_H > r.t - MARGIN
  );
}

/** 이미 떠 있는 가짜들의 px 자리 */
function takenBy(decoys: Decoy[]): Rect[] {
  return decoys
    .filter(d => !d.leaving && d.left.endsWith('px'))
    .map(d => {
      const x = parseFloat(d.left);
      const y = parseFloat(d.top);
      return { l: x, t: y, r: x + DECOY_W, b: y + DECOY_H };
    });
}

/** 새 가짜 하나의 자리. 빈자리가 없으면 'none', 카드를 잴 수 없으면 null 을 준다. */
function pickSpot(
  card: HTMLElement | null,
  current: Decoy[]
): { left: string; top: string } | 'none' | null {
  if (!card) return null;
  const box = card.getBoundingClientRect();
  if (box.width < DECOY_W * 2 || box.height < DECOY_H * 2) return null;
  const avoid = [...blockedIn(card, box), ...takenBy(current)];
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = Math.round(Math.random() * (box.width - DECOY_W));
    const y = Math.round(8 + Math.random() * (box.height - DECOY_H - 16));
    if (!hits(x, y, avoid)) return { left: `${x}px`, top: `${y}px` };
  }
  return 'none';
}

function roughSpot(): { left: string; top: string } {
  return { left: `${4 + Math.random() * 80}%`, top: `${8 + Math.random() * 60}%` };
}

function Decoys({ count = 8, level = 1 }: { count?: number; level?: number }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [decoys, setDecoys] = useState<Decoy[]>([]);
  // 무엇을 없애고 띄울지는 상태 갱신 함수 밖에서 정한다. 안에서 정하면 StrictMode 가 두 번 부른다.
  const current = useRef<Decoy[]>([]);
  useEffect(() => {
    current.current = decoys;
  }, [decoys]);
  const nextKey = useRef(0);

  const spawn = (current: Decoy[]): Decoy | null => {
    const card = anchorRef.current?.closest<HTMLElement>('[data-chaos-bounds]') ?? null;
    const spot = pickSpot(card, current);
    if (spot === 'none') return null;
    return { key: ++nextKey.current, ...(spot ?? roughSpot()), leaving: false };
  };

  /** 떠나는 가짜는 연기로 흩어진 뒤 지운다 */
  const leave = (key: number) => {
    setDecoys(prev => prev.map(d => (d.key === key ? { ...d, leaving: true } : d)));
    window.setTimeout(() => setDecoys(prev => prev.filter(d => d.key !== key)), 450);
  };

  // 자리를 재려면 그려진 뒤여야 하므로 첫 그림은 비워 두고 layout effect 에서 채운다.
  useLayoutEffect(() => {
    const list: Decoy[] = [];
    for (let i = 0; i < count; i++) {
      const d = spawn(list);
      if (d) list.push(d);
    }
    setDecoys(list);
    // 숨기기 한 번에 한 번 채운다(부모가 공격마다 key 로 새로 그린다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 움직임 줄이기를 켠 사용자에게는 자리를 바꾸지 않는다.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      const alive = current.current.filter(d => !d.leaving);
      if (alive.length < count) {
        const born = spawn(alive);
        if (born) {
          setDecoys(prev => [...prev, born]);
          return;
        }
      }
      // 빈자리가 없을 때도 하나를 흩어 자리를 비운다. 좁은 화면에서 멈추지 않게.
      if (alive.length === 0) return;
      const out = alive[Math.floor(Math.random() * alive.length)];
      leave(out.key);
      const born = spawn(alive.filter(d => d.key !== out.key));
      if (born) setDecoys(prev => [...prev, born]);
    }, blinkMs(level));
    return () => window.clearInterval(id);
    // 흩어지는 중인 가짜를 지우는 타이머는 끊지 않는다. 끊으면 level 이 바뀔 때 영영 남는다.
  }, [count, level]);

  const [fooled, setFooled] = useState<{ left: string; top: string; key: number } | null>(null);
  useEffect(() => {
    if (!fooled) return;
    const id = window.setTimeout(() => setFooled(null), 1500);
    return () => window.clearTimeout(id);
  }, [fooled]);

  return (
    <>
      <span ref={anchorRef} hidden />
      {decoys.map(d => (
        <span
          key={d.key}
          aria-hidden
          data-testid="decoy"
          onClick={() => {
            if (d.leaving) return;
            setDecoys(prev => prev.filter(x => x.key !== d.key));
            setFooled({ left: d.left, top: d.top, key: d.key });
          }}
          className={`btn-secondary absolute z-10 select-none ${
            d.leaving ? 'animate-poof pointer-events-none' : 'animate-popIn cursor-pointer'
          }`}
          style={{ left: d.left, top: d.top }}
        >
          <LogOut className="h-4 w-4" />
          퇴근
        </span>
      ))}
      {fooled && (
        <span
          key={fooled.key}
          aria-hidden
          className="animate-popIn pointer-events-none absolute z-20 whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900"
          style={{ left: fooled.left, top: fooled.top }}
        >
          속았지롱 🙈
        </span>
      )}
    </>
  );
}

/** 분 단위로만 쓰므로 15초면 충분하다 */
const TICK_MS = 15_000;

function useTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function TodayHero({
  workDate,
  record,
  standardWorkMinutes,
  canCheckIn,
  canCheckOut,
  checkingOut,
  attackKind: incomingKind = null,
  attackExpiresAt = null,
  attackLevel = 1,
  onCheckIn,
  onCheckOut,
  undoCheckOutUntil = null,
  clockOffset = 0,
  undoingCheckOut = false,
  onUndoCheckOut,
}: Props) {
  const working = Boolean(record && !record.checkOutAt);
  // 방해는 퇴근을 누를 수 있을 때만. 아니면 가짜 버튼이 '퇴근 취소' 를 덮는다.
  const attackKind = canCheckOut ? incomingKind : null;

  const [quizOpen, setQuizOpen] = useState(false);
  const showQuiz = quizOpen && attackKind === 'quiz';
  // 공격이 끝나면 접어 둔다. 남겨 두면 다음 문제 내기 공격이 오자마자 스스로 열린다.
  useEffect(() => {
    if (attackKind !== 'quiz') setQuizOpen(false);
  }, [attackKind]);

  // 마감까지 남은 시간은 clockOffset 을 적용해 서버 시각 기준으로 센다.
  const undoLeft = useCountdown(undoCheckOutUntil ?? NEVER, undefined, clockOffset);
  const canUndo = Boolean(undoCheckOutUntil && onUndoCheckOut) && undoLeft > 0;

  // 숨기기가 풀려 버튼이 돌아오는 순간에만 튀어나오게 한다.
  const [popKey, setPopKey] = useState(0);
  const prevKind = useRef(attackKind);
  useEffect(() => {
    if (prevKind.current === 'hide' && attackKind !== 'hide') setPopKey(k => k + 1);
    prevKind.current = attackKind;
  }, [attackKind]);
  const now = useTick(!record || working);

  const minutes = record
    ? working
      ? minutesBetween(record.checkInAt, now)
      : (record.workMinutes ?? 0)
    : 0;
  const percent = Math.min(100, Math.round((minutes / Math.max(1, standardWorkMinutes)) * 100));

  const state = !record ? 'before' : working ? 'working' : 'done';
  const badge = {
    before: {
      text: '출근 전',
      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    },
    working: {
      text: '근무 중',
      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    done: {
      text: '퇴근 완료',
      cls: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300',
    },
  }[state];

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const carried = record && record.workDate !== workDate ? record.workDate : null;

  return (
    // data-chaos-bounds 와 relative 는 ChaosButton·Decoys 가 이 카드를 기준 삼는 데 쓴다.
    <section data-chaos-bounds className="card relative overflow-hidden">
      {attackKind === 'hide' && (
        <Decoys
          key={attackExpiresAt ?? 'hide'}
          count={decoyCount(attackLevel)}
          level={attackLevel}
        />
      )}
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
              {badge.text}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{workDate}</span>
          </div>

          <p className="mt-2 text-4xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
            {record ? formatMinutes(minutes) : clock}
          </p>

          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {record ? (
              <>
                출근{' '}
                {carried && (
                  <span className="tabular-nums text-amber-600">{formatDay(carried)}</span>
                )}{' '}
                <span className="tabular-nums">{formatClock(record.checkInAt)}</span>
                {record.checkOutAt && (
                  <>
                    {' · '}퇴근{' '}
                    <span className="tabular-nums">{formatClock(record.checkOutAt)}</span>
                  </>
                )}
              </>
            ) : (
              '출근 기록 없음'
            )}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onCheckIn}
            disabled={!canCheckIn}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogIn className="h-4 w-4" />
            출근
          </button>
          {canUndo ? (
            <UndoCheckOut left={undoLeft} busy={undoingCheckOut} onUndo={onUndoCheckOut!} />
          ) : attackKind === 'hide' ? (
            <HiddenSlot expiresAt={attackExpiresAt} clockOffset={clockOffset} />
          ) : (
            <span key={popKey} className={`inline-flex ${popKey > 0 ? 'animate-popIn' : ''}`}>
              <ChaosButton active={attackKind === 'chaos'} level={attackLevel}>
                <button
                  type="button"
                  onClick={attackKind === 'quiz' ? () => setQuizOpen(true) : onCheckOut}
                  disabled={!canCheckOut || checkingOut}
                  aria-expanded={attackKind === 'quiz' ? showQuiz : undefined}
                  className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" />
                  퇴근
                  {attackKind === 'quiz' && <span aria-hidden>🧮</span>}
                </button>
              </ChaosButton>
            </span>
          )}
        </div>
      </div>

      {showQuiz && (
        <QuizGate
          key={attackExpiresAt ?? 'quiz'}
          level={attackLevel}
          onSolved={() => {
            setQuizOpen(false);
            onCheckOut();
          }}
          onClose={() => setQuizOpen(false)}
        />
      )}

      {record && (
        <div className="px-5 pb-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>기준 {formatMinutes(standardWorkMinutes)}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="기준 근무 시간 대비 진행"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                working ? 'bg-emerald-500' : 'bg-primary-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
