import { RequestHandler } from 'express';
import multer from 'multer';

/**
 * multer 인스턴스를 매 요청마다 현재 것으로 위임하는 래퍼.
 * 라우트 정의 시점에 array() 를 바로 넘기면 그때의 인스턴스에 묶여 설정 변경이 반영되지 않는다.
 */
const DELEGATED_FACTORIES = new Set(['array', 'single', 'fields', 'any', 'none']);

export function createDynamicUploader(getInstance: () => multer.Multer): multer.Multer {
  return new Proxy({} as multer.Multer, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'string' && DELEGATED_FACTORIES.has(prop)) {
        // uploadFiles.array('files') 를 요청마다 현재 인스턴스로 위임한다
        return (...args: unknown[]): RequestHandler => {
          return (req, res, next) => {
            const instance = getInstance() as unknown as Record<
              string,
              (...a: unknown[]) => RequestHandler
            >;
            return instance[prop](...args)(req, res, next);
          };
        };
      }
      const instance = getInstance() as unknown as Record<string | symbol, unknown>;
      const val = instance[prop];
      return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(instance) : val;
    },
  });
}
