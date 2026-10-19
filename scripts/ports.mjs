// 포트를 바꾼다. 서버와 화면을 함께 맞춘다.
//
//   npm run ports                      지금 값 보기
//   npm run ports -- --api 5000        API 포트만
//   npm run ports -- --web 9000        화면 포트만
//   npm run ports -- --api 5000 --web 9000
//
// 손으로 고치면 거의 한쪽을 잊는다. 화면의 VITE_API_URL 은 서버 PORT 를 가리켜야 하고,
// 그 둘이 어긋나면 화면은 멀쩡히 뜨는데 로그인부터 실패한다 — 원인을 찾기 어려운 모양이다.
// 그래서 한 명령이 세 값을 함께 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, say, ok, warn } from './lib.mjs';

const SERVER_ENV = path.join(ROOT, 'server', '.env');
const CLIENT_ENV = path.join(ROOT, 'client', '.env.local');
const CLIENT_SAMPLE = path.join(ROOT, 'client', '.env.sample');

const DEFAULT_API = 4000;
const DEFAULT_WEB = 8080;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i] === '--api' ? 'api' : argv[i] === '--web' ? 'web' : null;
    if (!key) continue;
    const value = Number(argv[i + 1]);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      warn(`${argv[i]} 뒤에는 1~65535 사이의 포트 번호가 와야 합니다.`);
      process.exit(1);
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

/** KEY=값 한 줄을 넣거나 바꾼다. 나머지 줄은 건드리지 않는다. */
function setLine(text, key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, 'm').test(text)) {
    return text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  }
  return `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`;
}

const read = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const valueOf = (text, key, fallback) => {
  const found = text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
  return found ? found : String(fallback);
};

const args = parseArgs(process.argv.slice(2));
const serverText = read(SERVER_ENV);
const clientText = read(CLIENT_ENV);

const currentApi = valueOf(serverText, 'PORT', DEFAULT_API);
const currentWeb = valueOf(clientText, 'VITE_PORT', DEFAULT_WEB);

if (args.api === undefined && args.web === undefined) {
  say('지금 포트');
  say(`  API  ${currentApi}   (server/.env 의 PORT)`);
  say(`  화면 ${currentWeb}   (client/.env.local 의 VITE_PORT)`);
  say('');
  say('바꾸려면:  npm run ports -- --api 5000 --web 9000');
  process.exit(0);
}

const api = args.api ?? Number(currentApi);
const web = args.web ?? Number(currentWeb);

if (api === web) {
  warn(`API 와 화면이 같은 포트(${api})를 쓸 수는 없습니다.`);
  process.exit(1);
}

// 서버 — .env 가 있을 때만 건드린다. 없으면 먼저 setup 을 돌려야 한다.
if (!fs.existsSync(SERVER_ENV)) {
  warn('server/.env 가 없습니다. 먼저 npm run setup 을 돌려 주세요.');
  process.exit(1);
}
fs.writeFileSync(SERVER_ENV, setLine(serverText, 'PORT', api), { mode: 0o600 });

// 화면 — 없으면 본보기에서 만든다.
let nextClient = clientText || read(CLIENT_SAMPLE);
nextClient = setLine(nextClient, 'VITE_PORT', web);
nextClient = setLine(nextClient, 'VITE_API_URL', `http://127.0.0.1:${api}`);
fs.writeFileSync(CLIENT_ENV, nextClient);

ok(`API ${currentApi} → ${api} · 화면 ${currentWeb} → ${web}`);
say('');
say('  server/.env        PORT');
say('  client/.env.local  VITE_PORT · VITE_API_URL (서버 포트를 따라간다)');
say('');
say('돌고 있는 개발 서버가 있으면 다시 띄워야 적용됩니다 — npm run dev');
