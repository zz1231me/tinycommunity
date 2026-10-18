// 프로덕션 빌드. 서버(tsc)와 화면(vite)을 차례로 만든다.
//
// 올릴 때는 Express 가 client/dist 를 직접 서빙하므로 화면과 API 가 같은 4000 포트다.
// 그래서 둘 중 하나만 빌드하면 화면이 없거나 API 가 없는 반쪽이 된다 — 늘 함께 만든다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, NPM, assertNodeVersion, run, say, step, ok, warn } from './lib.mjs';

async function main() {
  assertNodeVersion();

  step('서버 빌드 (TypeScript → server/dist)');
  await run(NPM, ['run', 'build'], { cwd: path.join(ROOT, 'server') });

  step('화면 빌드 (Vite → client/dist)');
  await run(NPM, ['run', 'build'], { cwd: path.join(ROOT, 'client') });

  for (const [label, file] of [
    ['server/dist/index.js', path.join(ROOT, 'server', 'dist', 'index.js')],
    ['client/dist/index.html', path.join(ROOT, 'client', 'dist', 'index.html')],
  ]) {
    if (!fs.existsSync(file)) {
      warn(`${label} 이 만들어지지 않았습니다. 위 로그를 확인해 주세요.`);
      process.exit(1);
    }
  }

  say('');
  ok('빌드 완료 — server/dist · client/dist');
  say('');
  say('  npm start   프로덕션으로 띄우기 (http://localhost:4000 에서 화면·API 모두)');
  say('');
  say('올리기 전에 server/.env 를 확인하세요:');
  say('  NODE_ENV=production · JWT 키 2개는 32자 이상 · ADMIN_DEFAULT_PASSWORD 변경');
  say('  HTTPS 가 아니면 COOKIE_SECURE=false (사내망 HTTP 배포)');
}

main().catch(err => {
  warn(err.message);
  process.exit(1);
});
