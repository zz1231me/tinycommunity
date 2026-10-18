// 빌드한 것이 정말 뜨는지 한 번 확인한다. 윈도우에서 특히 필요하다.
//
// 윈도우에서 막히는 자리는 빌드가 아니라 '띄우는 순간' 이다 — NODE_ENV 를 넣는 문법이
// 달라 development 로 남으면 Express 가 client/dist 를 서빙하지 않고, 화면만 빈 채로
// 200 이 돌아온다. 그래서 상태 코드만 보지 않고 '화면이 들어 있는지' 까지 본다.
//
// 띄우기 → 기다리기 → 확인 → 내리기를 Node 로 하므로 셸 문법 차이를 타지 않는다.
//
// 환경은 제 것을 따로 쓴다(임시 SQLite 파일·한 번 쓰는 시크릿·다른 포트). 묻는 것은
// '빌드한 것이 뜨고 화면을 내주는가' 이지 '그 사람 .env 가 맞는가' 가 아니다
// (그건 npm start 가 띄우기 전에 본다). 쓰던 DB 와 돌고 있는 서버를 건드리지 않는다.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, assertNodeVersion, say, ok, warn } from './lib.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 4123);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 60_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForBoot(child) {
  const until = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`서버가 먼저 끝났습니다(코드 ${child.exitCode}).`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // 아직 듣기 전이다
    }
    await sleep(500);
  }
  throw new Error(`${BOOT_TIMEOUT_MS / 1000}초 안에 뜨지 않았습니다.`);
}

async function main() {
  assertNodeVersion();

  const entry = path.join(ROOT, 'server', 'dist', 'index.js');
  if (!fs.existsSync(entry)) {
    warn('server/dist 가 없습니다. 먼저 npm run build 를 돌려 주세요.');
    process.exit(1);
  }

  // 한 번 쓰고 버리는 DB. dotenv 는 이미 있는 process.env 를 덮지 않으므로 여기 값이 이긴다.
  const tmpDb = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tinycommunity-smoke-')),
    'smoke.sqlite'
  );
  const throwaway = () => crypto.randomBytes(48).toString('base64url');

  const child = spawn(process.execPath, [entry], {
    cwd: path.join(ROOT, 'server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      DB_TYPE: 'sqlite',
      DB_STORAGE: tmpDb,
      JWT_SECRET: throwaway(),
      JWT_REFRESH_SECRET: throwaway(),
      ADMIN_DEFAULT_PASSWORD: `${throwaway().slice(0, 16)}!aA1`,
      COOKIE_SECURE: 'false',
    },
  });

  const logs = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => logs.push(chunk.toString()));
  }

  try {
    await waitForBoot(child);
    ok(`떴습니다 — ${BASE}`);

    const health = await fetch(`${BASE}/api/health`);
    if (!health.ok) throw new Error(`/api/health 가 ${health.status} 입니다.`);
    ok('/api/health 응답 정상');

    // 화면까지 서빙하는지. NODE_ENV 가 development 로 남으면 여기서 걸린다.
    const page = await fetch(`${BASE}/`);
    const html = await page.text();
    if (!page.ok) throw new Error(`/ 가 ${page.status} 입니다.`);
    if (!/<div id="root"|<script/i.test(html)) {
      throw new Error('/ 가 화면(client/dist)을 돌려주지 않습니다.');
    }
    ok('/ 가 화면을 서빙합니다');

    say('');
    ok('연기 테스트 통과');
  } catch (err) {
    warn(err.message);
    say('');
    say('--- 서버 로그 ---');
    say(logs.join('').split('\n').slice(-25).join('\n'));
    process.exitCode = 1;
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      // 윈도우에서는 SIGTERM 이 즉시 듣지 않을 수 있다
      await sleep(1000);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true });
  }
}

main();
