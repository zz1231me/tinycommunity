import multer from 'multer';
import crypto from 'crypto';
import { Request } from 'express';
import { UPLOAD_DIRS, BLOCKED_EXTENSIONS, getDynamicSizeLimits } from './config';
import { validateFilename, blockedExtOf } from './utils';
import { createDynamicUploader } from './dynamicUploader';
import { logInfo, logError } from '../../utils/logger';
import { getSettings } from '../../utils/settingsCache';
import { AppError } from '../error.middleware';

/** 일반 파일 업로드 Storage 설정 */
const fileStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIRS.FILES);
  },
  filename: function (_req, file, cb) {
    try {
      // 원본 확장자를 제거하고 랜덤 ID 만 쓴다(실행 방지)
      const timestamp = Date.now();
      const randomBytes = crypto.randomBytes(8).toString('hex');
      const secureFilename = `${timestamp}_${randomBytes}`; // 확장자 없음!

      logInfo('파일 저장 (확장자 제거)', { original: file.originalname, secure: secureFilename });

      cb(null, secureFilename);
    } catch (error) {
      logError('파일명 생성 오류', error);
      cb(new Error('파일 저장 중 오류가 발생했습니다.'), '');
    }
  },
});

/** 파일 필터. 절대차단 확장자만 검사한다(화이트리스트 없음). */
function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  try {
    // 파일명 검증(경로 조작 등). 사용자 입력 오류이므로 AppError(400) 로 전달한다.
    if (!validateFilename(file.originalname)) {
      return cb(new AppError(400, '허용되지 않는 파일명입니다.'));
    }

    // 절대 차단 확장자(DB 설정으로 변경 불가). 화이트리스트는 두지 않는다.
    const blockedExt = blockedExtOf(file.originalname);
    if (BLOCKED_EXTENSIONS.includes(blockedExt)) {
      return cb(new AppError(400, `보안상 위험한 파일 형식입니다: ${blockedExt}`));
    }

    logInfo('파일 업로드 허용', { originalname: file.originalname });
    cb(null, true);
  } catch (error) {
    logError('파일 필터 오류', error);
    cb(new Error('파일 검증 중 오류가 발생했습니다.'));
  }
}

/** 파일 업로드 Multer 인스턴스 빌더. fileSize·files 는 호출 시점의 settingsCache 값을 쓴다. */
function buildFileUploader(): multer.Multer {
  const limits = getDynamicSizeLimits();
  const maxFileCount = getSettings().maxFileCount;
  return multer({
    storage: fileStorage,
    fileFilter,
    limits: {
      fileSize: limits.DOCUMENT,
      files: maxFileCount,
      fields: 10,
      fieldNameSize: 100,
      fieldSize: 2 * 1024 * 1024, // 2MB
      headerPairs: 20,
    },
  });
}

let _fileUploader: multer.Multer = buildFileUploader();

export function refreshFileUploader(): void {
  _fileUploader = buildFileUploader();
}

/** 파일 업로드 multer 인스턴스. 요청마다 최신 _fileUploader 에 위임한다. */
export const uploadFiles: multer.Multer = createDynamicUploader(() => _fileUploader);
