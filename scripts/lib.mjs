// 셋업·개발·빌드 스크립트가 함께 쓰는 것들.
//
// .sh 와 .bat 를 따로 두지 않는다. 두 벌을 관리하면 한쪽만 고쳐져 어긋나고,
// 윈도우에서 가장 자주 막히는 자리(NODE_ENV=x 가 cmd·PowerShell 에서 안 먹는 것,
// npm 이 npm.cmd 인 것)도 Node 쪽에서 한 번에 다룰 수 있다.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 윈도우에서 npm 은 npm.cmd 다. 그대로 부르면 ENOENT 가 난다. */
export const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
};
const paint = (code, text) => (process.stdout.isTTY ? `${code}${text}${COLORS.reset}` : text);

export const say = msg => console.log(msg);
export const step = msg => console.log(`\n${paint(COLORS.dim, '▶')} ${msg}`);
export const ok = msg => console.log(`${paint(COLORS.green, '✓')} ${msg}`);
export const warn = msg => console.log(`${paint(COLORS.red, '!')} ${msg}`);

/** 하위 명령을 그대로 이어 실행한다. 실패하면 그 코드로 끝낸다. */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...opts.env },
      // 윈도우에서 .cmd 를 실행하려면 셸이 필요하다
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} → 종료 코드 ${code}`))
    );
  });
}

/** Node 가 요구 버전을 넘는지. package.json 의 engines 와 같은 값을 쓴다. */
export const MIN_NODE_MAJOR = 20;

export function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    warn(`Node ${MIN_NODE_MAJOR} 이상이 필요합니다. 지금은 ${process.versions.node} 입니다.`);
    warn('https://nodejs.org 에서 LTS 를 받으시거나 nvm 으로 올려 주세요.');
    process.exit(1);
  }
}
