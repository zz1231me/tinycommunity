// 무엇을 할지 골라서 쓰는 메뉴. `npm run go`.
//
// 명령이 여러 개라 처음에는 setup·dev·build·start 중 무엇을 쓸 차례인지 헷갈린다.
// 지금 상태(의존성·환경파일·빌드·포트)를 먼저 보여 주고, 할 수 있는 것만 고르게 한다.
//
// 고를 수 없는 것은 숨기지 않고 왜 못 하는지 적어 둔다 — 사라지면 그 기능이 없는
// 줄 알고, 회색으로 남겨 두면 무엇이 모자란지 바로 보인다.
//
// 번호를 바로 줄 수도 있다(`npm run go -- 2`). 익숙해지면 묻는 과정을 건너뛰고,
// 터미널이 아닌 곳에서도 쓸 수 있다.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT, NPM, assertNodeVersion, run, say, ok, warn } from './lib.mjs';

const has = (...parts) => fs.existsSync(path.join(ROOT, ...parts));
const read = file => (has(file) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : '');
const valueOf = (text, key, fallback) =>
  text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() || String(fallback);

function state() {
  const serverEnv = read('server/.env');
  const clientEnv = read('client/.env.local');
  return {
    deps: has('server', 'node_modules') && has('client', 'node_modules'),
    env: has('server', '.env'),
    built: has('server', 'dist', 'index.js') && has('client', 'dist', 'index.html'),
    api: valueOf(serverEnv, 'PORT', 4000),
    web: valueOf(clientEnv, 'VITE_PORT', 8080),
  };
}

function showState(s) {
  say('');
  say('  지금 상태');
  say(`    의존성   ${s.deps ? '설치됨' : '아직 — 1번을 먼저'}`);
  say(`    환경파일 ${s.env ? 'server/.env 있음' : '아직 — 1번을 먼저'}`);
  say(`    빌드     ${s.built ? 'server/dist · client/dist 있음' : '아직'}`);
  say(`    포트     API ${s.api} · 화면 ${s.web}`);
  say('');
}

/** 고를 수 있는 것들. need 가 거짓이면 왜 못 하는지 적는다. */
function items(s) {
  return [
    {
      key: '1',
      label: '처음 준비 (의존성 설치 + 환경파일)',
      hint: s.deps && s.env ? '이미 되어 있습니다. 다시 해도 안전합니다' : '여기서 시작하세요',
      args: ['run', 'setup'],
    },
    {
      key: '2',
      label: '개발 서버 실행',
      hint: `화면 http://localhost:${s.web} · API http://localhost:${s.api}`,
      args: ['run', 'dev'],
      need: s.deps && s.env,
      why: '먼저 1번(처음 준비)을 하세요',
    },
    {
      key: '3',
      label: '프로덕션 빌드',
      hint: '서버와 화면을 함께 만듭니다',
      args: ['run', 'build'],
      need: s.deps,
      why: '먼저 1번(처음 준비)을 하세요',
    },
    {
      key: '4',
      label: '빌드한 것 실행',
      hint: `한 포트에서 화면·API 모두 — http://localhost:${s.api}`,
      args: ['start'],
      need: s.built,
      why: '먼저 3번(빌드)을 하세요',
    },
    {
      key: '5',
      label: '테스트 전부',
      hint: '서버(Jest) + 화면(Vitest)',
      args: ['test'],
      need: s.deps,
      why: '먼저 1번(처음 준비)을 하세요',
    },
    {
      key: '6',
      label: '포트 바꾸기',
      hint: '서버와 화면을 함께 맞춥니다',
      args: ['run', 'ports'],
      ask: '새 포트 (예: --api 5000 --web 9000, 그냥 Enter 면 지금 값 보기): ',
    },
    {
      key: '7',
      label: '시크릿 새로 뽑기',
      hint: '올리기 전에 한 번. 모두 로그아웃됩니다',
      args: ['run', 'secrets'],
      need: s.env,
      why: '먼저 1번(처음 준비)을 하세요',
    },
  ];
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function main() {
  assertNodeVersion();

  const preset = process.argv[2];
  const s = state();
  const list = items(s);

  // 번호를 바로 준 경우 — 묻지 않고 실행한다.
  if (preset) {
    const chosen = list.find(i => i.key === preset);
    if (!chosen) {
      warn(`'${preset}' 는 없는 번호입니다. 번호 없이 npm run go 를 하면 목록이 나옵니다.`);
      process.exit(1);
    }
    if (chosen.need === false) {
      warn(chosen.why);
      process.exit(1);
    }
    const presetArgs = process.argv.slice(3);
    const args = presetArgs.length > 0 ? [...chosen.args, '--', ...presetArgs] : chosen.args;
    ok(`npm ${args.join(' ')}`);
    say('');
    await run(NPM, args);
    return;
  }

  if (!process.stdin.isTTY) {
    warn('번호 없이 고르려면 터미널이어야 합니다. 번호를 바로 주면 어디서든 됩니다.');
    say('');
    for (const item of list) say(`  npm run go -- ${item.key}   ${item.label}`);
    process.exit(1);
  }

  say('');
  say('  TinyCommunity');
  showState(s);

  for (const item of list) {
    const blocked = item.need === false;
    say(`    ${item.key}) ${item.label}`);
    say(`       ${blocked ? item.why : item.hint}`);
  }
  say('    q) 나가기');
  say('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await ask(rl, '  고르세요: ');

  if (answer === '' || answer.toLowerCase() === 'q') {
    rl.close();
    say('');
    return;
  }

  const chosen = list.find(i => i.key === answer);
  if (!chosen) {
    rl.close();
    warn(`'${answer}' 는 없는 번호입니다.`);
    process.exit(1);
  }
  if (chosen.need === false) {
    rl.close();
    warn(chosen.why);
    process.exit(1);
  }

  const extra = chosen.ask ? (await ask(rl, `  ${chosen.ask}`)).split(/\s+/).filter(Boolean) : [];
  rl.close();

  const args = extra.length > 0 ? [...chosen.args, '--', ...extra] : chosen.args;
  say('');
  ok(`npm ${args.join(' ')}`);
  say('');
  await run(NPM, args);
}

main().catch(err => {
  warn(err.message);
  process.exit(1);
});
