# TinyCommunity

React + Express 로 만든 커뮤니티·게시판 플랫폼. 사내망에 올려 쓰는 것을 염두에 두고 만들었습니다.
기본 DB 가 SQLite 라 아무것도 설치하지 않고 바로 띄울 수 있습니다.

[![CI](https://github.com/zz1231me/tinycommunity/actions/workflows/ci.yml/badge.svg)](https://github.com/zz1231me/tinycommunity/actions/workflows/ci.yml)

---

## 바로 띄우기

**필요한 것**: Node.js 20 이상. 그게 전부입니다.

```bash
git clone https://github.com/zz1231me/tinycommunity.git
cd tinycommunity
npm run setup   # 의존성 설치 + server/.env 생성(시크릿 자동 생성)
npm run dev     # 서버와 화면을 한 번에
```

**무엇을 할 차례인지 헷갈리면** `npm run go` 를 치세요. 지금 상태(의존성·환경파일·빌드·
포트)를 보여 주고 할 수 있는 것만 골라서 실행합니다. 번호를 바로 줘도 됩니다 —
`npm run go -- 2` 는 개발 서버.

```
  지금 상태
    의존성   설치됨
    환경파일 server/.env 있음
    빌드     아직
    포트     API 4000 · 화면 8080

    1) 처음 준비 (의존성 설치 + 환경파일)
    2) 개발 서버 실행
    3) 프로덕션 빌드
    4) 빌드한 것 실행       ← 먼저 3번(빌드)을 하세요
    ...
```

|           |                                                                       |
| --------- | --------------------------------------------------------------------- |
| 화면      | http://localhost:8080                                                 |
| API       | http://localhost:4000                                                 |
| API 문서  | http://localhost:4000/api-docs                                        |
| 첫 로그인 | 아이디 `admin` · 비밀번호는 `server/.env` 의 `ADMIN_DEFAULT_PASSWORD` |

**Windows·macOS·Linux 에서 명령이 같습니다.** PowerShell·cmd·bash 어디서든 위 네 줄 그대로입니다.
CI 가 windows-latest 와 ubuntu-latest 양쪽에서 이 경로를 그대로 밟습니다.

<details>
<summary><code>npm run setup</code> 이 하는 일</summary>

1. `server/`·`client/` 의존성 설치
2. `server/.env` 가 **없을 때만** `.env.sample` 을 바탕으로 만들고 `JWT_SECRET`·
   `JWT_REFRESH_SECRET`·`ADMIN_DEFAULT_PASSWORD` 를 새로 뽑아 넣습니다.
   이미 있으면 손대지 않습니다 — 적어 둔 DB 접속 정보가 날아가지 않게.

</details>

---

## 명령

**루트에서 한 번에**

| 명령                                         | 하는 일                                        |
| -------------------------------------------- | ---------------------------------------------- |
| `npm run go`                                 | 뭘 할지 골라서 실행(지금 상태도 보여 줌)       |
| `npm run setup`                              | 의존성 설치 + `server/.env` 생성(처음 한 번)   |
| `npm run ports`                              | 서버·화면 포트를 함께 바꾸기                   |
| `npm run dev`                                | 서버·화면 동시 실행                            |
| `npm run build`                              | 서버·화면 프로덕션 빌드                        |
| `npm start`                                  | 빌드한 것을 `NODE_ENV=production` 으로 실행    |
| `npm run secrets`                            | `server/.env` 의 JWT 키 두 개를 새로 뽑아 교체 |
| `npm test`                                   | 서버(Jest) + 화면(Vitest) 전부                 |
| `npm run lint`                               | 양쪽 ESLint                                    |
| `npm run typecheck` · `npm run format:check` | 양쪽 타입검사 · 서식 검사                      |

스크립트 본체는 `scripts/` 에 있습니다. CI 가 **windows-latest 와 ubuntu-latest 양쪽에서**
`setup → build → smoke` 를 그대로 돌리므로, 처음 받는 경로가 두 OS 에서 깨지면 바로 빨강이 됩니다.

**로컬 검증 (CI 기준)**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

**패키지별 스크립트**

|           | 서버                      | 클라이언트                |
| --------- | ------------------------- | ------------------------- |
| 개발      | `npm run dev` (4000)      | `npm run dev` (8080)      |
| 빌드      | `npm run build` → `dist/` | `npm run build` → `dist/` |
| 실행      | `npm start`               | `npm run preview`         |
| 테스트    | `npm test` (Jest)         | `npm test` (Vitest)       |
| 타입검사  | `npm run typecheck`       | `npm run typecheck`       |
| 린트/포맷 | `npm run lint` · `format` | `npm run lint` · `format` |

서버 `typecheck`는 테스트 파일까지 검사합니다(`build`는 `dist`에 넣지 않으려고 테스트를 제외하고, jest 는 ts-jest `diagnostics:false` 라 타입을 보지 않습니다).

서버 보조 스크립트: `setup:{sqlite\|mysql\|mariadb\|postgresql}`(‧env 작성), `db:indexes`, `init:roles`.

**규칙**: TypeScript strict · ESLint + Prettier · 미사용 파라미터 `_` 접두사 · 로깅은 `logInfo()`/`logError()` · 응답은 `sendSuccess()`/`sendError()`.

---

## 포트 바꾸기

8080·4000 을 이미 다른 데 쓰고 있다면 한 명령으로 바꿉니다. 서버와 화면을 **함께**
맞춰 주는 게 핵심입니다 — 한쪽만 바꾸면 화면은 뜨는데 로그인부터 실패합니다.

```bash
npm run ports                            # 지금 값 보기
npm run ports -- --web 9000              # 화면만
npm run ports -- --api 5000 --web 9000   # 둘 다
```

| 바뀌는 곳           | 값                                               |
| ------------------- | ------------------------------------------------ |
| `server/.env`       | `PORT`                                           |
| `client/.env.local` | `VITE_PORT` · `VITE_API_URL`(서버 포트를 따라감) |

돌고 있는 개발 서버가 있으면 다시 띄워야 적용됩니다. 설치할 때 미리 정해 두려면
`npm run setup` 뒤에 바로 `npm run ports -- --api 5000 --web 9000` 을 돌리면 됩니다.

**도커로 올릴 때**는 루트 `.env` 에서 호스트 포트를 정합니다(컨테이너 안은 그대로입니다).

```bash
APP_HOST_PORT=14000    # 앱  (기본 4000)
HTTP_HOST_PORT=18080   # nginx (기본 80)
DB_HOST_PORT=13306     # MariaDB (기본 3306)
```

---

## 올리기

### Docker 없이

올릴 때는 Express 가 `client/dist` 를 직접 서빙합니다 — **화면과 API 가 같은 4000 포트**라
리버스 프록시 없이도 돕니다.

```bash
npm run build     # 서버(tsc) + 화면(vite) 둘 다. 하나만 만들면 반쪽이 됩니다
npm run secrets   # 올리기 전 한 번: JWT 키 두 개를 새로 뽑아 .env 에 끼웁니다
npm start         # NODE_ENV=production 으로 실행 → http://localhost:4000
```

`npm start` 는 띄우기 **전에** `server/.env` 를 읽어, 시크릿이 `.env.sample` 그대로이거나
너무 짧으면 고치는 방법과 함께 멈춥니다.

올리기 전에 확인할 값:

| 값                       | 올릴 때                                     |
| ------------------------ | ------------------------------------------- |
| `NODE_ENV`               | `production`                                |
| `JWT_SECRET` 두 개       | 32자 이상, 서로 다른 값 (`npm run secrets`) |
| `ADMIN_DEFAULT_PASSWORD` | 약한 값이면 부팅이 막힙니다                 |
| `COOKIE_SECURE`          | HTTPS 면 `true`, 사내망 HTTP 면 `false`     |

서비스로 계속 띄우려면 `pm2 start npm --name tinycommunity -- start` 처럼 `npm start` 를
감싸거나, systemd 유닛의 `ExecStart` 에 `/usr/bin/npm start` 를 적으면 됩니다.

### Docker

MariaDB + 앱 + Nginx 를 함께 띄웁니다.

```bash
cat > .env <<'EOF'
DB_PASSWORD=change-me
DB_ROOT_PASSWORD=change-me
JWT_SECRET=change-me-32-characters-minimum
JWT_REFRESH_SECRET=change-me-different-32-characters
ADMIN_DEFAULT_PASSWORD=change-me
EOF

docker-compose up -d --build   # 첫 실행은 DB 초기화에 ~30초
docker-compose logs -f app
docker-compose down            # down -v 면 데이터까지 지움
```

접속은 nginx 를 거쳐 **80 포트**, 또는 앱으로 바로 **4000 포트**.

nginx 설정이 두 벌인 이유: `nginx.conf` 는 호스트에 직접 설치하는 경우용이고,
컨테이너는 `nginx.docker.conf` 를 씁니다(`upstream` 이 `app:4000`, 경로가 컨테이너 기준).
`nginx.conf` 를 고쳤다면 `npm run nginx:docker` 로 컨테이너용을 다시 만드세요.

---

## 문제가 생기면

**포트 충돌** — `lsof -i :4000`(Mac/Linux) 또는 `netstat -ano | findstr :4000`(Windows)로 확인. 서버 포트는 `server/.env`의 `PORT`, 클라이언트 API 대상은 `client/.env.local`의 `VITE_API_URL`로 변경.

**`npm start` 가 시크릿 때문에 멈춤** — `server/.env` 가 `.env.sample` 그대로입니다.
`npm run secrets` 로 JWT 키를 뽑고, `ADMIN_DEFAULT_PASSWORD` 는 직접 정하세요.
개발용으로 그냥 띄울 때는 `npm run dev` 를 쓰면 이 검사를 거치지 않습니다.

**`npm start` 는 떴는데 화면이 빈 페이지** — `client/dist` 가 없습니다. `npm run build` 는
서버·화면을 함께 만듭니다(`server` 쪽만 빌드하면 API 만 뜹니다).

**`npm run dev` 가 바로 꺼짐** — 줄머리(`server`·`client`)를 보고 어느 쪽인지 확인하세요.
대개 포트가 이미 쓰이고 있는 경우이고(`Port 8080 is already in use`), 한쪽이 멎으면
다른 쪽도 함께 내려갑니다.

**DB 초기화** — SQLite는 `rm server/database.sqlite` 후 재실행. 외부 DB는 `DROP DATABASE tinycommunity;` → `CREATE DATABASE tinycommunity;`.

---

## 더 보기

| 문서                                         | 내용                               |
| -------------------------------------------- | ---------------------------------- |
| [docs/CONFIG.md](docs/CONFIG.md)             | 환경변수 전체·데이터베이스 전환    |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 폴더 구조·요청 흐름·API 목록       |
| [docs/SECURITY.md](docs/SECURITY.md)         | 인증·권한·업로드 방어              |
| [docs/DATABASE.md](docs/DATABASE.md)         | MySQL·MariaDB·PostgreSQL 설치 안내 |

---

## 무엇이 들어 있나

- **인증·권한**: JWT(HttpOnly 쿠키, 자동 갱신), 2FA(TOTP), 역할 기반 접근제어(RBAC), 관리자 비밀번호 초기화→강제 변경, 기기별 세션 관리, 멀티탭 자동 로그아웃
- **게시판**: 권한별 다중 게시판, CKEditor 5 에디터, 파일 첨부·이미지 인라인 업로드, 중첩 댓글·좋아요·이모지 반응, 태그, 비밀글(비밀번호·지정 사용자·E2EE), 기간 지정 상단 고정, 읽음 표시, 북마크, 임시저장, 수정 이력·Diff, 게시판 간 이동, 삭제 후 보관 기간 경과 시 자동 영구삭제
- **업무용 게시판**: 게시판별 '업무용' 전환, 글마다 담당자·진행 상태(할 일·진행 중·완료), 상태별 목록 필터, 관리자 지정 상태 이름. 게시판 안에서 **목록·보드·간트·달력** 탭으로 같은 글을 달리 본다(고른 보기는 주소에 남아 링크로 주고받을 수 있다). 여러 게시판을 가로지를 때는 '내 업무' 로 모아 본다. 하위 업무는 목록에서 상위 줄 아래로 접힌다 — 줄 앞 삼각형으로 펼치고, 접은 채로도 '하위 1/3' 로 얼마나 남았는지 본다. 찾거나 거를 때는 접지 않는다(맞는 하위가 접힌 줄에 숨지 않게) 대신 그 줄에 상위 제목을 붙인다
- **증적 관리**: 본문 안 문단별 첨부 참조, 같은 이름으로 재업로드 시 이전 파일 개정 이력 보관, 읽음 확인(작성자·게시판 담당자만), 작성·수정·첨부 교체·상태 변경 통합 활동 기록
- **소통·탐색**: 다이렉트 메시지, 게시판·사용자 구독, 사용자 프로필, 인기글·관련 글·태그 클라우드, 스크랩, 실시간 알림(SSE, 폴링 폴백), @멘션, 전역 검색(⌘K)
- **위키**: 슬러그 기반 계층 페이지, 리비전·Diff, 발행/비발행
- **커스텀 페이지**: 관리자가 만드는 독립 페이지 — HTML 직접 작성 또는 정적 사이트 ZIP 번들 업로드(샌드박스 iframe 서빙), 사이드바 노출
- **메모·캘린더**: 사용자별 스티키 메모(색상·고정·드래그 정렬), FullCalendar 기반 일정(드래그&드롭, 반복·하루만 건너뛰기). 전사 공유 달력은 역할별 권한을 따르고, 게시판마다 켜는 **게시판 달력**은 그 게시판의 접근 권한을 따른다 — 볼 수 있으면 일정이 보이고 글을 쓸 수 있으면 일정을 세운다. 게시판 달력에는 그 게시판 업무의 기간도 함께 그려진다. 일정 종류(연차·회의 …)는 관리자 → 사이트 설정에서 이름·그림문자·색을 정한다
- **포인트**: 하루 한도 내 뽑기와 접속 시 출석 포인트, 상위 10명 순위와 내 자리, 포인트를 걸고 겨루는 1:1 가위바위보 대결(신청하는 순간 포인트를 맡기고, 승부와 정산을 한 트랜잭션으로 끝내며, 답이 없는 판은 자동 환불), 관리자 지정 확률·금액·횟수·출석량·판돈 범위, 서버 전용 추첨, 잔액과 별개로 남는 적립 원장
- **출퇴근**: 하루 한 번 출근·퇴근 기록(초를 버리고 분 단위로 저장), 출근 시 체크리스트, 근무 시간 집계와 개인 통계, 헤더의 출근 아이콘(아직 안 찍었으면 눈에 띄게 표시), 출근 알림창과 퇴근 알림창(퇴근은 10분 전·정각·3분 뒤 세 번), 관리자 지정 기준 근무시간·안내 문구·출근 시각 보정(컴퓨터를 켜는 시간만큼 앞당겨 기록, 기본 0분)
- **퇴근 공격**: 포인트로 사는 두 가지 방해 — _퇴근 방해_(기본 1분, 버튼이 도망다니고 깜빡이지만 끝까지 누르면 눌린다)와 _버튼 숨기기_(기본 10초, 그동안은 버튼이 아예 없다). 받은 쪽은 방어권으로 즉시 해제. 숨기기만 실제로 누를 수 없는 시간이 생기므로 짧게 두고 서버가 3~60초로 상한을 막는다. 어느 쪽이든 **기록되는 퇴근 시각은 언제나 실제로 누른 순간** 그대로다 — 남이 남의 근무 기록을 늦출 수 없다. 공격권을 사는 곳은 마이페이지의 포인트 탭이고, 받는 쪽 화면(경고 띠·도망가는 버튼)은 출퇴근 화면에 있다
- **관리자**: 기능 스위치 27종(기능별 on/off, 의존성 자동 해소), 사용자·게시판·역할·태그·이벤트 관리, 테마(브랜드 색 계단 자동 생성), 보안/에러/감사/로그인 로그, 신고·IP 규칙·사이트 설정
- **대시보드**: 들어오면 오늘 챙길 것만 모아 보여 주는 조망 화면(마감이 걸린 내 업무·오늘 일정·내 게시판 새 글). 첫 화면은 본인이 고른다(자동 / 대시보드 / 일정 / 탐색 / 메모 / 위키 / 업무 / 스크랩)
- **UI**: 라이트·다크·드라큘라 테마, 프로필 아바타, 반응형, 댓글 가상 스크롤

### 기술 스택

**Frontend** — React 19, TypeScript 6, Vite 8(Rolldown), Tailwind CSS 4, Zustand 5, React Query 5, React Router 7, CKEditor 5(48), FullCalendar 6, Uppy 5, Framer Motion 12, TanStack Virtual 3, DOMPurify 3, Vitest 5

**Backend** — Express 5, TypeScript 6, Sequelize 6, jsonwebtoken 9, bcryptjs 3, Speakeasy 2(2FA), Multer 2, Sharp(아바타·썸네일), Zod 4, Helmet 8, Jest 30. 로깅은 외부 라이브러리 없이 `utils/logger.ts` 자체 구현입니다.

**Database** — SQLite(기본) / MySQL / MariaDB / PostgreSQL

---

## 라이선스

MIT
