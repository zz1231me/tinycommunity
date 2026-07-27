// server/src/middlewares/upload/file.ts
import multer from 'multer';
import crypto from 'crypto';
import { Request } from 'express';
import { UPLOAD_DIRS, BLOCKED_EXTENSIONS, getDynamicSizeLimits } from './config';
import { validateFilename, blockedExtOf } from './utils';
import { createDynamicUploader } from './dynamicUploader';
import { logInfo, logError } from '../../utils/logger';
import { getSettings } from '../../utils/settingsCache';
import { AppError } from '../error.middleware';

/**
 * 일반 파일 업로드 Storage 설정
 */
const fileStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIRS.FILES);
  },
  filename: function (_req, file, cb) {
    try {
      // ✅ 확장자 변경: 원본 확장자를 제거하고 순수 랜덤 ID만 사용 (실행 방지)
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

/**
 * 파일 필터 함수 — 절대차단 확장자만 검사(화이트리스트 없음), 크기는 settingsCache에서 읽음
 */
function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  try {
    // 파일명 검증 (경로 조작 등) — 사용자 입력 오류이므로 400(AppError)로 전달(500 오인 방지)
    if (!validateFilename(file.originalname)) {
      return cb(new AppError(400, '허용되지 않는 파일명입니다.'));
    }

    // ✅ 절대 차단 확장자 (DB 설정으로 변경 불가)
    //    확장자 화이트리스트는 제거됨 — 저장 시 확장자를 제거(랜덤 파일명)하고,
    //    첨부는 정적 서빙 없이 인가된 다운로드 라우트에서 attachment로만 제공하며,
    //    실행 권한도 제거(chmod 644)하므로 이 절대차단 목록(웹셸·HTML/SVG 등)만으로 충분하다.
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

/**
 * 파일 업로드 Multer 인스턴스 빌더
 * — fileSize·files는 호출 시점의 settingsCache 값을 사용
 */
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
      fieldSize: 2 * 1024 * 1024, // 2MB (한글 500K자 × 3바이트 ≒ 1.5MB + 여유)
      headerPairs: 20,
    },
  });
}

// ─── 캐시된 인스턴스 (설정 변경 시 refreshFileUploader()로 재빌드) ─────────────

let _fileUploader: multer.Multer = buildFileUploader();

export function refreshFileUploader(): void {
  _fileUploader = buildFileUploader();
}

/**
 * 파일 업로드 multer 인스턴스
 *
 * 요청마다 최신 _fileUploader에 위임하므로 refresh(설정 변경/부팅 시 캐시 로드)가 즉시 반영되고,
 * routes는 기존 방식(uploadFiles.array('files'))을 그대로 사용할 수 있습니다.
 */
export const uploadFiles: multer.Multer = createDynamicUploader(() => _fileUploader);
