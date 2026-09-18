// client/src/styles/customAnimations.test.ts
// index.css 에 손으로 만든 animate-* 클래스를 Tailwind 유틸리티처럼 쓰는 실수를 막는다.
//
// 이 클래스들은 층(@layer) 밖의 보통 CSS 라서:
//  · motion-safe: / hover: 같은 변형을 붙이면 아무 CSS 도 만들어지지 않는다
//    (1등 왕관이 'motion-safe:animate-crownFloat' 라 한 번도 떠다니지 않았다)
//  · [animation-iteration-count:2] 같은 유틸리티로 덮으려 해도 늘 이 클래스가 이긴다
//    (문제 내기에서 한 번 틀리면 문제가 끝없이 떨었다)
// 브라우저에서만 드러나는 일이라 원본 코드를 읽어 막는다.
//
// CSS 를 읽지 않고 가려낸다(테스트 환경은 CSS 를 빈 파일로 읽는다): 이 프로젝트는 @theme 에
// --animate-* 를 두지 않으므로 Tailwind 가 아는 animate-* 는 기본 다섯 개뿐이다. 나머지는
// 모두 손으로 만든 것이다. (@theme 에 --animate-* 를 두기 시작하면 그 이름을 BUILTIN 에 더한다.)

import { describe, expect, it } from 'vitest';

const BUILTIN = ['spin', 'ping', 'pulse', 'bounce', 'none'];
const CUSTOM = `animate-(?!(?:${BUILTIN.join('|')})\\b)[A-Za-z]+`;

// 원본 그대로(?raw) 읽는다. 테스트 파일은 뺀다 — 이 파일도 틀린 예를 적고 있다.
const modules = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(modules).map(([path, text]) => ({ path, text }));

const offenders = (pattern: RegExp) =>
  files.flatMap(({ path, text }) => [...text.matchAll(pattern)].map(m => `${path}: ${m[0]}`));

describe('손으로 만든 애니메이션 클래스', () => {
  it('원본을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.text.includes('animate-crownFloat'))).toBe(true);
  });

  it('변형(motion-safe: 등)을 붙여 쓰지 않는다 — 붙이면 CSS 가 생기지 않는다', () => {
    expect(offenders(new RegExp(`[a-z-]+:${CUSTOM}`, 'g'))).toEqual([]);
  });

  it('[animation-…] 유틸리티로 덮어쓰지 않는다 — 덮어써지지 않는다', () => {
    expect(offenders(/\[animation-[a-z-]+:[^\]]+\]/g)).toEqual([]);
  });

  it('기본 animate-spin 에 변형을 붙이는 것은 괜찮다 — 대조', () => {
    expect(new RegExp(`[a-z-]+:${CUSTOM}`).test('motion-safe:animate-spin')).toBe(false);
    expect(new RegExp(`[a-z-]+:${CUSTOM}`).test('motion-safe:animate-crownFloat')).toBe(true);
  });
});
