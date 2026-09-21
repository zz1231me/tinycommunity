// 테스트 환경변수 설정. 모든 모듈 로드 전에 실행된다(jest setupFiles).
// 타임존을 운영과 같게 못박는다. UTC 에서 돌리면 '한국 시간 09시 이전' 경계가 사라져
// 날짜 칸을 UTC 로 나누는 버그가 테스트를 그대로 통과한다(CI 는 UTC 다).
process.env.TZ = 'Asia/Seoul';
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
