// Sequelize 연결 설정. SQLite/MySQL/MariaDB/PostgreSQL 을 지원한다.

import { Sequelize, Dialect, Transaction, DataTypes, Options as SequelizeOptions } from 'sequelize';
import { env, DatabaseType, printDatabaseInfo } from './env';
import { logInfo, logError, logWarning, logSuccess } from '../utils/logger';

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

function createSequelizeConfig(): SequelizeOptions {
  const dialect = getSequelizeDialect(env.DB_TYPE);

  const commonConfig: Partial<SequelizeOptions> = {
    dialect,
    logging: env.NODE_ENV === 'development' ? (msg: string) => logInfo(msg) : false,

    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false,
      paranoid: false,
      indexes: [],
    },

    benchmark: env.NODE_ENV === 'development',
    logQueryParameters: env.NODE_ENV === 'development',

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

  if (dialect === 'sqlite') {
    return {
      ...commonConfig,
      storage: env.DB_STORAGE,

      // SQLite 는 타임존을 지원하지 않아 UTC 로 고정되며, 연결은 하나만 쓴다.
      pool: {
        max: 1,
        min: 1,
        acquire: 60000,
        idle: 10000,
        evict: 10000,
      },

      dialectOptions: {
        foreignKeys: true,
        busyTimeout: 5000,
      },

      // PRAGMA 는 연결 단위라 풀 연결이 재생성되면 초기값으로 돌아간다. 연결마다 다시 적용한다.
      hooks: {
        afterConnect: async (connection: {
          run?: (sql: string, cb: (err: Error | null) => void) => void;
        }) => {
          if (typeof connection.run !== 'function') return;
          const run = (sql: string) =>
            new Promise<void>((resolve, reject) => {
              connection.run!(sql, (err: Error | null) => (err ? reject(err) : resolve()));
            });
          await run('PRAGMA foreign_keys = ON');
          await run('PRAGMA busy_timeout = 5000');
        },
      },

      // IMMEDIATE 로 트랜잭션 시작 시점에 쓰기 잠금을 잡는다.
      transactionType: Transaction.TYPES.IMMEDIATE,
    };
  }

  return {
    ...commonConfig,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    host: env.DB_HOST,
    port: env.DB_PORT,

    // 타임존은 MySQL/PostgreSQL 에서만 지원된다.
    timezone: '+09:00',

    pool: {
      max: env.NODE_ENV === 'production' ? 20 : 10,
      min: env.NODE_ENV === 'production' ? 5 : 2,
      acquire: 60000,
      idle: 30000,
      evict: 10000,
    },

    dialectOptions:
      dialect === 'postgres'
        ? {
            ssl: env.DB_SSL
              ? {
                  require: true,
                  rejectUnauthorized: env.NODE_ENV === 'production',
                  ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA }),
                }
              : false,
            statement_timeout: 30000,
            query_timeout: 30000,
            connectionTimeoutMillis: 5000,
            idle_in_transaction_session_timeout: 10000,
          }
        : {
            connectTimeout: 10000,
            ...(env.DB_SSL && {
              ssl: {
                rejectUnauthorized: env.NODE_ENV === 'production',
                ...(env.DB_SSL_CA && { ca: env.DB_SSL_CA }),
              },
            }),
          },

    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,

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

export const sequelize = new Sequelize(createSequelizeConfig());

/**
 * 긴 본문을 담는 열. MySQL 에서는 LONGTEXT 가 필요하지만 SQLite 는 길이 구분이 없어,
 * TEXT('long') 을 그대로 쓰면 부팅할 때마다 경고를 찍는다. 그 경고가 쌓이면 진짜 경고를 가린다.
 */
export const LONG_TEXT = () =>
  sequelize.getDialect() === 'sqlite' ? DataTypes.TEXT : DataTypes.TEXT('long');

/** DB 연결(+09:00)과 프로세스 시간대가 다르면 경고한다. 날짜 경계가 어긋나며, 고칠 자리는 배포의 TZ 설정이다. */
function warnIfTimezoneMismatch(): void {
  if (env.DB_TYPE === 'sqlite') return;
  // getTimezoneOffset 은 부호가 반대다. KST(+09:00)는 -540.
  const processOffsetMinutes = -new Date().getTimezoneOffset();
  if (processOffsetMinutes === 540) return;

  logWarning('DB 연결은 +09:00 인데 서버 프로세스는 다른 시간대입니다.', {
    dbTimezone: '+09:00',
    processOffsetMinutes,
    impact: '출퇴근 날짜와 포인트 하루 한도의 경계가 한국 시간과 어긋납니다.',
    fix: '프로세스에 TZ=Asia/Seoul 을 설정하세요.',
  });
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    logInfo('데이터베이스 연결 테스트 중...');
    printDatabaseInfo();

    await sequelize.authenticate();
    logSuccess(`${env.DB_TYPE.toUpperCase()} 데이터베이스 연결 성공`);
    warnIfTimezoneMismatch();

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

export async function initializeDatabase(): Promise<void> {
  const isConnected = await testDatabaseConnection();

  if (!isConnected) {
    throw new Error('데이터베이스 연결에 실패했습니다.');
  }

  if (env.DB_TYPE === 'sqlite') {
    try {
      await sequelize.query('PRAGMA foreign_keys = ON');

      await sequelize.query('PRAGMA journal_mode = WAL');

      await sequelize.query('PRAGMA synchronous = NORMAL');

      await sequelize.query('PRAGMA cache_size = -10000');

      await sequelize.query('PRAGMA temp_store = MEMORY');

      await sequelize.query('PRAGMA mmap_size = 33554432');

      await sequelize.query('PRAGMA auto_vacuum = INCREMENTAL');

      logSuccess('SQLite 최적화 설정 완료');
      logInfo('SQLite는 UTC 타임존을 사용합니다 (타임존 설정 불가)');
    } catch (_error) {
      logWarning('SQLite 최적화 실패');
    }
  }

  if (env.DB_TYPE === 'postgresql' || env.DB_TYPE === 'postgres') {
    try {
      await sequelize.query('SET work_mem = "16MB"');
      await sequelize.query('SET maintenance_work_mem = "64MB"');

      logSuccess('PostgreSQL 최적화 설정 완료');
      logInfo('PostgreSQL 타임존: +09:00 (한국 시간)');
    } catch (_error) {
      logWarning('PostgreSQL 최적화 실패');
    }
  }

  if (env.DB_TYPE === 'mysql' || env.DB_TYPE === 'mariadb') {
    logSuccess('MySQL/MariaDB 최적화 설정 완료');
    logInfo('MySQL 타임존: +09:00 (한국 시간)');
  }

  logSuccess('데이터베이스 초기화 완료');
}

export async function closeDatabaseConnection(): Promise<void> {
  try {
    await sequelize.close();

    logSuccess('데이터베이스 연결 종료');
  } catch (error) {
    logError('데이터베이스 연결 종료 실패', error);
    throw error;
  }
}

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
