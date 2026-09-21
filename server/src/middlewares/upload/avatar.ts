import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { UPLOAD_DIRS, getDynamicAllowedExtensions, getDynamicSizeLimits } from './config';
import { validateFilename, deleteFile } from './utils';
import { createDynamicUploader } from './dynamicUploader';
import { logInfo, logError } from '../../utils/logger';
import { getAvatarSettings } from '../../utils/settingsCache';
import { AppError } from '../error.middleware';

/** 아바타 파일 필터. 허용 확장자·크기는 런타임에 settingsCache 에서 읽는다. */
function avatarFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  try {
    // 파일명 오류는 사용자 입력 문제이므로 400 으로 내보낸다.
    if (!validateFilename(file.originalname)) {
      return cb(new AppError(400, '허용되지 않는 파일명입니다.'));
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new AppError(400, '지원하지 않는 파일 형식입니다. (JPEG, PNG, WebP, GIF만 허용)'));
    }

    // 확장자는 관리자 설정을 따른다.
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!getDynamicAllowedExtensions().IMAGE.includes(fileExtension)) {
      return cb(new AppError(400, '지원하지 않는 파일 확장자입니다.'));
    }

    cb(null, true);
  } catch (error) {
    logError('아바타 필터 오류', error);
    cb(new Error('아바타 검증 중 오류가 발생했습니다.'));
  }
}

/** 아바타 업로드 multer 인스턴스 빌더. fileSize 는 호출 시점의 settingsCache 값을 쓴다. */
function buildAvatarUploader(): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    fileFilter: avatarFilter,
    limits: {
      fileSize: getDynamicSizeLimits().AVATAR,
      files: 1,
    },
  });
}

// 설정이 바뀌면 refreshAvatarUploader() 로 재빌드한다.

let _avatarUploader: multer.Multer = buildAvatarUploader();

export function refreshAvatarUploader(): void {
  _avatarUploader = buildAvatarUploader();
}

/** 아바타 업로드 multer. 요청마다 최신 _avatarUploader 에 위임해 refresh 가 즉시 반영된다. */
export const uploadAvatar: multer.Multer = createDynamicUploader(() => _avatarUploader);

/** 아바타 버퍼 magic-number 검증. memoryStorage 는 file.path 가 없어 disk validator 를 못 쓴다. */
function validateAvatarBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return true;
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
  // WebP: RIFF.... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return true;
  return false;
}

/** 아바타 이미지 처리 (sharp) */
export async function processAvatar(buffer: Buffer, userId: string): Promise<string> {
  // memoryStorage 는 disk validator 를 우회하므로 여기서 검증한다.
  if (!validateAvatarBuffer(buffer)) {
    throw new Error('이미지 파일 형식이 올바르지 않습니다.');
  }

  try {
    const timestamp = Date.now();
    const unique = randomUUID().replace(/-/g, '').substring(0, 12);
    const filename = `avatar_${userId}_${timestamp}_${unique}.jpg`;
    const filepath = path.join(UPLOAD_DIRS.AVATARS, filename);

    const { sizePx, quality } = getAvatarSettings();
    await sharp(buffer)
      .resize(sizePx, sizePx, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true,
      })
      .toFile(filepath);

    const relativePath = `/uploads/avatars/${filename}`;
    logInfo('아바타 처리 완료', { relativePath });

    return relativePath;
  } catch (error) {
    // 필터를 통과한 파일이 sharp 에서 실패하면 손상된 이미지로 보고 400 으로 돌린다.
    logError('아바타 이미지 처리 실패', error);
    throw new AppError(400, '이미지 처리에 실패했습니다. 올바른 이미지 파일인지 확인해주세요.');
  }
}

/** 기존 아바타 파일 삭제 */
export async function deleteAvatarFile(avatarUrl: string): Promise<void> {
  try {
    if (!avatarUrl || avatarUrl.startsWith('http')) {
      return; // 외부 URL이면 삭제하지 않음
    }

    // '/uploads/avatars/filename.jpg' → 'filename.jpg'
    const filename = path.basename(avatarUrl);

    // avatar_ 로 시작하는 파일만 지운다.
    if (!filename.startsWith('avatar_')) {
      logInfo('아바타 파일이 아님, 삭제 건너뜀', { filename });
      return;
    }

    const filepath = path.join(UPLOAD_DIRS.AVATARS, filename);
    await deleteFile(filepath);
  } catch (error) {
    logError('아바타 파일 삭제 실패', error);
    // 파일 삭제 실패는 전체 프로세스를 중단하지 않음
  }
}
