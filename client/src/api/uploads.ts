// client/src/api/uploads.ts — 업로드 파일 관리(관리자)
import api from './axios';
import { unwrap } from './utils';

export interface AdminFileItem {
  filename: string;
  size: number;
  mtime: string;
  type: 'file' | 'image';
  downloadUrl: string;
}

export interface AdminFileListPage {
  items: AdminFileItem[];
  total: number;
  totalPages: number;
  totalSize: number;
}

export const fetchAdminFiles = (
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal
): Promise<AdminFileListPage> => api.get('/uploads/admin/list', { params, signal }).then(unwrap);

export const deleteAdminFile = (type: string, filename: string): Promise<void> =>
  api.delete(`/uploads/admin/${type}/${filename}`).then(() => undefined);
