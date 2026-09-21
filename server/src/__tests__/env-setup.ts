// 테스트 환경변수 설정. 모든 모듈 로드 전에 실행된다(jest setupFiles).
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
// 테스트 DB 는 OS 임시 폴더의 파일로 둔다.
// ':memory:' 는 커넥션이 하나뿐이라 동시 트랜잭션이 곧바로 SQLITE_BUSY 로 떨어진다.
process.env.DB_STORAGE = require('path').join(
  require('os').tmpdir(),
  `tinycommunity-test-${process.pid}.sqlite`
);
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-at-least-32-characters-long';
process.env.PORT = '4001';
process.env.ADMIN_DEFAULT_PASSWORD = 'TestAdmin123!';
