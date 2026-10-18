// 이미 있는 server/.env 의 시크릿만 새로 뽑아 끼운다. 나머지 줄은 그대로 둔다.
//
// 개발용으로 .env.sample 을 그대로 복사해 쓰다가 그대로 올리는 일이 잦다. 그러면
// 부팅이 막히는데, 그 안내가 Node 스택 트레이스에 묻혀 잘 안 읽힌다. 올리기 전에
// 이 명령 한 줄로 바꿔 둘 수 있게 한다.
//
// DB 접속 정보·포트처럼 사람이 적어 둔 값은 건드리지 않는다.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, say, ok, warn } from './lib.mjs';

const ENV_PATH = path.join(ROOT, 'server', '.env');

/** 바꿀 열쇠와 새 값 만드는 법 */
const FIELDS = [
  ['JWT_SECRET', () => crypto.randomBytes(48).toString('base64url')],
  ['JWT_REFRESH_SECRET', () => crypto.randomBytes(48).toString('base64url')],
];

/** .env.sample 그대로이거나 뻔한 값인지. start 전에 미리 알려 주려고 내보낸다. */
export function placeholderProblems(text) {
  const value = key => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
  const problems = [];
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = value(key);
    if (!v || v.includes('change-this') || v.length < 32) problems.push(key);
  }
  const admin = value('ADMIN_DEFAULT_PASSWORD');
  if (!admin || admin.length < 8 || /^(admin|password|ChangeMe_2024!)$/i.test(admin)) {
    problems.push('ADMIN_DEFAULT_PASSWORD');
  }
  return problems;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    warn('server/.env 가 없습니다. 먼저 npm run setup 을 돌려 주세요.');
    process.exit(1);
  }

  let text = fs.readFileSync(ENV_PATH, 'utf8');
  const changed = [];

  for (const [key, make] of FIELDS) {
    const line = `${key}=${make()}`;
    if (new RegExp(`^${key}=`, 'm').test(text)) {
      text = text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
    } else {
      text += `${text.endsWith('\n') ? '' : '\n'}${line}\n`;
    }
    changed.push(key);
  }

  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
  ok(`새로 뽑아 넣었습니다: ${changed.join(', ')}`);
  say('');
  say('이미 로그인해 둔 사람들은 키가 바뀌어 모두 로그아웃됩니다.');

  const left = placeholderProblems(text);
  if (left.length > 0) {
    say('');
    warn(`아직 손봐야 하는 값: ${left.join(', ')}`);
    warn('server/.env 에서 직접 바꿔 주세요(초기 admin 비밀번호는 사람이 정하는 값입니다).');
  }
}

// start.mjs 가 placeholderProblems 만 가져다 쓰므로, 직접 실행했을 때만 고친다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
