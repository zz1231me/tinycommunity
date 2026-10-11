// client/src/api/features.ts
// 기능 스위치 API. 사이트 전체(관리자), 역할·개인 예외(관리자), 본인 메뉴 숨기기.

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
  /** 역할 id → 켬/끔. 규칙이 없는 역할은 빠진다(켜짐). */
  roleRules: Record<string, boolean>;
  /** 이 기능에 개인 예외가 걸린 사람 수 */
  userRuleCount: number;
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

/** 역할별 규칙 저장. null 은 규칙 지우기(켜짐). */
export async function saveRoleFeatureRules(
  roleId: string,
  changes: Record<string, boolean | null>
): Promise<FeatureCatalog> {
  const res = await api.put(`/admin/features/roles/${encodeURIComponent(roleId)}`, changes);
  return unwrap(res);
}

/** 한 사람의 기능별 값. role·user 가 null 이면 규칙 없음. */
export interface UserFeatureRow {
  key: string;
  label: string;
  group: string;
  site: boolean;
  role: boolean | null;
  user: boolean | null;
  effective: boolean;
}

export interface UserFeatureRules {
  /** 관리자 계정은 예외를 받지 않는다 */
  isAdmin: boolean;
  features: UserFeatureRow[];
}

export async function fetchUserFeatureRules(
  userId: string,
  signal?: AbortSignal
): Promise<UserFeatureRules> {
  const res = await api.get(`/admin/features/users/${encodeURIComponent(userId)}`, { signal });
  return unwrap(res);
}

export async function saveUserFeatureRules(
  userId: string,
  changes: Record<string, boolean | null>
): Promise<UserFeatureRules> {
  const res = await api.put(`/admin/features/users/${encodeURIComponent(userId)}`, changes);
  return unwrap(res);
}

/** 본인이 숨길 메뉴 목록을 통째로 저장한다 */
export async function saveHiddenMenus(hiddenMenus: string[]): Promise<string[]> {
  const res = await api.put('/features/hidden-menus', { hiddenMenus });
  return unwrap(res);
}
