// 아이콘만 있는 단추가 손가락으로 누르기에 너무 작지 않은지 원본에서 훑는다.
//
// 보이는 크기는 32px 아래로 내려가지 않게 하고, 터치 기기에서는 .tap-target 이
// 닿는 영역을 44px 로 넓힌다(보이는 모양은 그대로). 붙어 있는 단추 묶음에는
// .tap-target 을 쓰지 않는다 — 영역이 겹쳐 옆 단추가 눌린다. 그런 곳은 실제 크기를 키운다.

import { describe, expect, it } from 'vitest';

const modules = import.meta.glob<string>(['../../**/*.tsx', '!../../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(modules).map(([path, text]) => ({ path, text }));

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

/** 아이콘만 있는데 보이는 크기가 32px 아래인 단추 */
function tooSmall(source: string): string[] {
  const hits: string[] = [];
  const icons = lucideNames(source);
  for (const m of source.matchAll(/<button(\s|>)/g)) {
    const at = m.index ?? 0;
    const gt = source.indexOf('>', at);
    const close = source.indexOf('</button>', gt);
    if (gt === -1 || close === -1) continue;
    const inner = source.slice(gt + 1, close);
    const hasIcon =
      inner.includes('<svg') ||
      icons.some(n => inner.includes(`<${n} `) || inner.includes(`<${n}/`));
    if (!hasIcon) continue;
    if (inner.replace(/<[^>]*>/g, '').trim()) continue; // 글자가 있으면 그만큼 넓다

    const openTag = source.slice(at, gt + 1);
    // h-N w-N 으로 크기를 직접 준 경우는 그 값을 본다
    const fixed = openTag.match(/\bh-(\d+)\b/);
    if (fixed) {
      if (Number(fixed[1]) * 4 < 32)
        hits.push(`${source.slice(0, at).split('\n').length}: h-${fixed[1]}`);
      continue;
    }
    const pad = openTag.match(/\bp-([\d.]+)\b/);
    if (!pad) continue; // 여백을 안 준 것은 부모가 크기를 정한다
    const iconSize = inner.match(/\bh-([\d.]+)\b/);
    const visual = Number(pad[1]) * 4 * 2 + (iconSize ? Number(iconSize[1]) * 4 : 16);
    if (visual < 32) hits.push(`${source.slice(0, at).split('\n').length}: ${visual}px`);
  }
  return hits;
}

describe('아이콘 단추 크기', () => {
  it('원본을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.text.includes('tap-target'))).toBe(true);
  });

  it('보이는 크기가 32px 아래인 아이콘 단추가 없다', () => {
    const offenders = files
      .map(({ path, text }) => [path, tooSmall(text)] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([path, hits]) => `${path} → ${hits.join(', ')}`);

    expect(offenders).toEqual([]);
  });
});
