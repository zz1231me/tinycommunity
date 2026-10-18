// 빌드한 것을 프로덕션으로 띄운다.
//
// 이 스크립트가 따로 있는 이유는 윈도우다. `NODE_ENV=production npm start` 는
// cmd·PowerShell 에서 듣지 않고(각각 set·$env: 문법이다), NODE_ENV 가 development 로
// 남으면 Express 가 client/dist 를 서빙하지 않아 화면이 빈 채로 뜬다.
// 여기서 환경을 넣어 주면 어느 OS 에서든 명령 한 줄로 같다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, assertNodeVersion, run, say, warn } from './lib.mjs';
import { placeholderProblems } from './secrets.mjs';

assertNodeVersion();

const entry = path.join(ROOT, 'server', 'dist', 'index.js');
if (!fs.existsSync(entry)) {
  warn('server/dist 가 없습니다. 먼저 npm run build 를 돌려 주세요.');
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))) {
  warn('client/dist 가 없어 API 만 뜹니다. 화면까지 올리려면 npm run build 를 돌려 주세요.');
}

// 프로덕션은 약한 시크릿이면 부팅을 거부한다. 그 안내가 Node 스택 트레이스에 묻히므로
// 띄우기 전에 먼저 읽어 주고, 고치는 방법까지 한 줄로 알려 준다.
const envPath = path.join(ROOT, 'server', '.env');
if (fs.existsSync(envPath)) {
  const problems = placeholderProblems(fs.readFileSync(envPath, 'utf8'));
  if (problems.length > 0) {
    warn(`server/.env 의 값이 프로덕션에 쓸 수 없습니다: ${problems.join(', ')}`);
    say('');
    say('  npm run secrets   JWT 키 두 개를 새로 뽑아 넣습니다');
    say('  그 뒤 ADMIN_DEFAULT_PASSWORD 는 server/.env 에서 직접 정해 주세요.');
    say('');
    say('개발용으로 그냥 띄우려면: npm run dev');
    process.exit(1);
  }
}

await run(process.execPath, [entry], {
  cwd: path.join(ROOT, 'server'),
  // 이미 정해 둔 값이 있으면 존중한다(예: staging)
  env: { NODE_ENV: process.env.NODE_ENV ?? 'production' },
}).catch(err => {
  warn(err.message);
  process.exit(1);
});
