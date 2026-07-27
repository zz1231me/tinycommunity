// server/src/config/env.ts
// 다중 데이터베이스 지원을 위한 환경변수 검증 및 타입 안전성 보장

// 지원되는 데이터베이스 타입
export type DatabaseType = 'sqlite' | 'mysql' | 'mariadb' | 'postgresql' | 'postgres';

import path from 'path';

const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PORT'];

// DB 타입에 따라 필수 환경변수 정의
const dbRequiredVars = {
  sqlite: [], // SQLite는 파일 기반이라 추가 환경변수 불필요
  mysql: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  mariadb: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  postgresql: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  postgres: ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
};

// 지원되는 DB 타입인지 확인
function isValidDatabaseType(type: string): type is DatabaseType {
  return ['sqlite', 'mysql', 'mariadb', 'postgresql', 'postgres'].includes(type);
}

// DB 타입별 기본 포트 반환 (env 객체 정의 전에 선언)
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

  // DB 타입 유효성 검사
  if (!isValidDatabaseType(dbTypeRaw)) {
    throw new Error(
      `❌ 지원하지 않는 데이터베이스 타입: ${dbTypeRaw}\n` +
        `지원되는 타입: sqlite, mysql, mariadb, postgresql, postgres`
    );
  }

  // 기본 필수 환경변수 체크
  const missing: string[] = requiredEnvVars.filter(key => !process.env[key]);

  // DB 타입별 필수 환경변수 체크 (SQLite 제외)
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

  // ✅ 프로덕션에서는 시크릿이 .env.sample의 플레이스홀더/약한 값으로 배포되는 것을 차단 (fail-loud).
  //    개발 환경은 플레이스홀더 그대로 동작하도록 허용.
  if (process.env.NODE_ENV === 'production') {
    const problems: string[] = [];
    const jwt = process.env.JWT_SECRET ?? '';
    const refresh = process.env.JWT_REFRESH_SECRET ?? '';
    // 알려진 플레이스홀더 패턴 (대소문자 무시)
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

  // validateEnv()는 logger 초기화 전에 호출되므로 console.log 사용 (의도적)
  if (process.env.NODE_ENV !== 'production') {
    process.stdout.write(`✅ 환경변수 검증 완료 (DB: ${dbTypeRaw})\n`);
  }
}

// 타입 안전한 환경변수 접근
export const env = {
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,

  // 데이터베이스 설정
  DB_TYPE: (process.env.DB_TYPE || 'sqlite') as DatabaseType,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT) || getDefaultPort(process.env.DB_TYPE || 'sqlite'),
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || '',
  DB_STORAGE: process.env.DB_STORAGE
    ? path.resolve(process.env.DB_STORAGE)
    : path.resolve(process.cwd(), 'database.sqlite'),

  // SSL 설정 (PostgreSQL 등에서 사용)
  DB_SSL: process.env.DB_SSL === 'true',
  DB_SSL_CA: process.env.DB_SSL_CA || '',

  // 서버 설정
  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // 관리자 기본 비밀번호
  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe_2024!',

  // 로그 보존 기간 (일)
  SECURITY_LOG_RETENTION_DAYS: parseInt(process.env.SECURITY_LOG_RETENTION_DAYS || '90'),
  ERROR_LOG_RETENTION_DAYS: parseInt(process.env.ERROR_LOG_RETENTION_DAYS || '30'),
} as const;

// 환경변수 정보 출력 (디버깅용) - logger 초기화 이후에 호출해야 함
export function printDatabaseInfo(): void {
  if (process.env.NODE_ENV === 'production') return;
  // logger를 동적으로 import하여 순환 의존성 방지
  const { logger } = require('../utils/logger');
  logger.info(
    `🗄️ 데이터베이스 설정: 타입=${env.DB_TYPE}` +
      (env.DB_TYPE === 'sqlite'
        ? `, 파일=${env.DB_STORAGE}`
        : `, 호스트=${env.DB_HOST}:${env.DB_PORT}, DB=${env.DB_NAME}, 사용자=${env.DB_USER}`)
  );
}
