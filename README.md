# TinyCommunity

React + Express 기반의 풀스택 커뮤니티/게시판 플랫폼. SQLite·MySQL·MariaDB·PostgreSQL을 지원합니다.

[![CI](https://github.com/zz1231me/tinycommunity/actions/workflows/ci.yml/badge.svg)](https://github.com/zz1231me/tinycommunity/actions/workflows/ci.yml)

- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [빠른 시작](#빠른-시작)
- [프로젝트 구조](#프로젝트-구조)
- [환경변수](#환경변수)
- [데이터베이스](#데이터베이스)
- [아키텍처](#아키텍처)
- [API](#api)
- [Docker 배포](#docker-배포)
- [보안](#보안)
- [개발](#개발)
- [트러블슈팅](#트러블슈팅)

---

## 주요 기능

- **인증·권한**: JWT(HttpOnly 쿠키, 자동 갱신), 2FA(TOTP), 역할 기반 접근제어(RBAC), 관리자 비밀번호 초기화→강제 변경, 기기별 세션 관리, 멀티탭 자동 로그아웃
- **게시판**: 권한별 다중 게시판, CKEditor 5 에디터, 파일 첨부(확장자 제한 없음·위험 확장자만 차단)·이미지 인라인 업로드, 중첩 댓글·좋아요, 태그, 비밀글, 고정, 읽음 표시, 북마크, 자동저장, 삭제 게시글 보관 후 자동 영구삭제
- **위키**: 슬러그 기반 계층 페이지, 리비전·Diff, 발행/비발행
- **커스텀 페이지**: 관리자가 만드는 독립 페이지 — HTML 직접 작성 또는 정적 사이트 ZIP 번들 업로드(샌드박스 iframe 서빙), 사이드바 노출
- **메모**: 사용자별 스티키 메모(색상·고정·드래그 정렬)
- **캘린더**: FullCalendar 기반 일정(드래그&드롭, 월/주/일/목록 뷰, 역할별 권한)
- **알림·검색**: 폴링 알림(30초), 전역 검색(⌘K)
- **관리자**: 사용자·게시판·역할·태그·이벤트 관리, 보안/에러/감사/로그인 로그, 신고·IP 규칙·Rate Limit·사이트 설정
- **UI**: 프로필 아바타(업로드 또는 랜덤 생성), 다크/라이트 모드, 반응형

---

## 기술 스택

**Frontend** — React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand 5, React Query 5, React Router 7, CKEditor 5 (48), FullCalendar 6, Uppy 5, Framer Motion 12, DOMPurify 3, Vitest

**Backend** — Express 5, TypeScript 6, Sequelize 6, jsonwebtoken 9, bcryptjs 3, Speakeasy 2(2FA), Winston 3, Multer 2, Sharp(아바타), Zod 4, Helmet 8, Jest

**Database** — SQLite(기본) / MySQL / MariaDB / PostgreSQL

---

## 빠른 시작

**요구사항**: Node.js 20.x 이상, npm 9.x 이상.

```bash
# 1. 클론
git clone https://github.com/zz1231me/tinycommunity.git
cd tinycommunity

# 2. 서버 (http://localhost:4000)
cp server/.env.sample server/.env   # JWT_SECRET 등 시크릿 변경
cd server && npm install && npm run dev

# 3. 클라이언트 (새 터미널, http://localhost:8080)
cd client && npm install && npm run dev
```

| 서비스 | URL |
|--------|-----|
| 클라이언트 | http://localhost:8080 |
| API 서버 | http://localhost:4000 |
| API 문서 (Swagger, dev) | http://localhost:4000/api-docs |

- 기본 DB는 **SQLite**라 별도 설치가 필요 없습니다. 첫 실행 시 테이블·기본 데이터(admin 계정·역할·사이트 설정)가 자동 생성됩니다.
- **초기 로그인**: ID `admin`, 비밀번호는 `server/.env`의 `ADMIN_DEFAULT_PASSWORD`. 로그인 후 반드시 변경하세요.
- Windows에서 기본 명령(`npm run dev/build/test`)은 PowerShell/cmd에서 동작합니다. 보조 스크립트에 문제가 있으면 Git Bash/WSL2를 사용하세요.

---

## 프로젝트 구조

```
tinycommunity/
├── client/                 # React + Vite
│   └── src/                # api · components · pages · hooks · store · styles · utils
├── server/                 # Express + Sequelize
│   └── src/                # config · controllers · middlewares(+upload) · models · routes · services · utils · validators
│       ├── __tests__/      # Jest (SQLite in-memory)
│       └── scripts/        # DB 시드/인덱스 스크립트
├── server/.env.sample      # 환경변수 템플릿
├── docker-compose.yml      # MariaDB + App + Nginx
├── Dockerfile              # 멀티스테이지 빌드
└── nginx.conf              # 리버스 프록시
```

---

## 환경변수

`server/.env.sample`을 `server/.env`로 복사해 사용합니다. 파일 업로드 한도 등 운영 설정은 환경변수가 아니라 **관리자 → 사이트 설정**에서 DB 기반으로 관리됩니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `NODE_ENV` | `development` | `production`이면 시크릿 검증·보안 헤더·쿠키 Secure 강화 |
| `PORT` | `4000` | API 서버 포트 |
| `JWT_SECRET` | — | **필수**. 액세스 토큰 서명 키(프로덕션 32자 이상) |
| `JWT_REFRESH_SECRET` | — | **필수**. 리프레시 토큰 키(`JWT_SECRET`과 달라야 함) |
| `ADMIN_DEFAULT_PASSWORD` | `ChangeMe_2024!` | 초기 admin 비밀번호(프로덕션은 약한 값 부팅 차단) |
| `COOKIE_SECURE` | 프로덕션 `true` | 인증 쿠키 Secure 플래그. HTTP 인트라넷은 `false` |
| `DB_TYPE` | `sqlite` | `sqlite` / `mysql` / `mariadb` / `postgresql` |
| `DB_STORAGE` | `./database.sqlite` | SQLite 파일 경로 |
| `DB_HOST`·`DB_PORT`·`DB_USER`·`DB_PASSWORD`·`DB_NAME` | — | 非 SQLite 접속 정보 |
| `DB_SSL` / `DB_SSL_CA` | `false` / — | DB SSL 및 CA 인증서 |
| `ALLOWED_ADMIN_IPS` | (미설정=전체 허용) | 관리자 API 허용 IP(쉼표 구분) |
| `CLIENT_URL` / `CORS_ORIGINS` / `ALLOWED_ORIGINS` | — | CORS 허용 오리진(쉼표 구분) |
| `SECURITY_LOG_RETENTION_DAYS` / `ERROR_LOG_RETENTION_DAYS` | `90` / `30` | 로그 보존 기간(일) |

---

## 데이터베이스

기본값은 **SQLite**입니다. 다른 DB로 전환하려면 [DATABASE_SETUP_GUIDE.md](./DATABASE_SETUP_GUIDE.md)를 참고하세요. 모든 드라이버는 `optionalDependencies`로 포함되어 `npm install`에 함께 설치됩니다.

테이블 스키마는 서버 첫 실행 시 Sequelize `sync`로 자동 생성되며, SQLite는 신규 설정 컬럼을 자동 보정합니다.

---

## 아키텍처

**데이터 모델** (Sequelize, 30개)

| 도메인 | 모델 |
|--------|------|
| 인증·사용자 | `User` `Role` `UserSession` `LoginHistory` `PasswordResetRequest` |
| 게시판·게시글 | `Board` `BoardAccess` `BoardManager` `Post` `PostTag` `PostRead` `PostLike` `PostBookmark` `Bookmark` |
| 댓글 | `Comment` `CommentLike` |
| 위키·메모 | `WikiPage` `WikiRevision` `Memo` |
| 이벤트 | `Event` `EventPermission` |
| 태그·알림·신고 | `Tag` `Notification` `Report` |
| 운영·보안 | `SiteSettings` `RateLimitSettings` `IpRule` `SecurityLog` `ErrorLog` `AuditLog` |

- `Post`·`Comment`은 soft-delete(`paranoid`). 게시글 삭제 시 자식(댓글/좋아요/조회기록/태그/북마크)을 트랜잭션으로 함께 정리합니다.
- 첨부파일은 `Post.attachments`에 JSON으로 저장하고, 실제 파일은 확장자를 제거한 무작위 파일명으로 `uploads/files`에 보관합니다.

**권한 모델 (RBAC)** — 기본 역할 `admin` / `manager` / `user` / `guest`(앞 세 개는 삭제 불가). 관리자 페이지에서 커스텀 역할을 만들고 게시판별 권한을 부여할 수 있습니다.

| 레이어 | 권한 | 대상 |
|--------|------|------|
| 게시판 접근 (`BoardAccess`) | `canRead` / `canWrite` / `canDelete` | 역할별 게시판 |
| 게시판 담당자 (`BoardManager`) | 관리 위임 | 사용자별 |
| 이벤트 (`EventPermission`) | `canRead` / `canCreate` / `canUpdate` / `canDelete` | 역할별 |
| 위키 | 읽기/쓰기 역할 목록 | 역할별 |
| 개인 폴더 | 소유자 전용 | 사용자별 |

비활성 게시판은 admin/manager 외 접근이 차단되며, 비밀글은 비밀번호·허용 사용자 목록·E2EE 옵션을 지원합니다.

---

## API

개발 모드에서 Swagger UI(`http://localhost:4000/api-docs`)로 전체 문서를 확인할 수 있습니다.

주요 엔드포인트: `/api/auth` · `/api/2fa` · `/api/boards` · `/api/posts` · `/api/comments` · `/api/events` · `/api/memos` · `/api/wiki` · `/api/tags` · `/api/notifications` · `/api/users` · `/api/bookmarks` · `/api/reports` · `/api/site-settings` · `/api/admin` · `/api/uploads`

---

## Docker 배포

`docker-compose`는 MariaDB + App(Node) + Nginx를 함께 띄웁니다. 클라이언트 정적 파일은 이미지 빌드 시 포함됩니다.

```bash
# 프로젝트 루트 .env에 필수 시크릿 작성 (강한 값으로 교체)
cat > .env <<'EOF'
DB_PASSWORD=change-me
DB_ROOT_PASSWORD=change-me
JWT_SECRET=change-me-32-characters-minimum
JWT_REFRESH_SECRET=change-me-different-32-characters
ADMIN_DEFAULT_PASSWORD=change-me
EOF

docker-compose up -d --build      # 빌드 & 실행 (첫 실행 DB 초기화 ~30초)
docker-compose logs -f app        # 로그
docker-compose down               # 중지 (down -v = 데이터 포함 삭제)
```

`nginx.conf`는 기본적으로 내부 네트워크(192.168.x.x, 172.16.x.x)만 허용합니다. 공인 IP에서 접근하려면 해당 `allow`/`deny` 블록을 수정하세요.

---

## 보안

- HttpOnly 쿠키 JWT + 2FA(TOTP), 로그아웃/비밀번호 변경 시 `tokenVersion`으로 기존 세션 즉시 무효화
- Rate Limiting(전체/API/로그인, DB 기반 동적 설정), IP 화이트리스트(Nginx + 앱)
- XSS 방지(클라 DOMPurify + 서버 sanitize-html), SQL Injection 방지(ORM 바인딩 + Zod), Helmet 보안 헤더, CSRF(X-Requested-With)
- **파일 업로드 하드닝**: 위험 확장자 절대 차단(정규화 우회 방지), 확장자 제거·무작위 파일명 저장, 실행 권한 제거(chmod 644), 첨부는 인가된 다운로드 경로에서 `attachment` + `nosniff`로만 제공(정적 서빙 우회 차단), 인라인 이미지 경로는 매직넘버 검증으로 저장형 XSS 방어
- 비밀번호 재설정 토큰 SHA-256 해싱, bcrypt 비밀번호 해싱, 프로덕션 시크릿 검증(약한 값 부팅 차단), 보안 이벤트 로깅

**배포 전 체크리스트**: `.env` 커밋 금지 · `JWT_SECRET`/`ADMIN_DEFAULT_PASSWORD` 강한 값으로 변경 · HTTPS 적용 · `ALLOWED_ADMIN_IPS` 설정 · 정기 `npm audit`.

---

## 개발

**로컬 검증 (CI 기준)**

```bash
cd server && npx tsc --noEmit && npm run lint && npm run format:check && npm test
cd client && npx tsc --noEmit && npm run lint && npm run format:check && npm run build
```

**주요 스크립트**

| | 서버 | 클라이언트 |
|--|------|-----------|
| 개발 | `npm run dev` (4000) | `npm run dev` (8080) |
| 빌드 | `npm run build` → `dist/` | `npm run build` → `dist/` |
| 실행 | `npm start` | `npm run preview` |
| 테스트 | `npm test` (Jest) | `npm test` (Vitest) |
| 린트/포맷 | `npm run lint` · `format` | `npm run lint` · `format` |

서버 보조 스크립트: `setup:{sqlite\|mysql\|mariadb\|postgresql}`(‧env 작성), `db:indexes`, `init:roles`.

**규칙**: TypeScript strict · ESLint + Prettier · 미사용 파라미터 `_` 접두사 · 로깅은 `logInfo()`/`logError()` · 응답은 `sendSuccess()`/`sendError()`.

---

## 트러블슈팅

**포트 충돌** — `lsof -i :4000`(Mac/Linux) 또는 `netstat -ano | findstr :4000`(Windows)로 확인. 서버 포트는 `server/.env`의 `PORT`, 클라이언트 API 대상은 `client/.env.local`의 `VITE_API_URL`로 변경.

**DB 초기화** — SQLite는 `rm server/database.sqlite` 후 재실행. 외부 DB는 `DROP DATABASE tinycommunity;` → `CREATE DATABASE tinycommunity;`.

**Docker Nginx 빈 화면** — 볼륨 재생성: `docker-compose down -v && docker-compose up -d --build`.

---

## 라이선스

MIT
