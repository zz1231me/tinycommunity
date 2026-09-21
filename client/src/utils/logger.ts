// 개발 환경에서만 출력하는 로거. 경고와 에러는 모든 환경에서 출력한다.

const isDev = import.meta.env.DEV;

class Logger {
  private prefix: string;

  constructor(prefix: string = 'TinyCommunity') {
    this.prefix = prefix;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] ${message}`, ...args);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] ℹ️ ${message}`, ...args);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  success(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] ✅ ${message}`, ...args);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.prefix}] ⚠️ ${message}`, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, ...args: any[]): void {
    console.error(`[${this.prefix}] ❌ ${message}`, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, ...args: any[]): void {
    if (isDev) {
      console.info(`[${this.prefix}] 🐛 ${message}`, ...args);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api(method: string, url: string, data?: any): void {
    if (isDev) {
      console.info(`[${this.prefix}] 📤 API ${method}`, url, data ? data : '');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiResponse(method: string, url: string, status: number, data?: any): void {
    if (isDev) {
      const emoji = status >= 200 && status < 300 ? '✅' : '❌';
      console.info(`[${this.prefix}] ${emoji} API ${method} ${url} - ${status}`, data ? data : '');
    }
  }

  time(label: string): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.time(`[${this.prefix}] ⏱️ ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.timeEnd(`[${this.prefix}] ⏱️ ${label}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table(data: any): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.table(data);
    }
  }

  group(label: string): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.group(`[${this.prefix}] 📁 ${label}`);
    }
  }

  groupEnd(): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  }
}

export const logger = new Logger();

export const createLogger = (prefix: string): Logger => new Logger(prefix);

export const authLogger = createLogger('인증');
export const boardLogger = createLogger('게시판');
export const fileLogger = createLogger('파일');
