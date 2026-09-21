import { refreshImageUploader } from './image';
import { refreshFileUploader } from './file';
import { refreshAvatarUploader } from './avatar';
import { logInfo } from '../../utils/logger';

/** 모든 multer 업로드 인스턴스를 재빌드한다. 업로드 설정 변경 직후 호출한다. */
export function refreshUploaders(): void {
  refreshImageUploader();
  refreshFileUploader();
  refreshAvatarUploader();
  logInfo('업로드 설정 갱신 완료 (multer 인스턴스 재빌드)');
}
