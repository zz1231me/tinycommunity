// server/src/middlewares/upload/config.ts
import path from 'path';
import {
  getFileSizeLimits,
  getMaxImageCount,
  getAllowedExtensions,
  BLOCKED_EXTENSIONS_FLOOR,
} from '../../utils/settingsCache';

/**
 * 업로드 설정 상수 / 동적 게터
 *
 * ⚠️  허용 확장자 · 파일 크기 · 이미지 개수는 관리자 설정(settingsCache)에서 동적으로 읽습니다.
 *     아래 정적 상수는 settingsCache 로드 전 또는 테스트 환경의 폴백으로만 사용됩니다.
 */

// ─── 정적 폴백 상수 (settingsCache 로드 전 사용) ────────────────────────────────

/** 항상 차단되는 확장자 (DB 설정으로 변경 불가) */
export const BLOCKED_EXTENSIONS = BLOCKED_EXTENSIONS_FLOOR;

// ─── 동적 게터 (런타임에 settingsCache에서 읽음) ──────────────────────────────

/** 현재 허용 이미지 확장자 (관리자 설정 반영) — 이미지·아바타 업로드 검증용 */
export function getDynamicAllowedExtensions() {
  return getAllowedExtensions();
}

/** 현재 파일 크기 제한 (바이트, 관리자 설정 반영) */
export function getDynamicSizeLimits() {
  return getFileSizeLimits();
}

/** 현재 이미지 업로드 최대 개수 (관리자 설정 반영) */
export function getDynamicMaxImageCount(): number {
  return getMaxImageCount();
}

// Magic Numbers — 인라인 서빙되는 이미지의 실제 타입 검증용.
// validator는 image/* MIME만 내용 검증하므로 이미지 시그니처만 유지한다(문서/압축/미디어는
// 다운로드 전용 첨부라 내용 검증하지 않음 — 과거 비이미지 항목은 도달 불가라 제거).
export const MAGIC_NUMBERS: { [key: string]: Buffer[] } = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF (validator가 bytes 8-11의 'WEBP'도 확인)
  'image/bmp': [Buffer.from([0x42, 0x4d])], // BM
  'image/x-icon': [Buffer.from([0x00, 0x00, 0x01, 0x00])], // ICO
  'image/vnd.microsoft.icon': [Buffer.from([0x00, 0x00, 0x01, 0x00])],
};

// 업로드 디렉토리
export const UPLOAD_DIRS = {
  BASE: path.join(__dirname, '../../../uploads'),
  FILES: path.join(__dirname, '../../../uploads/files'),
  IMAGES: path.join(__dirname, '../../../uploads/images'),
  AVATARS: path.join(__dirname, '../../../uploads/avatars'),
  // 커스텀 HTML 페이지 번들(ZIP 해제 정적 파일). 하위에 페이지 id별 디렉터리.
  CUSTOM_PAGES: path.join(__dirname, '../../../uploads/custom-pages'),
};
