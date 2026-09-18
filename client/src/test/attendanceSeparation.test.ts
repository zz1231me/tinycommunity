// client/src/test/attendanceSeparation.test.ts
//
// 출근 화면은 업무 화면이다 — 포인트를 쓰는 일은 포인트 탭에만 둔다.
//
// 퇴근 공격권은 출근 화면의 퇴근 버튼을 겨냥하므로 그 효과(도망·숨기기)와 안내 한 줄은
// 출근 화면에 남는다. 하지만 공격을 사고(sendAttack) 방어권을 사는(sendDefend) 일, 그리고
// 그런 일을 하는 포인트 판들은 출근 쪽 코드가 가져오지 않는다. 누가 무심코 되돌리면 여기서 걸린다.
//
// 화면을 그리지 않고 원문을 읽는다 — noInlineFocusKill.test.ts 와 같은 방식이다.

import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(
  ['../pages/attendance/**/*.{ts,tsx}', '../components/attendance/**/*.{ts,tsx}'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  }
) as Record<string, string>;

const entries = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path));

const FORBIDDEN = [
  /\bsendDefend\b/,
  /\bsendAttack\b/,
  /components\/points\//,
  /from ['"]\.\.\/points\//,
];

describe('출근 화면은 포인트를 쓰지 않는다', () => {
  it('훑을 파일이 실제로 있다', () => {
    // 0개여도 아래 검사는 통과한다 — glob 이 어긋나면 여기서 먼저 걸린다
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.some(([p]) => p.endsWith('AttendancePage.tsx'))).toBe(true);
  });

  it('포인트를 쓰는 API 나 포인트 판을 가져오지 않는다', () => {
    const offenders = entries
      .filter(([, source]) => FORBIDDEN.some(re => re.test(source)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
