// client/src/api/tempShare.ts
import { uploadApi } from './axios';
import { unwrap } from './utils';

export interface TempShareResult {
  token: string;
  url: string; // /api/temp-share/:token
  originalName: string;
  size: number;
  expiresAt: string;
}

export const uploadTempShare = (
  file: File,
  onProgress?: (pct: number) => void
): Promise<TempShareResult> => {
  const form = new FormData();
  form.append('file', file);
  return uploadApi
    .post('/temp-share/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && typeof e.total === 'number' && e.total > 0) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    })
    .then(unwrap);
};
