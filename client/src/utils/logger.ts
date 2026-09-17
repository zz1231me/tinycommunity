// client/src/utils/logger.ts
/**
 * 환경에 따라 조건부로 로그를 출력하는 로거 유틸리티
 * 프로덕션 환경에서는 일반 로그가 출력되지 않음 (에러/경고만 출력)
 */

const isDev = import.meta.env.DEV;

/**
 * Logger 클래스
 */
class Logger {
  private prefix: string;

  constructor(prefix: string = 'TinyCommunity') {
    this.prefix = prefix;
  }

  /**
   * 일반 로그 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] ${message}`, ...args);
    }
  }

  /**
   * 정보 로그 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] ℹ️ ${message}`, ...args);
    }
  }

  /**
   * 성공 로그 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  success(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] ✅ ${message}`, ...args);
    }
  }

  /**
   * 경고 로그 (모든 환경)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.prefix}] ⚠️ ${message}`, ...args);
  }

  /**
   * 에러 로그 (모든 환경)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, ...args: any[]): void {
    console.error(`[${this.prefix}] ❌ ${message}`, ...args);
  }

  /**
   * 디버그 로그 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] 🐛 ${message}`, ...args);
    }
  }

  /**
   * API 요청 로그 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api(method: string, url: string, data?: any): void {
    if (isDev) {
      console.info(`[${this.prefix}] 📤 API ${method}`, url, data ? data : '');
    }
  }

  /**
   * API 응답 로그 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiResponse(method: string, url: string, status: number, data?: any): void {
    if (isDev) {
      const emoji = status >= 200 && status < 300 ? '✅' : '❌';
      console.info(`[${this.prefix}] ${emoji} API ${method} ${url} - ${status}`, data ? data : '');
    }
  }

  /**
   * 타이머 시작 (개발 환경에서만)
   */
  time(label: string): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.time(`[${this.prefix}] ⏱️ ${label}`);
    }
  }

  /**
   * 타이머 종료 (개발 환경에서만)
   */
  timeEnd(label: string): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.timeEnd(`[${this.prefix}] ⏱️ ${label}`);
    }
  }

  /**
   * 테이블 형태로 출력 (개발 환경에서만)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table(data: any): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.table(data);
    }
  }

  /**
   * 그룹 시작 (개발 환경에서만)
   */
  group(label: string): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.group(`[${this.prefix}] 📁 ${label}`);
    }
  }

  /**
   * 그룹 종료 (개발 환경에서만)
   */
  groupEnd(): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  }
}

// 싱글톤 인스턴스
export const logger = new Logger();

// 특정 기능별 로거 생성 함수
export const createLogger = (prefix: string): Logger => new Logger(prefix);

// 편의 로거들 (즉시 사용 가능)
export const authLogger = createLogger('인증');
export const boardLogger = createLogger('게시판');
export const fileLogger = createLogger('파일');

// 기본 내보내기
