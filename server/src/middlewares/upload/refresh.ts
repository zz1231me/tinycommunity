// server/src/middlewares/upload/refresh.ts
import { refreshImageUploader } from './image';
import { refreshFileUploader } from './file';
import { refreshAvatarUploader } from './avatar';
import { logInfo } from '../../utils/logger';

/**
 * 모든 multer 업로드 인스턴스를 재빌드합니다.
 * 관리자가 파일 크기·이미지 개수·허용 확장자를 변경한 직후 호출합니다.
 */
export function refreshUploaders(): void {
  refreshImageUploader();
  refreshFileUploader();
  refreshAvatarUploader();
  logInfo('업로드 설정 갱신 완료 (multer 인스턴스 재빌드)');
}
