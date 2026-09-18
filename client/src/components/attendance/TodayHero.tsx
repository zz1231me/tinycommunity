// client/src/components/attendance/TodayHero.tsx
// 오늘 카드 — 지금 상태와 큰 숫자 하나.
//
// 경과 시간은 이 안에서만 센다. 부모에서 세면 시간이 바뀔 때마다 아래 표까지
// 함께 다시 그려진다.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import type { AttendanceRecord } from '../../types/attendance.types';
import type { AttackKind } from '../../api/attendance';
import { ChaosButton } from './ChaosButton';
import { formatClock, formatDay, formatMinutes, minutesBetween } from '../../utils/attendance';

interface Props {
  workDate: string;
  /** 지금 살아 있는 기록 — 오늘 것이거나, 자정을 넘겨 이어지는 어제 것 */
  record: AttendanceRecord | null;
  standardWorkMinutes: number;
  /** 오늘 몫을 아직 안 찍었는가. 어제 것이 안 닫혔어도 오늘 출근은 따로 찍을 수 있다. */
  canCheckIn: boolean;
  /** 자정을 넘겨 남은 어제 기록이 있으면 오늘 출근 전이라도 퇴근을 누를 수 있다 */
  canCheckOut: boolean;
  checkingOut: boolean;
  /**
   * 지금 걸린 퇴근 공격의 종류 (없으면 null).
   *  · chaos — 버튼이 도망다니고 깜빡인다. 막지는 않는다.
   *  · hide  — 버튼이 잠깐 사라진다. 그동안은 정말로 누를 수 없다.
   */
  attackKind?: AttackKind | null;
  /** 걸린 공격이 풀리는 시각 — 숨기기의 남은 초를 센다 */
  attackExpiresAt?: string | null;
  /** 쌓인 공격 수(1~10). 클수록 버튼이 사나워지고 가짜가 늘어난다. */
  attackLevel?: number;
  onCheckIn: () => void;
  onCheckOut: () => void;
}

function secondsUntil(at: string | null): number | null {
  if (!at) return null;
  return Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 1000));
}

/**
 * 숨은 퇴근 버튼의 자리 — 연기(💨)가 흩어지고 🙈 와 남은 초가 앉는다.
 *
 * 누르면 흔들리며 "아직 숨어 있어요". 그래도 눌리지는 않는다 — 숨기기는 그 짧은 동안
 * 정말로 누를 수 없는 공격이다. 화면 낭독기에는 감춘다(경고 띠가 같은 말을 한다).
 */
function HiddenSlot({ expiresAt }: { expiresAt: string | null }) {
  const [left, setLeft] = useState(() => secondsUntil(expiresAt));
  useEffect(() => {
    setLeft(secondsUntil(expiresAt));
    if (!expiresAt) return;
    const id = window.setInterval(() => setLeft(secondsUntil(expiresAt)), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const [teased, setTeased] = useState(0);
  useEffect(() => {
    if (teased === 0) return;
    const id = window.setTimeout(() => setTeased(0), 1400);
    return () => window.clearTimeout(id);
  }, [teased]);

  return (
    // 자리는 그대로 남긴다(같은 크기). 버튼이 빠지면 줄이 줄어들어 옆의 출근 버튼까지 움직인다.
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
        // 위치 잡기(가운데 정렬 translate)와 튀어나오기(scale)를 한 요소에 두면
        // 애니메이션의 transform 이 translate 를 덮어 말풍선이 옆으로 밀린다 — 둘로 나눈다.
        <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2">
          <span className="animate-popIn block whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
            아직 숨어 있어요
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * 숨기기 동안 카드 여기저기에 뜨는 가짜 퇴근 버튼.
 *
 * 누르면 "속았지롱 🙈" 하고 터져 사라진다. 기록은 아무것도 남지 않는다 — onClick 은
 * 화면 안의 장난일 뿐 서버를 부르지 않는다.
 *
 * 화면 낭독기·키보드 사용자는 속이지 않는다: aria-hidden 이고 Tab 으로 잡히지 않는
 * span 이다. 그 사람들에게는 경고 띠가 '버튼이 보이지 않습니다' 라고 말한다.
 */
type Spot = { left: string; top: string };

/** 가짜 버튼 하나의 대략적인 크기(px) — 겹침을 피할 때만 쓴다 */
const DECOY_W = 84;
const DECOY_H = 38;

/**
 * 카드 안에서 진짜 조작 요소를 피한 자리 셋.
 *
 * 가짜가 진짜 버튼 위에 얹히면 그 버튼을 누를 수 없다. 퇴근이 숨은 동안에도 출근
 * (어제 기록이 안 닫힌 채 오늘 출근 전인 사람)은 살아 있어야 한다 — 장난이 다른 기능을
 * 막으면 선을 넘는다. 그래서 카드 안의 버튼·링크를 재서 그 자리를 비켜 고른다.
 *
 * 잴 수 없으면(크기 0 — 테스트 환경 등) null.
 */
function measuredSpots(card: HTMLElement, count: number): Spot[] | null {
  const box = card.getBoundingClientRect();
  if (box.width < DECOY_W * 2 || box.height < DECOY_H * 2) return null;
  // 숨은 자리(🙈 와 남은 초)도 피한다 — 가리면 언제 돌아오는지 안 보인다
  const blocked = [
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

  const MARGIN = 8;
  const hits = (x: number, y: number, rects: typeof blocked) =>
    rects.some(
      r =>
        x < r.r + MARGIN &&
        x + DECOY_W > r.l - MARGIN &&
        y < r.b + MARGIN &&
        y + DECOY_H > r.t - MARGIN
    );

  const spots: Spot[] = [];
  const taken: typeof blocked = [];
  for (let i = 0; i < count; i++) {
    // 카드를 여러 칸으로 나눠 한 칸에 하나씩 — 한쪽에 몰리면 가짜인 게 바로 보인다
    const lane = (box.width - DECOY_W) / count;
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.round(lane * i + Math.random() * lane);
      const y = Math.round(8 + Math.random() * (box.height - DECOY_H - 16));
      if (hits(x, y, blocked) || hits(x, y, taken)) continue;
      spots.push({ left: `${x}px`, top: `${y}px` });
      taken.push({ l: x, t: y, r: x + DECOY_W, b: y + DECOY_H });
      break;
    }
  }
  return spots;
}

/** 잴 수 없을 때의 자리 — 비율로 흩어 둔다 */
function roughSpots(count: number): Spot[] {
  const lane = 90 / count;
  return Array.from({ length: count }, (_, i) => ({
    left: `${4 + i * lane + Math.random() * (lane * 0.5)}%`,
    top: `${10 + Math.random() * 55}%`,
  }));
}

/** 쌓인 수만큼 가짜가 늘어난다 — 하나일 때 셋, 최대 여덟 */
function decoyCount(level: number): number {
  return Math.min(8, 3 + Math.max(0, level - 1));
}

function Decoys({ count = 3 }: { count?: number }) {
  // 숨기기 한 번에 자리를 한 번 정한다(부모가 공격마다 key 로 새로 그린다).
  // 자리를 재려면 그려진 뒤여야 하므로 첫 그림은 비워 두고, 그리기 직전(layout effect)에 정한다 —
  // 화면에는 자리 잡은 뒤의 모습만 나온다.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  useLayoutEffect(() => {
    const card = anchorRef.current?.closest<HTMLElement>('[data-chaos-bounds]');
    setSpots((card && measuredSpots(card, count)) ?? roughSpots(count));
    // 숨기기 한 번에 한 번 정한다(부모가 공격마다 key 로 새로 그린다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [popped, setPopped] = useState<number[]>([]);
  const [fooled, setFooled] = useState<{ at: number; key: number } | null>(null);
  useEffect(() => {
    if (!fooled) return;
    const id = window.setTimeout(() => setFooled(null), 1500);
    return () => window.clearTimeout(id);
  }, [fooled]);

  return (
    <>
      <span ref={anchorRef} hidden />
      {spots.map((spot, i) =>
        popped.includes(i) ? null : (
          <span
            key={i}
            aria-hidden
            data-testid="decoy"
            onClick={() => {
              setPopped(prev => [...prev, i]);
              setFooled({ at: i, key: Date.now() });
            }}
            className="btn-secondary animate-popIn absolute z-10 cursor-pointer select-none"
            style={{ left: spot.left, top: spot.top, animationDelay: `${i * 120}ms` }}
          >
            <LogOut className="h-4 w-4" />
            퇴근
          </span>
        )
      )}
      {fooled && (
        <span
          key={fooled.key}
          aria-hidden
          className="animate-popIn pointer-events-none absolute z-20 whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900"
          style={{ left: spots[fooled.at].left, top: spots[fooled.at].top }}
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
  attackKind = null,
  attackExpiresAt = null,
  attackLevel = 1,
  onCheckIn,
  onCheckOut,
}: Props) {
  const working = Boolean(record && !record.checkOutAt);

  // 숨기기가 풀려 버튼이 돌아오는 순간에만 톡 튀어나오게 한다. 처음 그릴 때나
  // 방해가 풀릴 때는 움직이지 않는다 — 버튼이 괜히 들썩이면 그것도 방해다.
  const [popKey, setPopKey] = useState(0);
  const prevKind = useRef(attackKind);
  useEffect(() => {
    if (prevKind.current === 'hide' && attackKind !== 'hide') setPopKey(k => k + 1);
    prevKind.current = attackKind;
  }, [attackKind]);
  // 퇴근까지 찍고 나면 더 셀 것이 없다
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
  // 어제 찍고 이어 일하는 중이면 시각만으로는 언제부터인지 알 수 없다
  const carried = record && record.workDate !== workDate ? record.workDate : null;

  return (
    // data-chaos-bounds: 방해받는 퇴근 버튼이 이 카드 안 어디로든 달아난다(ChaosButton).
    // relative: 숨기기 동안 카드 여기저기에 가짜 퇴근 버튼을 띄운다(Decoys).
    <section data-chaos-bounds className="card relative overflow-hidden">
      {attackKind === 'hide' && (
        <Decoys key={attackExpiresAt ?? 'hide'} count={decoyCount(attackLevel)} />
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

        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={onCheckIn}
            disabled={!canCheckIn}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogIn className="h-4 w-4" />
            출근
          </button>
          {attackKind === 'hide' ? (
            // 숨기기 공격 — 잠깐 동안 버튼 자체가 없다.
            //
            // 자리는 그대로 남긴다(같은 크기의 투명한 자리). 버튼이 빠지면 줄이
            // 줄어들어 옆의 출근 버튼까지 움직인다.
            //
            // disabled 버튼이 아니라 span 이다. 안 보이는 버튼을 눌리게 두면
            // "보이지도 않는데 눌렸다" 가 되고, Tab 으로도 잡히지 않아야 감춘 것이 된다.
            //
            // 사라진 자리에는 점선 흔적을 남기고 연기(💨)가 흩어진 뒤 🙈 가 앉는다.
            // 그냥 비워 두면 버튼이 고장 난 건지 숨겨진 건지 알 수 없다.
            <HiddenSlot expiresAt={attackExpiresAt} />
          ) : (
            /* 방해를 받는 중에도 버튼은 살아 있다 — 성가실 뿐 끝내 눌린다 */
            <span key={popKey} className={`inline-flex ${popKey > 0 ? 'animate-popIn' : ''}`}>
              <ChaosButton active={attackKind === 'chaos'} level={attackLevel}>
                <button
                  type="button"
                  onClick={onCheckOut}
                  disabled={!canCheckOut || checkingOut}
                  className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" />
                  퇴근
                </button>
              </ChaosButton>
            </span>
          )}
        </div>
      </div>

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
