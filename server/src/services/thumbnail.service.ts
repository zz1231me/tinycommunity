// 첨부 이미지 썸네일. 요청 시점에 생성하고 디스크에 캐시한다.

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { UPLOAD_DIRS } from '../middlewares/upload/config';
import { logError, logInfo } from '../utils/logger';

/** 썸네일 최대 변 길이(px) */
const THUMB_MAX_PX = 480;
const THUMB_QUALITY = 72;

export const THUMBS_DIR = UPLOAD_DIRS.THUMBS;

async function ensureThumbsDir(): Promise<void> {
  await fs.mkdir(THUMBS_DIR, { recursive: true });
}

/**
 * 원본 첨부 경로로부터 썸네일을 만들고 그 경로를 돌려준다. 처리할 수 없으면 null.
 * 출력은 항상 sharp 가 재인코딩한 JPEG 라 inline 서빙해도 저장형 XSS 위험이 없다.
 */
export async function getOrCreateThumbnail(
  sourcePath: string,
  savedFilename: string
): Promise<string | null> {
  const thumbPath = path.join(THUMBS_DIR, `${savedFilename}.jpg`);

  try {
    const [thumbStat, sourceStat] = await Promise.all([
      fs.stat(thumbPath).catch(() => null),
      fs.stat(sourcePath),
    ]);
    // 원본이 나중에 바뀐 경우(같은 파일명 재사용)에는 다시 만든다
    if (thumbStat && thumbStat.mtimeMs >= sourceStat.mtimeMs) return thumbPath;
  } catch {
    return null; // 원본이 없다
  }

  try {
    await ensureThumbsDir();
    await sharp(sourcePath)
      .rotate() // EXIF 방향 반영
      .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, progressive: true, mozjpeg: true })
      .toFile(thumbPath);

    logInfo('썸네일 생성', { savedFilename });
    return thumbPath;
  } catch (err) {
    // 이미지가 아니거나 손상된 파일. 호출부가 404 로 응답한다.
    logError('썸네일 생성 실패', err, { savedFilename });
    return null;
  }
}

/** 원본 첨부가 삭제될 때 함께 정리한다. */
export async function deleteThumbnail(savedFilename: string): Promise<void> {
  await fs.unlink(path.join(THUMBS_DIR, `${savedFilename}.jpg`)).catch(() => {});
}
