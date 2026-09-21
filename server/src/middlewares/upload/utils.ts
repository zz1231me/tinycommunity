import path from 'path';
import fs from 'fs/promises';
import { UPLOAD_DIRS } from './config';
import { logInfo } from '../../utils/logger';

/** 차단 목록 비교용 확장자. 끝의 점·공백을 제거하고, 확장자 없는 dotfile 은 이름 자체를 확장자로 본다. */
export function blockedExtOf(filename: string): string {
  const trimmed = filename.replace(/[\s.]+$/, '');
  let ext = path.extname(trimmed).toLowerCase();
  if (!ext) {
    const base = path.basename(trimmed).toLowerCase();
    if (base.startsWith('.')) ext = base; // ".htaccess" 등 dotfile
  }
  return ext;
}

export function validateFilename(filename: string): boolean {
  // null 바이트는 경로 truncation 을 유발할 수 있어 차단한다.
  if (filename.includes('\0')) {
    return false;
  }

  // 경로 조작 시도 차단
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  if (/[<>:"|?*]/.test(filename)) {
    return false;
  }

  if (filename.length > 255) {
    return false;
  }

  return true;
}

export async function ensureUploadDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    logInfo('업로드 디렉토리 생성', { dir });
  }
}

export async function initializeUploadDirs(): Promise<void> {
  await Promise.all([
    ensureUploadDir(UPLOAD_DIRS.BASE),
    ensureUploadDir(UPLOAD_DIRS.FILES),
    ensureUploadDir(UPLOAD_DIRS.IMAGES),
    ensureUploadDir(UPLOAD_DIRS.AVATARS),
    ensureUploadDir(UPLOAD_DIRS.CUSTOM_PAGES),
    ensureUploadDir(UPLOAD_DIRS.THUMBS),
  ]);
}

export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    logInfo('파일 삭제', { filePath });
    return true;
  } catch {
    logInfo('삭제할 파일 없음', { filePath });
    return false;
  }
}
