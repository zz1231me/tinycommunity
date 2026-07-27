// server/src/middlewares/upload/validator.ts
import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { MAGIC_NUMBERS } from './config';
import { logInfo, logError } from '../../utils/logger';
import { sendError } from '../../utils/response';

/**
 * 파일 내용 검증 (Magic Number 체크) — 인라인 서빙되는 이미지(image/*)에만 적용.
 * 그 외 타입(문서/압축/미디어/DRM 등 첨부)은 검증 없이 통과한다(아래 참조).
 */
async function validateFileContent(filePath: string, mimetype: string): Promise<boolean> {
  try {
    // ✅ 인라인 서빙되는 이미지(image/*)만 magic number로 내용 검증한다.
    //    첨부(문서/압축/미디어/DRM 등)는 정적 서빙 없이 attachment로만 다운로드되고 실행권한도
    //    제거되므로 내용 검증이 불필요하며, DRM 보호 문서처럼 시그니처가 표준과 다른 정상 파일이
    //    거부되던 문제를 막는다. (인라인 이미지도 nosniff + 확장자 floor/화이트리스트로 XSS가
    //    차단되지만, 깨진 이미지 조기 거부 + 방어심화 차원에서 magic 검증을 유지)
    if (!mimetype.startsWith('image/')) {
      return true;
    }

    const expectedHeaders = MAGIC_NUMBERS[mimetype];
    // magic 정의가 없는 이미지 MIME(예: image/svg+xml — floor에서 이미 차단)은 통과
    if (expectedHeaders === undefined || expectedHeaders.length === 0) {
      return true;
    }

    const fd = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(16);
    await fd.read(buf, 0, 16, 0);
    await fd.close();

    // WebP: RIFF(0-3) + WEBP(8-11) 모두 확인 — AVI도 RIFF 시작이라 구분 필요
    if (mimetype === 'image/webp') {
      const isRiff = buf.slice(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46]));
      const isWebp = buf.slice(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]));
      return isRiff && isWebp;
    }

    return expectedHeaders.some(expected => buf.slice(0, expected.length).equals(expected));
  } catch (error) {
    logError('파일 내용 검증 실패', error);
    return false;
  }
}

/**
 * 업로드 후 파일 처리 미들웨어 (팩토리)
 *
 * @param options.validateContent 내용(magic number) 검증 여부. 기본 true.
 *   - 인라인 서빙 경로(에디터 이미지)는 기본값(검증)으로 사용 — 실제 이미지인지 확인.
 *   - 첨부(다운로드 전용) 경로는 `{ validateContent: false }`로 검증 생략 —
 *     DRM 문서/비표준 시그니처 등 정상 파일이 거부되던 문제 방지.
 *   실행 권한 제거(chmod 644)는 경로와 무관하게 항상 수행한다.
 */
export function validateUploadedFile(options: { validateContent?: boolean } = {}) {
  const shouldValidateContent = options.validateContent !== false;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files: Express.Multer.File[] = [];

      // 단일 파일
      if (req.file) {
        files.push(req.file);
      }

      // 다중 파일
      if (req.files) {
        if (Array.isArray(req.files)) {
          files.push(...req.files);
        } else {
          // 객체 형태인 경우 (fields)
          Object.values(req.files).forEach(fileList => {
            files.push(...fileList);
          });
        }
      }

      if (files.length === 0) {
        return next();
      }

      for (const file of files) {
        const filePath = file.path;

        // 파일 내용 검증 (인라인 서빙 경로에서만 — 첨부는 다운로드 전용이라 생략)
        if (shouldValidateContent) {
          const isValidContent = await validateFileContent(filePath, file.mimetype);
          if (!isValidContent) {
            // 실패한 파일 + 이미 저장된 나머지 파일 모두 정리 (고아 파일 방지)
            await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
            sendError(res, 400, `파일 내용이 올바르지 않습니다: ${file.originalname}`);
            return;
          }
        }

        // ✅ 권한 설정: 실행 권한 제거 (644: rw-r--r--) — 경로 무관 항상 수행
        // 윈도우에서는 chmod가 다르게 동작하므로 POSIX 환경에서만 실행
        if (process.platform !== 'win32') {
          await fs.chmod(filePath, 0o644);
        }
      }

      logInfo('업로드 파일 처리 완료', { count: files.length });
      next();
    } catch (error) {
      logError('파일 검증 실패', error);
      sendError(res, 500, '파일 검증 중 오류가 발생했습니다.');
    }
  };
}
