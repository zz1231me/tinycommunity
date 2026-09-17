// client/src/api/features.ts
// 관리자 기능 스위치 API.

import api from './axios';
import { unwrap } from './utils';

export interface AdminFeature {
  key: string;
  label: string;
  description: string;
  group: string;
  defaultEnabled: boolean;
  /** 이 기능이 동작하려면 함께 켜져 있어야 하는 기능들 */
  requires: string[];
  /** API 표면이 없어 화면에서만 적용되는 기능인지 */
  clientOnly: boolean;
  /** 관리자가 저장한 값 */
  enabled: boolean;
  /** 의존성까지 반영한 실제 동작 상태 — enabled 와 다르면 선행 기능이 꺼진 것 */
  effective: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface FeatureCatalog {
  groups: Record<string, string>;
  features: AdminFeature[];
}

export async function fetchFeatureCatalog(signal?: AbortSignal): Promise<FeatureCatalog> {
  const res = await api.get('/admin/features', { signal });
  return unwrap(res);
}

export async function saveFeatures(changes: Record<string, boolean>): Promise<FeatureCatalog> {
  const res = await api.put('/admin/features', changes);
  return unwrap(res);
}
