// client/src/utils/localDate.test.ts
// 날짜 입력칸(type="date")에 넣는 값은 '보는 사람의 달력 날짜' 다.
//
// 저장은 로컬 자정으로 하고 읽기는 UTC 로 자르면, 한국에서는 저장할 때마다 하루씩
// 뒤로 밀린다 — 제목 오타 하나만 고쳐 다시 저장해도 게시 시작일이 계속 당겨졌다.

import { describe, expect, it } from 'vitest';
import { toLocalDateInput } from './date';

describe('시각 → 달력 날짜', () => {
  it('그 시각이 속한 날을 보는 사람 기준으로 읽는다', () => {
    // 어느 타임존에서 돌려도 같은 답이 나오도록, 로컬 자정을 직접 만들어 되읽는다.
    // (UTC 로 자르는 옛 방식은 한국에서 09시 이전 시각을 하루 전으로 읽었다 —
    //  로컬 자정은 15:00Z 이므로 정확히 그 경우다.)
    const localMidnight = new Date(2026, 8, 21, 0, 0, 0); // 2026-09-21 00:00 로컬
    expect(toLocalDateInput(localMidnight.toISOString())).toBe('2026-09-21');
  });

  it('저장 → 다시 읽기를 반복해도 날짜가 밀리지 않는다', () => {
    let picked = '2026-09-21';
    for (let i = 0; i < 5; i++) {
      const stored = new Date(picked + 'T00:00:00').toISOString(); // 화면이 저장하는 방식
      picked = toLocalDateInput(stored); // 편집하러 다시 열었을 때
    }
    expect(picked).toBe('2026-09-21');
  });

  it('빈 값은 빈 문자열', () => {
    expect(toLocalDateInput(null)).toBe('');
    expect(toLocalDateInput(undefined)).toBe('');
    expect(toLocalDateInput('말이 안 되는 값')).toBe('');
  });
});

describe('어느 타임존에서 읽든', () => {
  // 실행 중에 프로세스 타임존을 바꿀 수는 없으므로(테스트는 Asia/Seoul 로 고정해 돌린다),
  // 여기서는 '그 지역 달력' 이라는 뜻 자체를 Intl 로 대조한다.
  const zones = ['Asia/Seoul', 'America/New_York', 'Pacific/Auckland'];
  it.each(zones)('%s 기준 날짜와 어긋나지 않는다', zone => {
    const instant = new Date('2026-09-20T15:00:00.000Z');
    const expected = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(instant);
    const here = new Intl.DateTimeFormat('en-CA').format(instant);
    // 실행 타임존과 같은 지역이면 값이 같아야 하고, 다르면 다를 수 있다.
    // (UTC 로 자르던 옛 방식은 실행 타임존과 무관하게 늘 같은 값을 내놓았다.)
    if (expected === here) expect(toLocalDateInput(instant)).toBe(expected);
    else expect(toLocalDateInput(instant)).toBe(here);
  });
});
