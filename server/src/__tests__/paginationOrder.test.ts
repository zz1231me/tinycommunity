// offset 페이지네이션에는 유일한 2차 정렬이 있어야 한다.
//
// createdAt 처럼 값이 겹칠 수 있는 컬럼 하나로만 정렬하면, 동점 행의 순서가 질의마다
// 달라질 수 있다. 그러면 페이지 경계에서 어떤 행은 두 번 나오고 어떤 행은 빠진다.
//
// SQLite 는 순서가 안정적이라 개발·테스트에서는 드러나지 않는다. MariaDB 에서
// 같은 시각 60건을 10건씩 넘겨 보면 60건 중 59건만 나오고 1건이 중복된다
// (docker-compose 기본 DB 가 MariaDB 다).
//
// 동작으로 잡을 수 없으므로 소스를 훑어 고정한다 — indexTableNames.test.ts 와 같은 방식.

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      collectFiles(p, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

/** findAll / findAndCountAll 의 옵션 객체 본문을 잘라 낸다 */
function optionBlocks(src: string): Array<{ block: string; index: number }> {
  const blocks: Array<{ block: string; index: number }> = [];
  const re = /\.(findAll|findAndCountAll)\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let i = start;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push({ block: src.slice(start, i + 1), index: start });
  }
  return blocks;
}

/** order: [...] 의 최상위 대괄호 항목들을 뽑는다 (한 줄·여러 줄 모두) */
function orderKeys(block: string): string[] | null {
  const at = block.search(/\border:\s*\[/);
  if (at === -1) return null;
  const start = block.indexOf('[', at);
  let depth = 0;
  let end = start;
  for (; end < block.length; end += 1) {
    if (block[end] === '[') depth += 1;
    else if (block[end] === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const inner = block.slice(start + 1, end);
  return inner.match(/\[[^[\]]*\]/g) ?? [];
}

describe('offset 페이지네이션 정렬', () => {
  it('offset 을 쓰는 조회는 순서가 하나로 정해진다', () => {
    const offenders: string[] = [];

    for (const file of collectFiles(SRC)) {
      const src = fs.readFileSync(file, 'utf-8');
      for (const { block, index } of optionBlocks(src)) {
        if (!/\boffset\b/.test(block)) continue;

        const line = src.slice(0, index).split('\n').length;
        const rel = path.relative(SRC, file);

        const keys = orderKeys(block);
        if (keys === null) {
          offenders.push(`${rel}:${line} — order 없음`);
          continue;
        }
        // 키가 둘 이상이면 동점이 갈린다.
        // 하나뿐이어도 그것이 유일 컬럼(id)이면 순서가 하나로 정해진다.
        const single = keys.length === 1 && /'id'|"id"/.test(keys[0]);
        if (keys.length < 2 && !single) {
          offenders.push(`${rel}:${line} — 순서가 정해지지 않음: ${keys.join(' ').slice(0, 60)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
