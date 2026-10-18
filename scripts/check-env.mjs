// setup 이 만든 server/.env 가 정말 쓸 수 있는 값인지. CI 가 부른다.
//
// '파일이 생겼다' 와 '그 파일로 프로덕션이 뜬다' 는 다르다. 시크릿이 자리표시자로
// 남아 있으면 npm start 에서 막히므로, 만든 직후에 바로 확인한다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ok, warn } from './lib.mjs';
import { placeholderProblems } from './secrets.mjs';

const ENV_PATH = path.join(ROOT, 'server', '.env');

if (!fs.existsSync(ENV_PATH)) {
  warn('server/.env 가 만들어지지 않았습니다.');
  process.exit(1);
}

const problems = placeholderProblems(fs.readFileSync(ENV_PATH, 'utf8'));
if (problems.length > 0) {
  warn(`아직 자리표시자인 값이 있습니다: ${problems.join(', ')}`);
  process.exit(1);
}

ok('server/.env 의 시크릿이 실제 값으로 채워졌습니다.');
