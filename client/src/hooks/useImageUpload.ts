// client/src/hooks/useImageUpload.ts
import { useCallback, useState } from 'react';
import axios from 'axios';
import { uploadApi } from '../api/axios';
import { fileLogger } from '../utils/logger';

export interface ImageUploadOptions {
  signal?: AbortSignal;
  onProgress?: (e: { loaded: number; total: number }) => void;
}

export const useImageUpload = () => {
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 콜백 패턴(부모 → CKEditor 어댑터)을 유지하되, 어댑터가 abort/progress를 받을 수 있도록
  // opts.signal / opts.onProgress 를 axios에 전달한다. 실패 시 reject되어 어댑터 promise 도
  // 정상적으로 reject되도록 throw 한다 (이전엔 무음 catch로 pending 무한 대기 위험).
  const handleImageUpload = useCallback(
    async (
      blob: Blob,
      callback: (url: string, alt: string) => void,
      opts: ImageUploadOptions = {}
    ): Promise<void> => {
      setUploadError(null);
      try {
        const formData = new FormData();
        formData.append('image', blob);

        // uploadApi: 무제한 타임아웃 + 동일한 axios 인터셉터(419 자동 갱신, 401 처리) 사용
        const res = await uploadApi.post('/uploads/images', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: opts.signal,
          onUploadProgress: e => {
            if (opts.onProgress && typeof e.total === 'number' && e.total > 0) {
              opts.onProgress({ loaded: e.loaded, total: e.total });
            }
          },
        });

        const data = res.data;
        const imageUrl = data.data?.imageUrl ?? data.imageUrl;
        if (!imageUrl) {
          throw new Error('이미지 업로드 응답에 URL이 없습니다.');
        }
        callback(imageUrl, '업로드된 이미지');
        fileLogger.success('이미지 업로드 완료', { url: imageUrl });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        // abort된 경우 — 사용자가 의도적으로 취소했거나 에디터가 언마운트됨. 에러 표시 안 함.
        if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          throw err;
        }
        fileLogger.error('이미지 업로드 실패', err);
        setUploadError('이미지 업로드에 실패했습니다.');
        // CKEditor 어댑터가 reject되어 적절한 에러 노티를 띄울 수 있도록 throw
        throw err;
      }
    },
    []
  );

  return { handleImageUpload, uploadError };
};
