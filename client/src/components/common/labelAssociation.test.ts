// client/src/components/common/labelAssociation.test.ts
// 라벨이 입력칸과 이어져 있는지를 소스에서 훑는다.
//
// 이어지지 않은 <label> 은 화면상 멀쩡해 보인다 — 글자는 제대로 나오고 눈으로는
// 어느 칸의 이름인지도 알 수 있다. 그래서 눈으로도, 화면을 그려 보는 테스트로도
// 잘 드러나지 않는다. 깨지는 것은 라벨을 눌러 칸으로 들어가는 동작과, 화면 낭독기가
// 읽어 주는 칸 이름이다. 한때 마흔 곳이 그랬다.
//
// 이어 주는 방법은 두 가지다: 라벨이 칸을 감싸거나(암묵적), htmlFor 로 가리키거나.
// 둘 다 아니면 이어지지 않은 것이다.

import { describe, expect, it } from 'vitest';

// 원본 그대로(?raw) 읽는다 — 테스트 파일은 뺀다(이 파일도 틀린 예를 적고 있다)
const modules = import.meta.glob<string>(['../../**/*.tsx', '!../../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(modules).map(([path, text]) => ({ path, text }));

/** 이어지지 않은 <label> 의 위치를 모은다 */
function orphanLabels(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/<label\b/g)) {
    const at = m.index ?? 0;
    const gt = source.indexOf('>', at);
    const close = source.indexOf('</label>', gt);
    if (gt === -1 || close === -1) continue;
    const openTag = source.slice(at, gt + 1);
    const body = source.slice(gt + 1, close);
    if (openTag.includes('htmlFor')) continue; // 가리켜서 이어짐
    if (/<(input|select|textarea)\b/.test(body)) continue; // 감싸서 이어짐
    if (body.includes('{children}')) continue; // 감싸는 공용 라벨 — 칸은 부모가 넣는다
    const line = source.slice(0, at).split('\n').length;
    found.push(`${line}: ${body.replace(/\s+/g, ' ').trim().slice(0, 40)}`);
  }
  return found;
}

describe('라벨과 입력칸이 이어져 있다', () => {
  it('원본을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.text.includes('<label'))).toBe(true);
  });

  it('가리키지도 감싸지도 않는 <label> 이 없다', () => {
    const offenders = files
      .map(({ path, text }) => [path, orphanLabels(text)] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([path, hits]) => `${path}\n    ${hits.join('\n    ')}`);

    // 이을 칸이 없는 것(단추 묶음·CKEditor·올리기 영역)은 label 이 아니라
    // span + role="group" + aria-labelledby 로 이름을 알린다 — 여기에 걸리지 않는다.
    expect(offenders).toEqual([]);
  });
});
