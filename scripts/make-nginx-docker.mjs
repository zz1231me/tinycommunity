// nginx.docker.conf 를 nginx.conf 에서 다시 만든다.
//
// 두 파일을 따로 손보면 한쪽만 고쳐져 어긋난다. 컨테이너용은 원본에서 딱 두 줄만
// 다르므로, 손으로 베끼지 않고 여기서 바꿔 만든다.
//
//   1) upstream: 컨테이너 안에서 127.0.0.1 은 nginx 자신이다 → 서비스 이름 app
//   2) $project_root: 호스트 경로가 컨테이너에는 없다 → /srv/tinycommunity
//      (compose 가 정적 파일·업로드 볼륨을 그 아래에 붙인다)

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ok, warn } from './lib.mjs';

const SRC = path.join(ROOT, 'nginx.conf');
const OUT = path.join(ROOT, 'nginx.docker.conf');

const HEADER = `# ========================================
# 컨테이너용 nginx 설정 — docker-compose 가 이 파일을 쓴다.
#
# nginx.conf 는 호스트에 직접 설치하는 경우를 위한 것이라 컨테이너에서는 두 군데가
# 어긋난다. 그대로 마운트하면 화면이 빈 채로 뜨거나 502 가 난다.
#
#   1) upstream: 컨테이너 안에서 127.0.0.1 은 nginx 자신이다 → 서비스 이름 app 으로
#   2) $project_root: 호스트 경로(C:/myproject)가 컨테이너에는 없다 → /srv/tinycommunity 로
#      (compose 가 정적 파일·업로드 볼륨을 그 아래에 붙인다)
#
# 손으로 고치지 말 것. nginx.conf 를 고친 뒤 아래 명령으로 다시 만든다.
#
#   npm run nginx:docker
# ========================================

`;

const src = fs.readFileSync(SRC, 'utf8');

let out = src.replace(
  /(upstream app_server \{\s*\n\s*)server 127\.0\.0\.1:4000;/,
  '$1server app:4000;'
);
if (out === src) {
  warn('nginx.conf 의 upstream 줄을 찾지 못했습니다. 원본이 바뀌었는지 확인해 주세요.');
  process.exit(1);
}

const withRoot = out.replace(
  /^(\s*)set\s+\$project_root\s+\S+;/m,
  '$1set $project_root  /srv/tinycommunity;'
);
if (withRoot === out) {
  warn('nginx.conf 의 $project_root 줄을 찾지 못했습니다. 원본이 바뀌었는지 확인해 주세요.');
  process.exit(1);
}

fs.writeFileSync(OUT, HEADER + withRoot);
ok('nginx.docker.conf 를 nginx.conf 에서 다시 만들었습니다 (바뀐 줄 2개).');
