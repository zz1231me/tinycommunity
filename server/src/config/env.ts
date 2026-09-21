// 환경변수 검증과 타입 안전한 접근.

export type DatabaseType = 'sqlite' | 'mysql' | 'mariadb' | 'postgresql' | 'postgres';

import path from 'path';

const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PORT'];

const dbRequiredVars = {
  sqlite: [], // SQLite는 파일 기반이라 추가 환경변수 불필요
  mysql: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  mariadb: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  postgresql: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  postgres: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
};

function isValidDatabaseType(type: string): type is DatabaseType {
  return ['sqlite', 'mysql', 'mariadb', 'postgresql', 'postgres'].includes(type);
}

function getDefaultPort(dbType: string): number {
  switch (dbType) {
    case 'mysql':
    case 'mariadb':
      return 3306;
    case 'postgresql':
    case 'postgres':
      return 5432;
    case 'sqlite':
    default:
      return 0; // SQLite는 포트가 필요없음
  }
}

export function validateEnv(): void {
  const dbTypeRaw = process.env.DB_TYPE || 'sqlite';

  if (!isValidDatabaseType(dbTypeRaw)) {
    throw new Error(
      `❌ 지원하지 않는 데이터베이스 타입: ${dbTypeRaw}\n` +
        `지원되는 타입: sqlite, mysql, mariadb, postgresql, postgres`
    );
  }

  const missing: string[] = requiredEnvVars.filter(key => !process.env[key]);

  if (dbTypeRaw !== 'sqlite') {
    const dbMissing = dbRequiredVars[dbTypeRaw].filter(key => !process.env[key]);
    missing.push(...dbMissing);
  }

  if (missing.length > 0) {
    throw new Error(
      `❌ 필수 환경변수 누락 (DB_TYPE=${dbTypeRaw}):\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
        `.env 파일을 확인해주세요.`
    );
  }

  // 프로덕션에서는 플레이스홀더나 약한 시크릿으로 뜨지 않게 막는다. 개발 환경은 허용한다.
  if (process.env.NODE_ENV === 'production') {
    const problems: string[] = [];
    const jwt = process.env.JWT_SECRET ?? '';
    const refresh = process.env.JWT_REFRESH_SECRET ?? '';
    const placeholderRe =
      /change[-_ ]?this|your[-_ ]?super[-_ ]?secret|example|placeholder|changeme/i;

    if (jwt.length < 32) problems.push('JWT_SECRET은 최소 32자 이상이어야 합니다.');
    if (refresh.length < 32) problems.push('JWT_REFRESH_SECRET은 최소 32자 이상이어야 합니다.');
    if (placeholderRe.test(jwt))
      problems.push('JWT_SECRET이 기본 플레이스홀더 값입니다. 실제 시크릿으로 교체하세요.');
    if (placeholderRe.test(refresh))
      problems.push('JWT_REFRESH_SECRET이 기본 플레이스홀더 값입니다. 실제 시크릿으로 교체하세요.');
    if (jwt && refresh && jwt === refresh)
      problems.push('JWT_SECRET과 JWT_REFRESH_SECRET은 서로 다른 값이어야 합니다.');

    const adminPw = process.env.ADMIN_DEFAULT_PASSWORD ?? '';
    if (!adminPw || adminPw.length < 8 || placeholderRe.test(adminPw) || adminPw === 'admin')
      problems.push(
        'ADMIN_DEFAULT_PASSWORD가 설정되지 않았거나 약한 기본값입니다. 8자 이상의 강한 값으로 설정하세요.'
      );

    if (problems.length > 0) {
      throw new Error(
        `❌ 프로덕션 보안 환경변수 검증 실패:\n${problems.map(p => `  - ${p}`).join('\n')}\n\n` +
          `배포 전 .env의 시크릿 값을 반드시 교체해주세요.`
      );
    }
  }

  // logger 초기화 전에 호출되므로 stdout 에 직접 쓴다.
  if (process.env.NODE_ENV !== 'production') {
    process.stdout.write(`✅ 환경변수 검증 완료 (DB: ${dbTypeRaw})\n`);
  }
}

export const env = {
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,

  DB_TYPE: (process.env.DB_TYPE || 'sqlite') as DatabaseType,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT) || getDefaultPort(process.env.DB_TYPE || 'sqlite'),
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || '',
  // ':memory:' 는 경로가 아니라 예약어다. path.resolve 를 태우면 그 이름의 실제 파일이 만들어진다.
  DB_STORAGE:
    process.env.DB_STORAGE === ':memory:'
      ? ':memory:'
      : process.env.DB_STORAGE
        ? path.resolve(process.env.DB_STORAGE)
        : path.resolve(process.cwd(), 'database.sqlite'),

  DB_SSL: process.env.DB_SSL === 'true',
  DB_SSL_CA: process.env.DB_SSL_CA || '',

  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe_2024!',

  // 로그 보존 기간 (일)
  SECURITY_LOG_RETENTION_DAYS: parseInt(process.env.SECURITY_LOG_RETENTION_DAYS || '90'),
  ERROR_LOG_RETENTION_DAYS: parseInt(process.env.ERROR_LOG_RETENTION_DAYS || '30'),
} as const;

// logger 초기화 이후에 호출해야 한다.
export function printDatabaseInfo(): void {
  if (process.env.NODE_ENV === 'production') return;
  // 순환 의존성을 피하려 logger 를 동적으로 불러온다.
  const { logger } = require('../utils/logger');
  logger.info(
    `🗄️ 데이터베이스 설정: 타입=${env.DB_TYPE}` +
      (env.DB_TYPE === 'sqlite'
        ? `, 파일=${env.DB_STORAGE}`
        : `, 호스트=${env.DB_HOST}:${env.DB_PORT}, DB=${env.DB_NAME}, 사용자=${env.DB_USER}`)
  );
}
