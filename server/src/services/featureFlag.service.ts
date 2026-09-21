// 기능 스위치의 현재 상태를 캐시해 둔다.
// 캐시는 프로세스 안에만 있다. 다중 프로세스에서는 변경 후 최대 TTL 만큼 옛 값을 쓴다.

import { FeatureFlag } from '../models/FeatureFlag';
import {
  FEATURES,
  FEATURE_KEYS,
  isFeatureKey,
  requiredKeys,
  resolveFeatures,
  type FeatureKey,
} from '../config/features';
import { logError } from '../utils/logger';

/** 캐시 수명. 다중 프로세스에서 옛 값을 쓰는 시간의 상한이기도 하다. */
const TTL_MS = 30_000;

let cache: Record<FeatureKey, boolean> | null = null;
let cachedAt = 0;

async function load(): Promise<Record<FeatureKey, boolean>> {
  const rows = await FeatureFlag.findAll({ attributes: ['key', 'enabled'] });
  const stored: Partial<Record<FeatureKey, boolean>> = {};
  for (const row of rows) {
    // 카탈로그에서 사라진 키는 무시한다
    if (isFeatureKey(row.key)) stored[row.key] = row.enabled;
  }
  return resolveFeatures(stored);
}

export const featureFlagService = {
  /** 캐시를 비운다. 값을 바꾼 직후 호출한다. */
  invalidate(): void {
    cache = null;
    cachedAt = 0;
  },

  async getAll(): Promise<Record<FeatureKey, boolean>> {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    try {
      cache = await load();
      cachedAt = Date.now();
    } catch (err) {
      // 스위치를 못 읽어도 기본값으로 계속 동작한다
      logError('기능 스위치 조회 실패 — 기본값으로 동작합니다', err);
      return resolveFeatures({});
    }
    return cache;
  },

  async isEnabled(key: FeatureKey): Promise<boolean> {
    return (await this.getAll())[key];
  },

  /** 관리자 화면용. 카탈로그 + 현재 값. */
  async listForAdmin() {
    const state = await this.getAll();
    const stored = await FeatureFlag.findAll({
      attributes: ['key', 'enabled', 'updatedBy', 'updatedAt'],
    });
    const meta = new Map(stored.map(r => [r.key, r]));

    return FEATURE_KEYS.map(key => {
      const def = FEATURES[key];
      const row = meta.get(key);
      const requires = requiredKeys(key);
      return {
        key,
        label: def.label,
        description: def.description,
        group: def.group,
        defaultEnabled: def.defaultEnabled,
        requires,
        clientOnly: 'clientOnly' in def ? !!def.clientOnly : false,
        /** 관리자가 저장한 값. 없으면 기본값. */
        enabled: row ? row.enabled : def.defaultEnabled,
        /** 의존성까지 반영한 실제 동작 상태 */
        effective: state[key],
        updatedBy: row?.updatedBy ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  },

  /** 여러 스위치를 한 번에 저장한다 */
  async setMany(changes: Record<string, boolean>, adminId: string): Promise<void> {
    const entries = Object.entries(changes).filter(([key]) => isFeatureKey(key));
    for (const [key, enabled] of entries) {
      await FeatureFlag.upsert({ key, enabled: !!enabled, updatedBy: adminId });
    }
    this.invalidate();
  },
};
