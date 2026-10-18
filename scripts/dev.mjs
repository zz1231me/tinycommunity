// 개발 서버 둘을 한 번에. 예전에는 터미널을 두 개 열어야 했다.
//
// 줄머리에 어느 쪽인지를 붙여 둔다. 두 로그가 섞이면 어느 쪽이 죽었는지 찾느라 시간을 쓴다.
// 한쪽이 끝나면 다른 쪽도 함께 내린다 — 화면만 남아 API 없이 도는 상태가 제일 헷갈린다.

import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT, NPM, assertNodeVersion, say, warn } from './lib.mjs';

const TARGETS = [
  { name: 'server', cwd: 'server', color: '\u001b[36m' },
  { name: 'client', cwd: 'client', color: '\u001b[35m' },
];

const RESET = '\u001b[0m';
const width = Math.max(...TARGETS.map(t => t.name.length));

function start({ name, cwd, color }) {
  const child = spawn(NPM, ['run', 'dev'], {
    cwd: path.join(ROOT, cwd),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  const tag = process.stdout.isTTY
    ? `${color}${name.padEnd(width)}${RESET} │ `
    : `${name.padEnd(width)} | `;

  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on('line', line => say(tag + line));
  }
  return child;
}

assertNodeVersion();

const children = TARGETS.map(start);
let stopping = false;

/** 하나가 멎으면 나머지도 내린다. */
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = code ?? 0;
}

for (const [i, child] of children.entries()) {
  child.on('exit', code => {
    if (!stopping) warn(`${TARGETS[i].name} 가 멎었습니다 (코드 ${code}). 나머지도 내립니다.`);
    stopAll(code ?? 0);
  });
  child.on('error', err => {
    warn(`${TARGETS[i].name} 를 띄우지 못했습니다: ${err.message}`);
    warn('먼저 npm run setup 을 돌려 의존성을 설치했는지 확인해 주세요.');
    stopAll(1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(0));
}
