// client/src/test/noInlineFocusKill.test.ts
//
// 인라인 스타일로 포커스 테두리를 없애지 못하게 막는다.
//
// :focus-visible 테두리는 styles/index.css 한 곳에서 준다. 그런데 요소에 직접 붙인
// 인라인 스타일은 CSS 로 덮을 수 없다 — 그 단추만 키보드 포커스가 보이지 않게 되고,
// 전역 규칙을 아무리 고쳐도 되돌릴 수 없다. 그 파일을 찾아가 지우는 수밖에 없다.
//
// 실제로 관리자 화면 두 곳(태그 관리·게시판 담당자)에서 열 군데가 그렇게 돼 있었다.
// 마우스로 쓰면 멀쩡해 보여서 눈으로는 걸리지 않는 종류의 결함이라, 한 번 지운 것으로
// 끝내지 않고 여기서 막는다.
//
// 이 검사는 화면을 그리지 않고 원문을 읽는다. happy-dom 에는 스타일시트가 적용되지
// 않아 '테두리가 실제로 보이는지' 는 확인할 수 없고, 확인하는 척하면 아무것도
// 걸러내지 못하는 테스트가 된다. 그래서 결함의 모양 자체를 막는 쪽을 택했다.
//
// 참고: 테두리를 없애는 것 자체가 금지는 아니다. className 으로 없애면 focus-visible
// 규칙으로 되살릴 수 있으므로, 여기서 막는 것은 '되살릴 수 없게 만드는 방법' 뿐이다.

import { describe, expect, it } from 'vitest';

/**
 * src 아래 모든 원문.
 *
 * node:fs 로 읽지 않는다 — 이 프로젝트의 타입 설정에서 node 타입이 잡히지 않아
 * 타입 검사가 깨진다(실제로 한 번 깨뜨렸다). Vite 의 glob 은 vite/client 타입에
 * 들어 있어 따로 의존성을 더할 필요가 없고, 경로도 실행 위치가 아니라 이 파일을
 * 기준으로 풀려서 어디서 돌리든 같다.
 */
const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 자기 자신은 뺀다 — 아래 정규식과 위 설명이 서로 걸린다 */
const entries = Object.entries(sources).filter(
  ([path]) => !path.endsWith('noInlineFocusKill.test.ts')
);

/** style={{ … outline: 'none' … }} — 중괄호 안이라 줄바꿈도 함께 본다 */
const INLINE_OUTLINE_KILL = /style=\{\{[^}]*outline:\s*['"]none['"]/;

describe('인라인 스타일로 포커스 테두리를 없애지 않는다', () => {
  it('훑을 파일이 실제로 있다', () => {
    // 대상이 0개여도 아래 검사는 통과한다 — 그러면 아무것도 막지 못하는 검사가 된다.
    // glob 이 어긋나 아무것도 못 찾게 되는 순간 여기서 먼저 걸린다.
    expect(entries.length).toBeGreaterThan(100);
  });

  it('어느 파일에도 인라인 outline 제거가 없다', () => {
    const offenders = entries
      .filter(([, source]) => INLINE_OUTLINE_KILL.test(source))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
