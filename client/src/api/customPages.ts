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
}

export interface CustomPageInput {
  slug: string;
  title: string;
  html: string;
  isPublished: boolean;
  order: number;
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
