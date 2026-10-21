# 설정

환경변수와 데이터베이스.

> 운영 중 바꾸는 값(파일 크기 한도·기능 스위치 등)은 환경변수가 아니라
> **관리자 → 사이트 설정** 에서 DB 로 관리합니다.

---

## 환경변수

`server/.env.sample`을 `server/.env`로 복사해 사용합니다. 파일 업로드 한도 등 운영 설정은 환경변수가 아니라 **관리자 → 사이트 설정**에서 DB 기반으로 관리됩니다.

| 변수                                                       | 기본값              | 설명                                                    |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------- |
| `NODE_ENV`                                                 | `development`       | `production`이면 시크릿 검증·보안 헤더·쿠키 Secure 강화 |
| `PORT`                                                     | `4000`              | API 서버 포트                                           |
| `JWT_SECRET`                                               | —                   | **필수**. 액세스 토큰 서명 키(프로덕션 32자 이상)       |
| `JWT_REFRESH_SECRET`                                       | —                   | **필수**. 리프레시 토큰 키(`JWT_SECRET`과 달라야 함)    |
| `ADMIN_DEFAULT_PASSWORD`                                   | `ChangeMe_2024!`    | 초기 admin 비밀번호(프로덕션은 약한 값 부팅 차단)       |
| `COOKIE_SECURE`                                            | 프로덕션 `true`     | 인증 쿠키 Secure 플래그. HTTP 인트라넷은 `false`        |
| `DB_TYPE`                                                  | `sqlite`            | `sqlite` / `mysql` / `mariadb` / `postgresql`           |
| `DB_STORAGE`                                               | `./database.sqlite` | SQLite 파일 경로                                        |
| `DB_HOST`·`DB_PORT`·`DB_USER`·`DB_PASSWORD`·`DB_NAME`      | —                   | 非 SQLite 접속 정보                                     |
| `DB_SSL` / `DB_SSL_CA`                                     | `false` / —         | DB SSL 및 CA 인증서                                     |
| `ALLOWED_ADMIN_IPS`                                        | (미설정=전체 허용)  | 관리자 API 허용 IP(쉼표 구분)                           |
| `CORS_ORIGINS`                                             | —                   | CORS 허용 오리진(쉼표 구분)                             |
| `CORS_ALLOW_ALL` / `CORS_IP_PATTERN`                       | `false` / —         | 전체 허용 / 오리진 추가 허용 정규식(인트라넷 배포용)    |
| `SECURITY_LOG_RETENTION_DAYS` / `ERROR_LOG_RETENTION_DAYS` | `90` / `30`         | 로그 보존 기간(일)                                      |

---

## 데이터베이스

기본값은 **SQLite**입니다. 다른 DB로 전환하려면 [DATABASE.md](./DATABASE.md)를 참고하세요. 모든 드라이버는 `optionalDependencies`로 포함되어 `npm install`에 함께 설치됩니다.

테이블 스키마는 서버 첫 실행 시 Sequelize `sync`로 자동 생성됩니다. 이미 만들어진 테이블에는
부팅 시 누락된 컬럼을 보강하고(모든 드라이버), 값이 늘어나는 ENUM 컬럼(알림 종류·테마)은
문자열로, 파일 크기 컬럼(첨부 이력·임시 공유)은 `BIGINT` 로 넓힙니다. 그 밖의 타입·제약
변경은 자동으로 따라가지 않습니다([구조 문서](./ARCHITECTURE.md) 참고).

### 파일 업로드 한도

1개당 최대 **3072MB(3GB)** 까지 관리자 → 사이트 설정에서 정합니다. 이 값만 올려서는
안 되고 **웹서버도 함께 열려 있어야** 합니다 — `nginx.conf`·`nginx.docker.conf` 의
`client_max_body_size` 가 더 작으면 Express 에 닿기도 전에 nginx 가 413 으로 끊습니다.
두 값이 어긋나지 않는지는 `server/src/__tests__/uploadSizeCeiling.test.ts` 가 확인합니다.

천장 자체를 올리려면 `server/src/config/constants.ts` 의 `MAX_FILE_SIZE_MB_CEILING` 과
nginx 설정 두 곳을 함께 고칩니다. 함께 맞춰야 하는 것들은 그 상수의 주석에 적혀 있습니다.

JSON·폼 본문은 파일과 따로 100MB 로 묶여 있습니다. 올린 파일은 디스크로 흘려 쓰지만
JSON 본문은 통째로 메모리에 담기므로, 파일 한도를 따라 올리면 요청 하나로 프로세스가
넘어갈 수 있습니다.
