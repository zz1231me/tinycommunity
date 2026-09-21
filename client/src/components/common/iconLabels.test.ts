// client/src/components/common/iconLabels.test.ts
// 그림(아이콘)이 낭독기에 어떻게 들리는지를 원본에서 훑는다.
//
// 두 가지가 반대 방향으로 잘못된다:
//  · 글자 옆에 붙은 장식 아이콘을 숨기지 않으면, 낭독기가 경로 데이터나 빈 그래픽을
//    하나하나 짚고 지나가 글을 듣기 어려워진다.
//  · 반대로 그림만 있는 단추의 아이콘을 숨기면 단추에 이름이 남지 않는다 —
//    "단추" 라고만 들리고 무엇을 하는 단추인지 알 수 없다.
// 눈으로는 둘 다 똑같이 멀쩡해 보이므로 원본을 읽어 막는다.

import { describe, expect, it } from 'vitest';

const modules = import.meta.glob<string>(['../../**/*.tsx', '!../../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(modules).map(([path, text]) => ({ path, text }));

/** 낭독기에 감춰지지도, 이름이 붙지도 않은 <svg> */
function bareSvgs(source: string): number[] {
  const lines: number[] = [];
  for (const m of source.matchAll(/<svg\b/g)) {
    const at = m.index ?? 0;
    const gt = source.indexOf('>', at);
    if (gt === -1) continue;
    const tag = source.slice(at, gt + 1);
    if (/aria-hidden|aria-label|role=/.test(tag)) continue;
    lines.push(source.slice(0, at).split('\n').length);
  }
  return lines;
}

/**
 * 이 파일이 lucide 에서 들여온 아이콘 이름들.
 * 이 앱의 아이콘은 거의 다 lucide 컴포넌트다 — <svg> 만 찾으면 대부분을 놓친다.
 */
function lucideNames(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.split(' as ').pop()?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

/** 그림만 들어 있는데 이름이 없는 <button> */
function namelessIconButtons(source: string): number[] {
  const lines: number[] = [];
  const icons = lucideNames(source);
  const hasIcon = (inner: string) =>
    inner.includes('<svg') || icons.some(n => inner.includes(`<${n} `) || inner.includes(`<${n}/`));

  // 링크도 같다. 아이콘만 있는 링크는 낭독기에 목적지 주소만 읽힌다.
  for (const tag of ['button', 'a', 'Link', 'NavLink']) {
    for (const m of source.matchAll(new RegExp(`<${tag}(\\s|>)`, 'g'))) {
      const at = m.index ?? 0;
      const gt = source.indexOf('>', at);
      const close = source.indexOf(`</${tag}>`, gt);
      if (gt === -1 || close === -1) continue;
      const inner = source.slice(gt + 1, close);
      if (!hasIcon(inner)) continue;
      if (inner.replace(/<[^>]*>/g, '').trim()) continue; // 글자가 있으면 그것이 이름이다
      const openTag = source.slice(at, gt + 1);
      if (/aria-label|aria-labelledby|title=/.test(openTag)) continue;
      lines.push(source.slice(0, at).split('\n').length);
    }
  }
  return lines;
}

const offenders = (find: (s: string) => number[]) =>
  files
    .map(({ path, text }) => [path, find(text)] as const)
    .filter(([, hits]) => hits.length > 0)
    .map(([path, hits]) => `${path}: ${hits.join(', ')}`);

describe('아이콘이 낭독기에 어떻게 들리는가', () => {
  it('원본을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.text.includes('<svg'))).toBe(true);
  });

  it('감추지도 이름 붙이지도 않은 <svg> 가 없다', () => {
    expect(offenders(bareSvgs)).toEqual([]);
  });

  it('그림만 있는 단추에는 이름이 있다', () => {
    expect(offenders(namelessIconButtons)).toEqual([]);
  });
});
