// 확인 상자는 onConfirm 이 돌려준 약속이 끝날 때까지 단추를 잠근다.
// 호출부가 약속을 버리면(블록 본문에서 그냥 부르고 말면) 잠금이 곧바로 풀려 두 번 눌린다.
// 지우는 동작이 두 번 나가면 두 번째는 404/400 이 되어, 성공과 실패 안내가 나란히 뜬다.

import { describe, expect, it } from 'vitest';

const modules = import.meta.glob<string>(['../../../**/*.tsx', '!../../../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(modules).map(([path, text]) => ({ path, text }));

/**
 * 대화상자를 먼저 닫아 버리는 곳은 잠글 필요가 없다 — 상자가 사라지므로 두 번 누를 수 없다.
 * 그런 자리만 여기에 적어 둔다.
 */
const CLOSES_FIRST = ['PostDetail.tsx', 'CustomPageManagement.tsx'];

function droppedPromises(source: string): number[] {
  const lines: number[] = [];
  for (const m of source.matchAll(/onConfirm=\{/g)) {
    const start = m.index! + m[0].length;
    let i = start;
    let depth = 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') depth -= 1;
      i += 1;
    }
    const body = source.slice(start, i - 1).trim();
    // 표현식 본문(() => foo())은 그대로 약속을 돌려준다. 블록 본문만 확인한다.
    if (!/^(async\s*)?\(\s*\)\s*=>\s*\{/.test(body)) continue;
    if (body.includes('return') || body.includes('await')) continue;
    lines.push(source.slice(0, m.index).split('\n').length);
  }
  return lines;
}

describe('확인 상자를 쓰는 곳', () => {
  it('원본을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.text.includes('onConfirm='))).toBe(true);
  });

  it('처리가 끝날 때까지 잠기도록 약속을 돌려준다', () => {
    const offenders = files
      .filter(({ path }) => !CLOSES_FIRST.some(p => path.endsWith(p)))
      .map(({ path, text }) => [path, droppedPromises(text)] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([path, hits]) => `${path}: ${hits.join(', ')}`);

    expect(offenders).toEqual([]);
  });
});
