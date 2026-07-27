// server/src/middlewares/upload/dynamicUploader.ts
import { RequestHandler } from 'express';
import multer from 'multer';

/**
 * 설정(크기·개수 등)이 바뀌면 재빌드되는 multer 인스턴스를 라우트에 "동적으로" 연결하기 위한 래퍼.
 *
 * ⚠️ 직접 `_uploader.array('files')`를 라우트 정의 시점에 넘기면, 그 미들웨어는 **정의 시점의
 *    인스턴스**에 묶여버린다. 이후 refresh로 인스턴스를 교체해도(관리자 설정 변경·부팅 시 캐시
 *    로드) 라우트는 옛 인스턴스의 한도를 계속 사용한다.
 *
 * 이 래퍼는 array/single/fields/any/none 을 **매 요청마다** 현재 인스턴스로 위임하는 안정적인
 * 미들웨어로 만들어, 라우트 코드는 그대로 두고 설정 변경이 즉시 반영되게 한다.
 */
const DELEGATED_FACTORIES = new Set(['array', 'single', 'fields', 'any', 'none']);

export function createDynamicUploader(getInstance: () => multer.Multer): multer.Multer {
  return new Proxy({} as multer.Multer, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'string' && DELEGATED_FACTORIES.has(prop)) {
        // 예: uploadFiles.array('files') → 요청마다 현재 인스턴스의 array('files')로 위임
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
      return typeof val === 'function'
        ? (val as (...a: unknown[]) => unknown).bind(instance)
        : val;
    },
  });
}
