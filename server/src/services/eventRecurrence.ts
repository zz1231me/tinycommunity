// 반복 일정을 실제 날짜들로 펼친다.
//
// 반복은 한 줄(규칙)로 저장하고 보여 줄 때만 펼친다. 미리 수백 건을 만들어 두면
// 규칙을 고칠 때 이미 만든 것들과 어긋나고, 지우다 만 찌꺼기가 남는다.
//
// 날짜 계산은 저장된 Date 에 지역 시간 기준으로 더한다(setDate/setMonth). UTC 로 더하면
// 서머타임이 있는 지역에서 '매주 월요일 10시' 가 9시나 11시로 밀린다.

/** 한 번에 펼칠 수 있는 최대 횟수. 규칙이 잘못돼도 응답이 폭주하지 않게 한다. */
export const MAX_OCCURRENCES = 500;
/**
 * 돌 수 있는 최대 바퀴. 내놓는 개수만 묶으면 모자란다 — 1990년에 시작한 '매일' 반복을
 * 2026년 창에서 보면, 한 건도 내놓지 않으면서 1만 3천 바퀴를 돈다.
 * 아래에서 범위 앞은 건너뛰고 세지만, 계산이 어긋나도 여기서 멈춘다.
 */
export const MAX_STEPS = 5000;
const DAY_MS = 86_400_000;

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  start: Date;
  end: Date;
  recurrenceType?: RecurrenceType | null;
  recurrenceInterval?: number | null;
  /** 주간 반복에서 쓰는 요일(0=일 ~ 6=토) */
  recurrenceDays?: number[] | null;
  recurrenceEndDate?: Date | null;
  /** 건너뛸 날짜(YYYY-MM-DD) */
  recurrenceExcept?: string[] | null;
}

export interface Occurrence {
  start: Date;
  end: Date;
  /** 이 번째의 날짜(YYYY-MM-DD). 하루만 건너뛸 때 이 값으로 집는다. */
  date: string;
}

/** 지역 시간 기준 YYYY-MM-DD. 반복 예외는 사람이 보는 날짜로 집는다. */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 같은 시:분:초를 지키며 날짜만 옮긴다 */
function at(base: Date, year: number, month: number, day: number): Date {
  const d = new Date(base);
  d.setFullYear(year, month, day);
  return d;
}

/**
 * [rangeStart, rangeEnd] 안에 걸치는 반복 일정의 각 번째를 돌려준다.
 *
 * 반복이 아니면 원래 일정 하나다. 끝나는 시각은 처음 일정의 길이를 그대로 쓴다 —
 * 2시간짜리 회의는 매주 2시간이다.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): Occurrence[] {
  const duration = rule.end.getTime() - rule.start.getTime();
  const type = rule.recurrenceType ?? 'none';
  const skip = new Set(rule.recurrenceExcept ?? []);

  const make = (start: Date): Occurrence => ({
    start,
    end: new Date(start.getTime() + duration),
    date: localDate(start),
  });

  const overlaps = (occ: Occurrence) => occ.start <= rangeEnd && occ.end >= rangeStart;

  if (type === 'none') {
    const only = make(new Date(rule.start));
    return overlaps(only) && !skip.has(only.date) ? [only] : [];
  }

  const interval = Math.max(1, Math.trunc(rule.recurrenceInterval ?? 1));
  // 반복 종료일은 '그 날까지' 다. 23:59:59 로 두어 당일 일정이 잘리지 않게 한다.
  const until = rule.recurrenceEndDate ? new Date(rule.recurrenceEndDate) : null;
  if (until) until.setHours(23, 59, 59, 999);

  const out: Occurrence[] = [];
  const push = (start: Date) => {
    if (until && start > until) return false;
    if (start.getTime() - duration > rangeEnd.getTime()) return false;
    const occ = make(start);
    if (overlaps(occ) && !skip.has(occ.date)) out.push(occ);
    return true;
  };

  if (type === 'weekly') {
    // 요일을 주지 않으면 처음 일정의 요일로 본다
    const days = (rule.recurrenceDays?.length ? rule.recurrenceDays : [rule.start.getDay()])
      .filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (days.length === 0) return [];

    // 처음 일정이 있는 주의 일요일부터 센다
    const weekStart = new Date(rule.start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // 범위보다 앞선 주는 한 주씩 세지 않고 건너뛴다
    const weekMs = interval * 7 * DAY_MS;
    const firstWeek = Math.max(
      0,
      Math.floor((rangeStart.getTime() - duration - weekStart.getTime()) / weekMs)
    );
    for (
      let week = firstWeek, steps = 0;
      out.length < MAX_OCCURRENCES && steps < MAX_STEPS;
      week += 1, steps += 1
    ) {
      const base = new Date(weekStart);
      base.setDate(base.getDate() + week * interval * 7);
      if (base.getTime() - duration > rangeEnd.getTime()) break;
      if (until && base > until) break;

      let anyPushed = false;
      for (const day of days) {
        const occStart = new Date(base);
        occStart.setDate(base.getDate() + day);
        // 처음 일정보다 앞선 날은 아직 시작 전이다
        if (occStart < rule.start) continue;
        anyPushed = push(occStart) || anyPushed;
      }
      // 범위를 완전히 지나쳤으면 멈춘다
      if (!anyPushed && base > rangeEnd) break;
    }
    return out;
  }

  // 범위보다 앞선 번째는 하나씩 세지 않고 건너뛴다(해마다·달마다 도는 비용을 없앤다)
  const ahead = rangeStart.getTime() - duration - rule.start.getTime();
  let first = 0;
  if (ahead > 0) {
    if (type === 'daily') {
      first = Math.floor(ahead / (interval * DAY_MS));
    } else if (type === 'monthly') {
      const months =
        (rangeStart.getFullYear() - rule.start.getFullYear()) * 12 +
        (rangeStart.getMonth() - rule.start.getMonth());
      first = Math.max(0, Math.floor((months - 1) / interval));
    } else {
      const years = rangeStart.getFullYear() - rule.start.getFullYear();
      first = Math.max(0, Math.floor((years - 1) / interval));
    }
  }

  for (
    let i = first, steps = 0;
    out.length < MAX_OCCURRENCES && steps < MAX_STEPS;
    i += 1, steps += 1
  ) {
    let occStart: Date;
    if (type === 'daily') {
      occStart = new Date(rule.start);
      occStart.setDate(occStart.getDate() + i * interval);
    } else if (type === 'monthly') {
      const month = rule.start.getMonth() + i * interval;
      const year = rule.start.getFullYear() + Math.floor(month / 12);
      const normalized = ((month % 12) + 12) % 12;
      // 31일에 걸어 둔 반복은 31일이 없는 달을 건너뛴다. 30일로 당기면 '말일' 과 헷갈린다.
      const daysInMonth = new Date(year, normalized + 1, 0).getDate();
      if (rule.start.getDate() > daysInMonth) {
        if (new Date(year, normalized, 1) > (until ?? rangeEnd)) break;
        continue;
      }
      occStart = at(rule.start, year, normalized, rule.start.getDate());
    } else {
      // yearly — 2월 29일은 윤년에만 선다
      const year = rule.start.getFullYear() + i * interval;
      const daysInMonth = new Date(year, rule.start.getMonth() + 1, 0).getDate();
      if (rule.start.getDate() > daysInMonth) {
        if (new Date(year, 11, 31) > (until ?? rangeEnd)) break;
        continue;
      }
      occStart = at(rule.start, year, rule.start.getMonth(), rule.start.getDate());
    }

    if (!push(occStart)) break;
  }

  return out;
}
