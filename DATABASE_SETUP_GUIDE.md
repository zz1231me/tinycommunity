# 데이터베이스 설정 가이드

TinyCommunity는 **SQLite**(기본), **MySQL**, **MariaDB**, **PostgreSQL**을 지원합니다. 데이터베이스는 `server/.env`의 환경변수로 전환합니다.

모든 드라이버(`sqlite3`, `mysql2`, `mariadb`, `pg`)는 `optionalDependencies`로 포함되어 있어 `npm install` 시 함께 설치됩니다. **별도 설치가 필요 없습니다.** (Windows에서 `sqlite3` 네이티브 빌드가 실패하면 MySQL/PostgreSQL을 사용하거나 빌드 도구를 설치하세요.)

---

## 빠른 시작 (SQLite)

SQLite는 별도 설치 없이 바로 사용할 수 있어 개발·테스트에 적합합니다.

```bash
cp server/.env.sample server/.env   # 기본값이 SQLite
cd server
npm install
npm run dev
```

`server/.env`의 기본 DB 설정:

```env
DB_TYPE=sqlite
DB_STORAGE=./database.sqlite
```

> 테이블과 기본 데이터(admin 계정·역할·사이트 설정)는 첫 실행 시 자동 생성됩니다.

---

## 환경변수

`server/.env.sample`을 `server/.env`로 복사해 사용합니다.

```env
# 보안 (반드시 변경)
JWT_SECRET=최소-32자-랜덤-문자열
JWT_REFRESH_SECRET=JWT_SECRET과-다른-32자-랜덤-문자열

# 서버
PORT=4000
NODE_ENV=development

# 데이터베이스
DB_TYPE=sqlite            # sqlite | mysql | mariadb | postgresql
DB_STORAGE=./database.sqlite   # SQLite 전용
# 非 SQLite:
# DB_HOST=localhost
# DB_PORT=3306            # PostgreSQL은 5432
# DB_NAME=tinycommunity
# DB_USER=tinycommunity
# DB_PASSWORD=...
```

---

## MySQL / MariaDB

MySQL과 MariaDB는 동일한 명령을 사용합니다.

**설치**

```bash
# Ubuntu/Debian
sudo apt install mysql-server        # 또는 mariadb-server
# macOS
brew install mysql                   # 또는 mariadb
```

**데이터베이스 생성**

```sql
CREATE DATABASE tinycommunity CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tinycommunity'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON tinycommunity.* TO 'tinycommunity'@'localhost';
FLUSH PRIVILEGES;
```

**환경변수** (`DB_TYPE=mysql` 또는 `mariadb`)

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=tinycommunity
DB_USER=tinycommunity
DB_PASSWORD=your_secure_password
```

> MySQL 8.0에서 인증 플러그인 오류가 나면:
> `ALTER USER 'tinycommunity'@'localhost' IDENTIFIED WITH mysql_native_password BY '...';`

---

## PostgreSQL

**설치**

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
# macOS
brew install postgresql
```

**데이터베이스 생성**

```sql
CREATE USER tinycommunity WITH ENCRYPTED PASSWORD 'your_secure_password';
CREATE DATABASE tinycommunity OWNER tinycommunity;
GRANT ALL PRIVILEGES ON DATABASE tinycommunity TO tinycommunity;
```

**환경변수**

```env
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tinycommunity
DB_USER=tinycommunity
DB_PASSWORD=your_secure_password
```

---

## 데이터베이스 전환

1. 서버 중지
2. `server/.env`에서 `DB_TYPE`과 접속 정보 변경
3. 서버 재시작

> 전환 시 기존 데이터는 **자동 이전되지 않습니다.** 필요하면 별도로 백업·복원하세요.

---

## 선택 가이드

| DB | 권장 용도 | 동시 사용자(대략) |
|----|-----------|------------------|
| SQLite | 개발·테스트, 소규모 | ~10 |
| MySQL / MariaDB | 중규모 서비스 | ~100 |
| PostgreSQL | 대규모·프로덕션 | ~500 |

---

## 트러블슈팅

- **Unknown database**: 데이터베이스를 먼저 생성했는지 확인 (`CREATE DATABASE tinycommunity ...`).
- **연결 거부**: DB 서비스 실행 여부 확인 (`systemctl status mysql|mariadb|postgresql`).
- **권한 오류**: 위 `GRANT` 구문을 다시 실행.
- **Windows에서 sqlite3 설치 실패**: 네이티브 빌드 문제 — MySQL/PostgreSQL을 사용하거나 Visual Studio 빌드 도구 + Python을 설치.

---

## 참고

- [SQLite](https://sqlite.org/docs.html) · [MySQL](https://dev.mysql.com/doc/) · [MariaDB](https://mariadb.com/kb/en/) · [PostgreSQL](https://www.postgresql.org/docs/) · [Sequelize](https://sequelize.org/)
