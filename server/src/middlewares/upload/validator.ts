import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { MAGIC_NUMBERS } from './config';
import { logInfo, logError } from '../../utils/logger';
import { sendError } from '../../utils/response';

/** 파일 내용 검증(magic number). 인라인 서빙되는 image/* 에만 적용한다. */
async function validateFileContent(filePath: string, mimetype: string): Promise<boolean> {
  try {
    // 첨부는 attachment 로만 내려가고 실행 권한도 제거되므로 내용 검증을 하지 않는다
    if (!mimetype.startsWith('image/')) {
      return true;
    }

    const expectedHeaders = MAGIC_NUMBERS[mimetype];
    // magic 정의가 없는 이미지 MIME 은 통과
    if (expectedHeaders === undefined || expectedHeaders.length === 0) {
      return true;
    }

    const fd = await fs.open(filePath, 'r');
    const buf = Buffer.alloc(16);
    await fd.read(buf, 0, 16, 0);
    await fd.close();

    // WebP 는 RIFF(0-3) + WEBP(8-11) 을 모두 봐야 한다. AVI 도 RIFF 로 시작한다.
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
 * 업로드 후 파일 처리 미들웨어 (팩토리).
 * 실행 권한 제거(chmod 644)는 옵션과 무관하게 항상 수행한다.
 *
 * @param options.validateContent magic number 검증 여부. 기본 true. 첨부 전용 경로는 false.
 */
export function validateUploadedFile(options: { validateContent?: boolean } = {}) {
  const shouldValidateContent = options.validateContent !== false;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files: Express.Multer.File[] = [];

      if (req.file) {
        files.push(req.file);
      }

      if (req.files) {
        if (Array.isArray(req.files)) {
          files.push(...req.files);
        } else {
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

        if (shouldValidateContent) {
          const isValidContent = await validateFileContent(filePath, file.mimetype);
          if (!isValidContent) {
            // 실패한 파일과 이미 저장된 나머지 파일을 모두 정리한다
            await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
            sendError(res, 400, `파일 내용이 올바르지 않습니다: ${file.originalname}`);
            return;
          }
        }

        // 실행 권한 제거(644). 윈도우는 chmod 동작이 달라 POSIX 에서만 한다.
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
