// client/src/api/customPages.ts
import api from './axios';
import { unwrap } from './utils';

export interface CustomPageSummary {
  id: string;
  slug: string;
  title: string;
  order: number;
}

export interface CustomPage extends CustomPageSummary {
  html: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // 번들(폴더 ZIP 업로드) 페이지
  bundlePath?: string | null; // 관리자 응답에 포함(내부 경로). null=단일 HTML
  isBundle?: boolean; // 사용자 조회(getPageBySlug) 응답에 포함
  entryFile?: string; // 번들 진입 파일
}

export interface CustomPageInput {
  slug: string;
  title: string;
  html: string;
  isPublished: boolean;
  order: number;
  entryFile?: string; // 번들 진입 파일 변경(선택)
}

export interface BundleUploadResult {
  id: string;
  entryFile: string;
  htmlFiles: string[];
}

// 사용자
export const fetchPublishedPages = (): Promise<CustomPageSummary[]> =>
  api.get('/custom-pages').then(unwrap);

export const fetchPageBySlug = (slug: string): Promise<CustomPage> =>
  api.get(`/custom-pages/${slug}`).then(unwrap);

// 관리자
export const fetchAllPages = (): Promise<CustomPage[]> =>
  api.get('/custom-pages/admin').then(unwrap);

export const createCustomPage = (data: CustomPageInput): Promise<CustomPage> =>
  api.post('/custom-pages', data).then(unwrap);

export const updateCustomPage = (id: string, data: CustomPageInput): Promise<CustomPage> =>
  api.put(`/custom-pages/${id}`, data).then(unwrap);

export const deleteCustomPage = (id: string): Promise<void> =>
  api.delete(`/custom-pages/${id}`).then(() => undefined);

// ── 번들(ZIP) ──
export const uploadPageBundle = (
  id: string,
  zip: File,
  onProgress?: (pct: number) => void
): Promise<BundleUploadResult> => {
  const fd = new FormData();
  fd.append('bundle', zip);
  return api
    .post(`/custom-pages/${id}/bundle`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    })
    .then(unwrap);
};

export const fetchBundleFiles = (
  id: string
): Promise<{ entryFile: string; htmlFiles: string[] }> =>
  api.get(`/custom-pages/${id}/bundle-files`).then(unwrap);

// 번들 진입 URL(사용자 화면 iframe src). axios baseURL(/api)와 별개로 절대경로가 필요하다.
// ★진입 파일의 실제 경로로 로드해야 상대경로 자산이 올바르게 풀린다(하위폴더 진입 지원).
export const bundleEntryUrl = (slug: string, entryFile = 'index.html'): string => {
  const entry = entryFile.split('/').map(encodeURIComponent).join('/');
  return `/api/custom-pages/${encodeURIComponent(slug)}/bundle/${entry}`;
};
