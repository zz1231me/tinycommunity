// server/src/middlewares/upload/image.ts
import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { generateRandomId } from '../../utils/generateId';
import {
  UPLOAD_DIRS,
  BLOCKED_EXTENSIONS,
  getDynamicAllowedExtensions,
  getDynamicSizeLimits,
  getDynamicMaxImageCount,
} from './config';
import { validateFilename, blockedExtOf } from './utils';
import { createDynamicUploader } from './dynamicUploader';
import { logInfo, logError } from '../../utils/logger';
import { AppError } from '../error.middleware';

/**
 * 이미지 업로드 Storage 설정 (에디터용 - 랜덤 ID)
 */
const imageStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIRS.IMAGES);
  },
  filename: function (_req, file, cb) {
    try {
      const ext = path.extname(file.originalname);
      const randomId = generateRandomId(12); // 대문자+숫자 12자리
      const filename = `${randomId}${ext}`;

      logInfo(`이미지 저장: ${file.originalname} → ${filename}`);
      cb(null, filename);
    } catch (error) {
      logError('이미지 파일명 생성 오류', error);
      cb(new Error('이미지 저장 중 오류가 발생했습니다.'), '');
    }
  },
});

/**
 * 이미지 필터 함수 — 허용 확장자는 런타임에 settingsCache에서 읽음
 */
function imageFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  try {
    // 파일명 검증 — 사용자 입력 오류이므로 400(AppError)로 전달해 500 오인 방지
    if (!validateFilename(file.originalname)) {
      return cb(new AppError(400, '허용되지 않는 파일명입니다.'));
    }

    // ✅ 절대 차단 확장자 (관리자 화이트리스트로도 우회 불가)
    //    이미지는 확장자를 보존해 저장되고 /uploads/images에서 inline으로 서빙되므로,
    //    .svg/.html 등이 화이트리스트에 잘못 추가돼도 여기서 차단해 저장형 XSS를 막는다.
    //    끝 점/공백 등 정규화 우회를 막기 위해 blockedExtOf로 비교한다.
    if (BLOCKED_EXTENSIONS.includes(blockedExtOf(file.originalname))) {
      return cb(new AppError(400, '보안상 위험한 파일 형식입니다.'));
    }

    // 이미지 확장자만 허용 (관리자 설정 반영)
    const ext = path.extname(file.originalname).toLowerCase();
    if (!getDynamicAllowedExtensions().IMAGE.includes(ext)) {
      return cb(new AppError(400, '이미지 파일만 업로드 가능합니다.'));
    }

    // 이미지 MIME 타입 검증
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError(400, '이미지 파일이 아닙니다.'));
    }

    logInfo(`이미지 업로드 허용: ${file.originalname}`);
    cb(null, true);
  } catch (error) {
    logError('이미지 필터 오류', error);
    cb(new Error('이미지 검증 중 오류가 발생했습니다.'));
  }
}

/**
 * 이미지 업로드 Multer 인스턴스 빌더
 * — fileSize·files는 호출 시점의 settingsCache 값을 사용
 */
function buildImageUploader(): multer.Multer {
  const limits = getDynamicSizeLimits();
  return multer({
    storage: imageStorage,
    fileFilter: imageFilter,
    limits: {
      fileSize: limits.IMAGE,
      files: getDynamicMaxImageCount(),
    },
  });
}

// ─── 캐시된 인스턴스 (설정 변경 시 refreshImageUploader()로 재빌드) ─────────────

let _imageUploader: multer.Multer = buildImageUploader();

export function refreshImageUploader(): void {
  _imageUploader = buildImageUploader();
}

/**
 * 이미지 업로드 multer 인스턴스
 *
 * 요청마다 최신 _imageUploader에 위임하므로 refresh(설정 변경/부팅 시 캐시 로드)가 즉시 반영되고,
 * routes는 기존 방식(uploadImages.single('image'))을 그대로 사용할 수 있습니다.
 */
export const uploadImages: multer.Multer = createDynamicUploader(() => _imageUploader);
