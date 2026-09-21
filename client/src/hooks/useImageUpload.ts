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

  // opts.signal / opts.onProgress 를 axios 에 전달하고, 실패하면 throw 해서 어댑터 promise 도 reject 되게 한다.
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

        // uploadApi 는 타임아웃 없이 같은 인터셉터(419 갱신·401 처리)를 쓴다.
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
        // 취소되었거나 에디터가 언마운트된 경우라 에러를 표시하지 않는다.
        if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          throw err;
        }
        fileLogger.error('이미지 업로드 실패', err);
        setUploadError('이미지 업로드에 실패했습니다.');
        // 어댑터가 reject 되도록 다시 throw 한다.
        throw err;
      }
    },
    []
  );

  return { handleImageUpload, uploadError };
};
