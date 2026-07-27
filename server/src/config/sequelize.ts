// ============================================================================
// server/src/config/sequelize.ts
// Sequelize 6.37 최적화 설정 - TypeScript 5.8 호환
//
// ✅ Express 5.1 + Sequelize 6.37 + TypeScript 5.8 최적화
// ✅ 다중 DB 지원 (SQLite/MySQL/PostgreSQL)
// ✅ 연결 풀 최적화
// ✅ 트랜잭션 격리 수준 설정
// ✅ 쿼리 성능 최적화
// ============================================================================

import { Sequelize, Dialect, Transaction, Options as SequelizeOptions } from 'sequelize';
import { env, DatabaseType, printDatabaseInfo } from './env';
import { logInfo, logError, logWarning, logSuccess } from '../utils/logger';

// ============================================================================
// DB 타입을 Sequelize Dialect로 변환
// ============================================================================
function getSequelizeDialect(dbType: DatabaseType): Dialect {
  const dialectMap: Record<DatabaseType, Dialect> = {
    mysql: 'mysql',
    mariadb: 'mysql',
    postgresql: 'postgres',
    postgres: 'postgres',
    sqlite: 'sqlite',
  };

  return dialectMap[dbType] ?? 'sqlite';
}

// ============================================================================
// ✅ Sequelize 6.37 최적화 설정
// ============================================================================
function createSequelizeConfig(): SequelizeOptions {
  const dialect = getSequelizeDialect(env.DB_TYPE);

  // 공통 설정
  const commonConfig: Partial<SequelizeOptions> = {
    dialect,
    logging: env.NODE_ENV === 'development' ? (msg: string) => logInfo(msg) : false,

    // ✅ 테이블 설정 최적화
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false,
      paranoid: false,
      // ✅ 인덱스 자동 생성
      indexes: [],
    },

    // ✅ 쿼리 성능 최적화
    benchmark: env.NODE_ENV === 'development',
    logQueryParameters: env.NODE_ENV === 'development',

    // ✅ 재시도 설정
    retry: {
      max: 3,
      match: [
        /SQLITE_BUSY/,
        /ETIMEDOUT/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
    },
  };

  // ============================================================================
  // SQLite 최적화 설정
  // ============================================================================
  if (dialect === 'sqlite') {
    return {
      ...commonConfig,
      storage: env.DB_STORAGE,

      // ⚠️ SQLite는 타임존을 지원하지 않음 (UTC 고정)
      // timezone: '+09:00', // ❌ 제거

      // ✅ SQLite 연결 풀 최적화 (단일 연결)
      pool: {
        max: 1,
        min: 1,
        acquire: 60000,
        idle: 10000,
        evict: 10000,
      },

      // ✅ SQLite 전용 설정
      dialectOptions: {
        // 외래 키 활성화
        foreignKeys: true,
        // 바쁜 타임아웃 (5초)
        busyTimeout: 5000,
      },

      // ✅ 연결마다 PRAGMA foreign_keys=ON 재적용
      //    SQLite의 foreign_keys는 연결 단위 설정이라, 풀 연결이 재생성되면 OFF로 돌아가
      //    FK cascade(게시글 삭제 시 자식 정리 등)가 조용히 멈출 수 있음 → afterConnect에서 보장
      hooks: {
        afterConnect: async (connection: {
          run?: (sql: string, cb: (err: Error | null) => void) => void;
        }) => {
          if (typeof connection.run === 'function') {
            await new Promise<void>((resolve, reject) => {
              connection.run!('PRAGMA foreign_keys = ON', (err: Error | null) =>
                err ? reject(err) : resolve()
              );
            });
          }
        },
      },

      // ✅ SQLite 쿼리 최적화
      transactionType: Transaction.TYPES.IMMEDIATE,
    };
  }

  // ============================================================================
  // MySQL/MariaDB/PostgreSQL 최적화 설정
  // ============================================================================
  return {
    ...commonConfig,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    host: env.DB_HOST,
    port: env.DB_PORT,

    // ✅ 타임존 설정 (MySQL/PostgreSQL만 지원)
    timezone: '+09:00',

    // ✅ 연결 풀 최적화 (프로덕션 환경)
    pool: {
      max: env.NODE_ENV === 'production' ? 20 : 10,
      min: env.NODE_ENV === 'production' ? 5 : 2,
      acquire: 60000, // 60초
      idle: 30000, // 30초
      evict: 10000, // 10초마다 유휴 연결 확인
    },

    // ✅ DB별 최적화 설정
    dialectOptions:
      dialect === 'postgres'
        ? {
            // PostgreSQL 설정
            ssl: env.DB_SSL
              ? {
                  require: true,
                  rejectUnauthorized: env.NODE_ENV === 'production',
                  ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA }),
                }
              : false,
            // 타임아웃 설정
            statement_timeout: 30000,
            query_timeout: 30000,
            // 연결 타임아웃
            connectionTimeoutMillis: 5000,
            idle_in_transaction_session_timeout: 10000,
          }
        : {
            // MySQL/MariaDB 설정
            connectTimeout: 10000,
            // SSL 설정
            ...(env.DB_SSL && {
              ssl: {
                rejectUnauthorized: env.NODE_ENV === 'production',
                ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA }),
              },
            }),
          },

    // ✅ 트랜잭션 격리 수준 설정
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,

    // ✅ 자동 재연결
    retry: {
      max: 5,
      match: [
        /ETIMEDOUT/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /EHOSTUNREACH/,
        /EAI_AGAIN/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
    },
  };
}

// ============================================================================
// Sequelize 인스턴스 생성
// ============================================================================
export const sequelize = new Sequelize(createSequelizeConfig());

// ============================================================================
// 데이터베이스 연결 테스트
// ============================================================================
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    logInfo('데이터베이스 연결 테스트 중...');
    printDatabaseInfo();

    await sequelize.authenticate();
    logSuccess(`${env.DB_TYPE.toUpperCase()} 데이터베이스 연결 성공`);

    // ✅ 연결 풀 상태 확인
    if (env.NODE_ENV === 'development') {
      const pool = (sequelize.connectionManager as any).pool;
      if (pool) {
        logInfo('연결 풀 상태', {
          size: pool.size,
          available: pool.available,
          using: pool.using,
          waiting: pool.waiting,
        });
      }
    }

    return true;
  } catch (error) {
    logError(`${env.DB_TYPE.toUpperCase()} 데이터베이스 연결 실패`, error);
    return false;
  }
}

// ============================================================================
// ✅ 데이터베이스 초기화 (최적화 포함)
// ============================================================================
export async function initializeDatabase(): Promise<void> {
  const isConnected = await testDatabaseConnection();

  if (!isConnected) {
    throw new Error('데이터베이스 연결에 실패했습니다.');
  }

  // ============================================================================
  // SQLite 최적화
  // ============================================================================
  if (env.DB_TYPE === 'sqlite') {
    try {
      // ✅ 외래 키 활성화
      await sequelize.query('PRAGMA foreign_keys = ON');

      // ✅ WAL 모드 (Write-Ahead Logging) - 동시성 향상
      await sequelize.query('PRAGMA journal_mode = WAL');

      // ✅ 동기화 모드 최적화 (안전성 유지하면서 성능 향상)
      await sequelize.query('PRAGMA synchronous = NORMAL');

      // ✅ 캐시 크기 최적화 (10MB)
      await sequelize.query('PRAGMA cache_size = -10000');

      // ✅ 임시 저장소를 메모리로 설정
      await sequelize.query('PRAGMA temp_store = MEMORY');

      // ✅ 메모리 매핑 I/O (32MB)
      await sequelize.query('PRAGMA mmap_size = 33554432');

      // ✅ 자동 VACUUM 설정
      await sequelize.query('PRAGMA auto_vacuum = INCREMENTAL');

      logSuccess('SQLite 최적화 설정 완료');
      logInfo('SQLite는 UTC 타임존을 사용합니다 (타임존 설정 불가)');
    } catch (_error) {
      logWarning('SQLite 최적화 실패');
    }
  }

  // ============================================================================
  // PostgreSQL 최적화
  // ============================================================================
  if (env.DB_TYPE === 'postgresql' || env.DB_TYPE === 'postgres') {
    try {
      // ✅ 쿼리 플래너 최적화
      await sequelize.query('SET work_mem = "16MB"');
      await sequelize.query('SET maintenance_work_mem = "64MB"');

      logSuccess('PostgreSQL 최적화 설정 완료');
      logInfo('PostgreSQL 타임존: +09:00 (한국 시간)');
    } catch (_error) {
      logWarning('PostgreSQL 최적화 실패');
    }
  }

  // ============================================================================
  // MySQL/MariaDB 최적화
  // ============================================================================
  if (env.DB_TYPE === 'mysql' || env.DB_TYPE === 'mariadb') {
    logSuccess('MySQL/MariaDB 최적화 설정 완료');
    logInfo('MySQL 타임존: +09:00 (한국 시간)');
  }

  logSuccess('데이터베이스 초기화 완료');
}

// ============================================================================
// ✅ 연결 종료 함수 (Graceful Shutdown)
// ============================================================================
export async function closeDatabaseConnection(): Promise<void> {
  try {
    // ✅ 모든 연결 종료 대기
    await sequelize.close();

    logSuccess('데이터베이스 연결 종료');
  } catch (error) {
    logError('데이터베이스 연결 종료 실패', error);
    throw error;
  }
}

// ============================================================================
// ✅ 헬스 체크 함수 (모니터링용)
// ============================================================================
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  details: Record<string, any>;
}> {
  try {
    await sequelize.authenticate();

    const pool = (sequelize.connectionManager as any).pool;

    return {
      status: 'healthy',
      details: {
        type: env.DB_TYPE,
        connected: true,
        timezone: env.DB_TYPE === 'sqlite' ? 'UTC (SQLite 고정)' : '+09:00 (한국)',
        pool: pool
          ? {
              size: pool.size,
              available: pool.available,
              using: pool.using,
              waiting: pool.waiting,
            }
          : null,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        type: env.DB_TYPE,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// ✅ 트랜잭션 헬퍼 함수
// ============================================================================
export async function withTransaction<T>(
  callback: (transaction: Transaction) => Promise<T>
): Promise<T> {
  const transaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });

  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
