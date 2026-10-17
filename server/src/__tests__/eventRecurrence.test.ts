import { expandOccurrences, localDate, MAX_OCCURRENCES } from '../services/eventRecurrence';

// 반복 일정을 실제 날짜들로 펼치는 계산.
//
// 규칙 한 줄만 저장하고 보여 줄 때 펼친다. 날짜 계산이 틀리면 '매주 월요일 회의' 가
// 엉뚱한 요일에 서거나, 한 번만 쉬기로 한 날에 그대로 선다.
//
// 지켜야 하는 선:
//  1. 길이를 지킨다 — 2시간짜리 회의는 매주 2시간.
//  2. 종료일은 그 날까지 포함한다.
//  3. 없는 날짜(31일 없는 달, 평년의 2월 29일)는 당기지 않고 건너뛴다.
//  4. 건너뛰기로 집은 날은 서지 않는다.
//  5. 규칙이 잘못돼도 끝없이 펼치지 않는다.

// 날짜만 적으면 UTC 자정으로 읽혀, 계산이 지역 시간인 이 함수와 시간대마다 어긋난다
// (CI 는 UTC, 개발 기계는 KST 였다). 테스트에서는 지역 시각을 분명히 적는다.
const d = (iso: string) => new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
const endOf = (date: string) => new Date(`${date}T23:59:59`);
const dates = (list: { date: string }[]) => list.map(o => o.date);

describe('반복 없음', () => {
  it('범위에 걸치면 하나, 아니면 없음', () => {
    const rule = { start: d('2026-10-15T10:00:00'), end: d('2026-10-15T11:00:00') };

    expect(dates(expandOccurrences(rule, d('2026-10-01'), endOf('2026-10-31')))).toEqual([
      '2026-10-15',
    ]);
    expect(expandOccurrences(rule, d('2026-11-01'), endOf('2026-11-30'))).toHaveLength(0);
  });
});

describe('매일', () => {
  it('간격만큼 띄워 선다', () => {
    const out = expandOccurrences(
      {
        start: d('2026-10-01T09:00:00'),
        end: d('2026-10-01T09:30:00'),
        recurrenceType: 'daily',
        recurrenceInterval: 3,
        recurrenceEndDate: d('2026-10-10'),
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(dates(out)).toEqual(['2026-10-01', '2026-10-04', '2026-10-07', '2026-10-10']);
  });

  it('길이를 그대로 지킨다', () => {
    const [first] = expandOccurrences(
      {
        start: d('2026-10-01T09:00:00'),
        end: d('2026-10-01T11:00:00'),
        recurrenceType: 'daily',
        recurrenceEndDate: d('2026-10-02'),
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(first.end.getTime() - first.start.getTime()).toBe(2 * 60 * 60 * 1000);
  });
});

describe('매주', () => {
  it('고른 요일마다 선다', () => {
    // 2026-10-05 는 월요일
    const out = expandOccurrences(
      {
        start: d('2026-10-05T10:00:00'),
        end: d('2026-10-05T11:00:00'),
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3], // 월·수
        recurrenceEndDate: d('2026-10-15'),
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(dates(out)).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14']);
  });

  it('요일을 주지 않으면 처음 일정의 요일을 쓴다', () => {
    const out = expandOccurrences(
      {
        start: d('2026-10-05T10:00:00'),
        end: d('2026-10-05T11:00:00'),
        recurrenceType: 'weekly',
        recurrenceEndDate: d('2026-10-26'),
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(dates(out)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('처음 일정보다 앞선 요일은 아직 시작 전이다', () => {
    // 수요일에 만든 '월·수' 반복 — 그 주 월요일은 서지 않는다
    const out = expandOccurrences(
      {
        start: d('2026-10-07T10:00:00'),
        end: d('2026-10-07T11:00:00'),
        recurrenceType: 'weekly',
        recurrenceDays: [1, 3],
        recurrenceEndDate: d('2026-10-14'),
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(dates(out)).toEqual(['2026-10-07', '2026-10-12', '2026-10-14']);
  });
});

describe('매월·매년 — 없는 날짜', () => {
  it('31일 반복은 31일이 없는 달을 건너뛴다 — 30일로 당기지 않는다', () => {
    const out = expandOccurrences(
      {
        start: d('2026-01-31T09:00:00'),
        end: d('2026-01-31T10:00:00'),
        recurrenceType: 'monthly',
        recurrenceEndDate: d('2026-05-31'),
      },
      d('2026-01-01'),
      endOf('2026-12-31')
    );

    expect(dates(out)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('2월 29일 반복은 윤년에만 선다', () => {
    const out = expandOccurrences(
      {
        start: d('2024-02-29T09:00:00'),
        end: d('2024-02-29T10:00:00'),
        recurrenceType: 'yearly',
        recurrenceEndDate: d('2032-12-31'),
      },
      d('2024-01-01'),
      endOf('2032-12-31')
    );

    expect(dates(out)).toEqual(['2024-02-29', '2028-02-29', '2032-02-29']);
  });
});

describe('종료일과 범위', () => {
  it('종료일 당일까지 포함한다', () => {
    const out = expandOccurrences(
      {
        start: d('2026-10-01T09:00:00'),
        end: d('2026-10-01T10:00:00'),
        recurrenceType: 'daily',
        recurrenceEndDate: d('2026-10-03T00:00:00'),
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(dates(out)).toContain('2026-10-03');
  });

  it('보는 범위 밖은 주지 않는다', () => {
    const out = expandOccurrences(
      {
        start: d('2026-01-01T09:00:00'),
        end: d('2026-01-01T10:00:00'),
        recurrenceType: 'daily',
        recurrenceEndDate: d('2026-12-31'),
      },
      d('2026-06-01'),
      endOf('2026-06-03')
    );

    expect(dates(out)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });
});

describe('하루만 쉬기', () => {
  it('건너뛰기로 집은 날은 서지 않는다', () => {
    const out = expandOccurrences(
      {
        start: d('2026-10-05T10:00:00'),
        end: d('2026-10-05T11:00:00'),
        recurrenceType: 'weekly',
        recurrenceEndDate: d('2026-10-26'),
        recurrenceExcept: ['2026-10-12'],
      },
      d('2026-10-01'),
      endOf('2026-10-31')
    );

    expect(dates(out)).toEqual(['2026-10-05', '2026-10-19', '2026-10-26']);
  });
});

describe('끝없이 펼치지 않는다', () => {
  it('종료일이 없어도 상한에서 멈춘다', () => {
    const out = expandOccurrences(
      {
        start: d('2020-01-01T09:00:00'),
        end: d('2020-01-01T10:00:00'),
        recurrenceType: 'daily',
      },
      d('2020-01-01'),
      endOf('2099-12-31')
    );

    expect(out.length).toBeLessThanOrEqual(MAX_OCCURRENCES);
  });
});

describe('날짜 표기', () => {
  it('지역 시간 기준 YYYY-MM-DD 로 집는다', () => {
    expect(localDate(d('2026-10-05T23:30:00'))).toBe('2026-10-05');
  });
});

// 내놓는 개수만 묶으면 모자란다. 오래전에 시작한 반복을 먼 미래 창에서 보면, 한 건도
// 내놓지 않으면서 수만 바퀴를 돌 수 있다(보안 검토가 짚은 자리).
describe('범위보다 앞선 번째는 건너뛴다', () => {
  const measure = (fn: () => void) => {
    const began = Date.now();
    fn();
    return Date.now() - began;
  };

  it('1990년에 시작한 매일 반복도 오늘 창을 바로 집는다', () => {
    let out: { date: string }[] = [];
    const ms = measure(() => {
      out = expandOccurrences(
        {
          start: d('1990-01-01T09:00:00'),
          end: d('1990-01-01T10:00:00'),
          recurrenceType: 'daily',
        },
        d('2026-06-01'),
        endOf('2026-06-03')
      );
    });

    expect(dates(out)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(ms).toBeLessThan(100);
  });

  it('오래된 매주·매월·매년 반복도 제 날짜를 집는다', () => {
    const weekly = expandOccurrences(
      {
        start: d('1995-01-02T09:00:00'), // 월요일
        end: d('1995-01-02T10:00:00'),
        recurrenceType: 'weekly',
        recurrenceDays: [1],
      },
      d('2026-11-01'),
      endOf('2026-11-30')
    );
    expect(dates(weekly)).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);

    const monthly = expandOccurrences(
      {
        start: d('2000-03-15T09:00:00'),
        end: d('2000-03-15T10:00:00'),
        recurrenceType: 'monthly',
      },
      d('2026-06-01'),
      endOf('2026-06-30')
    );
    expect(dates(monthly)).toEqual(['2026-06-15']);

    const yearly = expandOccurrences(
      {
        start: d('1980-07-04T09:00:00'),
        end: d('1980-07-04T10:00:00'),
        recurrenceType: 'yearly',
      },
      d('2026-01-01'),
      endOf('2026-12-31')
    );
    expect(dates(yearly)).toEqual(['2026-07-04']);
  });
});
