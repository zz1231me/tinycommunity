// client/src/test/attendanceSeparation.test.ts
//
// 출근 화면은 업무 화면이다 — 포인트 기능은 포인트 탭에 둔다. 예외는 방어권 하나다.
//
// 퇴근 공격은 출근 화면의 퇴근 버튼을 겨냥하므로 그 효과(도망·숨기기)와, 공격받은 자리에서
// 바로 쓰는 방어권(경고 띠)은 출근 화면에 있다. 하지만 공격권을 사는 일(sendAttack)과
// 대결·뽑기·순위 같은 포인트 판은 출근 쪽 코드가 가져오지 않는다. 누가 무심코 들이면 여기서 걸린다.
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

// 방어권(sendDefend)은 여기 있다 — 공격받은 자리에서 바로 방어하는 편이 낫다(사용자 결정).
// 공격권을 사는 일, 대결·뽑기·순위 같은 포인트 판은 출근 쪽이 가져오지 않는다.
const FORBIDDEN = [/\bsendAttack\b/, /components\/points\//, /from ['"]\.\.\/points\//];

describe('출근 화면은 방어권 말고는 포인트 기능을 들이지 않는다', () => {
  it('훑을 파일이 실제로 있다', () => {
    // 0개여도 아래 검사는 통과한다 — glob 이 어긋나면 여기서 먼저 걸린다
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.some(([p]) => p.endsWith('AttendancePage.tsx'))).toBe(true);
  });

  it('공격권 구매 API 나 포인트 판을 가져오지 않는다', () => {
    const offenders = entries
      .filter(([, source]) => FORBIDDEN.some(re => re.test(source)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
