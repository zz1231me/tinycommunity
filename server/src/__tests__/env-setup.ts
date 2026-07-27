// 테스트 환경변수 설정 - 모든 모듈 로드 전에 실행됨 (jest setupFiles)
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-at-least-32-characters-long';
process.env.PORT = '4001';
process.env.ADMIN_DEFAULT_PASSWORD = 'TestAdmin123!';
