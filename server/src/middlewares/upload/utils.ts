// server/src/middlewares/upload/utils.ts
import path from 'path';
import fs from 'fs/promises';
import { UPLOAD_DIRS } from './config';
import { logInfo } from '../../utils/logger';

/**
 * 절대차단(floor) 비교용 확장자 추출 — 정규화 포함
 *
 * path.extname 만으로는 끝의 점/공백("evil.php.", "evil.svg ")이나 dotfile 형태(".htaccess")로
 * 확장자 검사를 우회할 수 있다(윈도우는 파일명 끝 점·공백을 무시하기도 함). 차단 목록 비교 전에
 * 끝 공백·점을 제거하고, 확장자가 없는 dotfile은 이름 자체를 확장자로 간주한다.
 */
export function blockedExtOf(filename: string): string {
  const trimmed = filename.replace(/[\s.]+$/, '');
  let ext = path.extname(trimmed).toLowerCase();
  if (!ext) {
    const base = path.basename(trimmed).toLowerCase();
    if (base.startsWith('.')) ext = base; // ".htaccess" 등 dotfile
  }
  return ext;
}

/**
 * 파일명 특수문자 검증
 */
export function validateFilename(filename: string): boolean {
  // null 바이트 차단 (multipart 파싱 후 NUL이 남아 경로 truncation 유발 가능)
  if (filename.includes('\0')) {
    return false;
  }

  // 경로 조작 시도 차단
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // 특수문자 차단
  if (/[<>:"|?*]/.test(filename)) {
    return false;
  }

  // 길이 제한
  if (filename.length > 255) {
    return false;
  }

  return true;
}

/**
 * 업로드 디렉토리 생성
 */
export async function ensureUploadDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    logInfo('업로드 디렉토리 생성', { dir });
  }
}

/**
 * 모든 업로드 디렉토리 초기화
 */
export async function initializeUploadDirs(): Promise<void> {
  await Promise.all([
    ensureUploadDir(UPLOAD_DIRS.BASE),
    ensureUploadDir(UPLOAD_DIRS.FILES),
    ensureUploadDir(UPLOAD_DIRS.IMAGES),
    ensureUploadDir(UPLOAD_DIRS.AVATARS),
    ensureUploadDir(UPLOAD_DIRS.CUSTOM_PAGES),
  ]);
}

/**
 * 파일 삭제
 */
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
