import fs from 'fs';
import path from 'path';

// 클라이언트와 서버는 같은 본문을 각자 한 번씩 정화한다.
//
// 서버가 저장을 허용한 스타일을 클라이언트가 표시할 때 벗겨 내면, 글쓴이가 지정한
// 서식이 독자에게 전달되지 않는다. 서버 렌더러가 스스로 붙이는 스타일도 마찬가지다.
//
// 두 목록은 별개 패키지에 있어 한쪽만 고치기 쉽다. 그래서 파일을 읽어 직접 비교한다.

const SERVER_FILE = path.join(__dirname, '..', 'utils', 'contentRenderer.ts');
const CLIENT_FILE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'client',
  'src',
  'utils',
  'htmlSanitizer.ts'
);

/** SAFE_CSS_PROPS 배열에 적힌 속성 이름만 뽑는다(주석 줄은 제외) */
function readSafeCssProps(file: string): Set<string> {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('SAFE_CSS_PROPS');
  expect(start).toBeGreaterThan(-1);

  const open = source.indexOf('[', start);
  let depth = 0;
  let end = open;
  while (end < source.length) {
    if (source[end] === '[') depth++;
    else if (source[end] === ']' && --depth === 0) break;
    end++;
  }
  const body = source
    .slice(open, end)
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
  return new Set([...body.matchAll(/'([^']+)'/g)].map(m => m[1]));
}

describe('정화 규칙은 클라이언트와 서버가 같아야 한다', () => {
  it('허용 CSS 속성 목록이 일치한다', () => {
    if (!fs.existsSync(CLIENT_FILE)) {
      // 서버만 따로 빌드하는 환경(도커 등)에서는 클라이언트 파일이 없다 — 그때는 건너뛴다
      return;
    }
    const server = readSafeCssProps(SERVER_FILE);
    const client = readSafeCssProps(CLIENT_FILE);

    expect([...server].filter(p => !client.has(p)).sort()).toEqual([]);
    expect([...client].filter(p => !server.has(p)).sort()).toEqual([]);
  });
});
