// 테스트 환경변수 설정 - 모든 모듈 로드 전에 실행됨 (jest setupFiles)
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
// 테스트 DB 는 OS 임시 폴더에 둔다.
//
// ':memory:' 로 두면 커넥션이 하나뿐이라 동시 트랜잭션이 큐잉되지 않고 곧바로
// SQLITE_BUSY 로 떨어진다. 운영(파일 DB + WAL + busy_timeout)과 조건이 달라
// 동시성 테스트가 검증하려는 상황을 재현하지 못한다.
//
// 임시 폴더의 파일 DB 로 두면 운영과 같은 조건으로 돌면서 저장소도 더럽히지 않는다.
process.env.DB_STORAGE = require('path').join(
  require('os').tmpdir(),
  `tinycommunity-test-${process.pid}.sqlite`
);
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-at-least-32-characters-long';
process.env.PORT = '4001';
process.env.ADMIN_DEFAULT_PASSWORD = 'TestAdmin123!';
