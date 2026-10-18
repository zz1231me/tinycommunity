// 처음 받은 사람이 한 번만 돌리는 것. 의존성을 깔고 server/.env 를 만든다.
//
// .env.sample 을 그냥 복사하면 시크릿이 자리표시자 그대로 남는다. 개발에서는 돌아가지만
// NODE_ENV=production 으로 올리는 순간 서버가 부팅을 거부한다 — 그때 가서 당황하지 않게
// 처음부터 진짜 값을 만들어 넣는다.
//
// 이미 있는 .env 는 건드리지 않는다. 남이 적어 둔 접속 정보를 덮어쓰는 일이 없어야 한다.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, NPM, assertNodeVersion, run, say, step, ok, warn } from './lib.mjs';

const ENV_PATH = path.join(ROOT, 'server', '.env');
const SAMPLE_PATH = path.join(ROOT, 'server', '.env.sample');

/** 48바이트 → base64url 64자. 프로덕션 검증(32자 이상)을 넉넉히 넘는다. */
const secret = () => crypto.randomBytes(48).toString('base64url');

function writeEnv() {
  if (fs.existsSync(ENV_PATH)) {
    ok('server/.env 가 이미 있습니다 — 건드리지 않았습니다.');
    return false;
  }
  if (!fs.existsSync(SAMPLE_PATH)) {
    warn('server/.env.sample 을 찾지 못했습니다. 저장소가 온전한지 확인해 주세요.');
    process.exit(1);
  }

  const filled = fs
    .readFileSync(SAMPLE_PATH, 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret()}`)
    .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${secret()}`)
    .replace(/^ADMIN_DEFAULT_PASSWORD=.*$/m, `ADMIN_DEFAULT_PASSWORD=${secret().slice(0, 16)}!aA1`);

  fs.writeFileSync(ENV_PATH, filled, { mode: 0o600 });
  ok('server/.env 를 만들었습니다 (JWT 키 2개와 admin 초기 비밀번호를 새로 뽑았습니다).');
  return true;
}

async function main() {
  assertNodeVersion();

  step('서버 의존성 설치');
  await run(NPM, ['install'], { cwd: path.join(ROOT, 'server') });

  step('화면 의존성 설치');
  await run(NPM, ['install'], { cwd: path.join(ROOT, 'client') });

  step('환경 파일 준비');
  const created = writeEnv();

  say('');
  ok('준비가 끝났습니다.');
  say('');
  say('  npm run dev     개발 서버 (화면 http://localhost:8080 · API http://localhost:4000)');
  say('  npm run build   프로덕션 빌드');
  say('  npm test        서버·화면 테스트 전부');
  say('');
  if (created) {
    say('첫 로그인: 아이디 admin / 비밀번호는 server/.env 의 ADMIN_DEFAULT_PASSWORD.');
    say('로그인한 뒤 바로 바꾸세요.');
  }
}

main().catch(err => {
  warn(err.message);
  process.exit(1);
});
