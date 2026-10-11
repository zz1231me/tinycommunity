// 기능 스위치의 현재 상태를 캐시해 둔다.
// 캐시는 프로세스 안에만 있다. 다중 프로세스에서는 변경 후 최대 TTL 만큼 옛 값을 쓴다.
//
// 두 층이 있다.
//  - 사이트 전체(FeatureFlag): 꺼지면 누구도 못 쓴다.
//  - 역할·사람별 예외(FeatureRule): 사이트가 켜 둔 기능을 특정 역할·사람에게만 끄거나 다시 켠다.
// 관리자 역할은 예외를 받지 않는다. 규칙을 잘못 걸어 관리자가 되돌릴 화면까지 잃으면 안 된다.

import { Op } from 'sequelize';
import { FeatureFlag } from '../models/FeatureFlag';
import { FeatureRule, type FeatureRuleScope } from '../models/FeatureRule';
import User from '../models/User';
import {
  FEATURES,
  FEATURE_KEYS,
  applyDependencies,
  isFeatureKey,
  requiredKeys,
  resolveFeatures,
  type FeatureKey,
} from '../config/features';
import { ROLES } from '../config/constants';
import { logError } from '../utils/logger';

/** 판정에 필요한 사람 정보. roleId 는 사용자 모델의 역할 id 다. */
export interface FeatureSubject {
  id: string;
  roleId: string;
}

type RuleMap = Map<string, Partial<Record<FeatureKey, boolean>>>;
interface Rules {
  role: RuleMap;
  user: RuleMap;
}

/** 캐시 수명. 다중 프로세스에서 옛 값을 쓰는 시간의 상한이기도 하다. */
const TTL_MS = 30_000;

let cache: Record<FeatureKey, boolean> | null = null;
let cachedAt = 0;

let rulesCache: Rules | null = null;
let rulesCachedAt = 0;

async function loadRules(): Promise<Rules> {
  const rows = await FeatureRule.findAll({
    attributes: ['featureKey', 'scope', 'targetId', 'enabled'],
  });
  const rules: Rules = { role: new Map(), user: new Map() };
  for (const row of rows) {
    if (!isFeatureKey(row.featureKey)) continue;
    const map = row.scope === 'role' ? rules.role : row.scope === 'user' ? rules.user : null;
    if (!map) continue;
    const entry = map.get(row.targetId) ?? {};
    entry[row.featureKey] = row.enabled;
    map.set(row.targetId, entry);
  }
  return rules;
}

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
    rulesCache = null;
    rulesCachedAt = 0;
  },

  async getRules(): Promise<Rules> {
    if (rulesCache && Date.now() - rulesCachedAt < TTL_MS) return rulesCache;
    try {
      rulesCache = await loadRules();
      rulesCachedAt = Date.now();
    } catch (err) {
      // 예외를 못 읽으면 사이트 전체 값만으로 동작한다(아무도 추가로 막지 않는다)
      logError('기능 예외 조회 실패 — 사이트 전체 값으로 동작합니다', err);
      return { role: new Map(), user: new Map() };
    }
    return rulesCache;
  },

  /** 이 사람에게 실제로 켜진 기능. 사이트 → 사람 예외 → 역할 규칙 순으로 본다. */
  async resolveFor(subject: FeatureSubject): Promise<Record<FeatureKey, boolean>> {
    const site = await this.getAll();
    if (subject.roleId === ROLES.ADMIN) return site;

    const rules = await this.getRules();
    const byUser = rules.user.get(subject.id) ?? {};
    const byRole = rules.role.get(subject.roleId) ?? {};
    const state = {} as Record<FeatureKey, boolean>;
    for (const key of FEATURE_KEYS) {
      state[key] = site[key] && (byUser[key] ?? byRole[key] ?? true);
    }
    return applyDependencies(state);
  },

  /** id 만 아는 곳(글 상세·알림 등)에서 쓴다. 모르는 사람이면 사이트 전체 값. */
  async resolveForUserId(userId: string | undefined): Promise<Record<FeatureKey, boolean>> {
    if (!userId) return this.getAll();
    const user = await User.findByPk(userId, { attributes: ['id', 'roleId'] });
    return user ? this.resolveFor({ id: user.id, roleId: user.roleId }) : this.getAll();
  },

  async isEnabledFor(key: FeatureKey, subject: FeatureSubject): Promise<boolean> {
    return (await this.resolveFor(subject))[key];
  },

  /**
   * 알림 받을 사람 중 그 기능을 쓸 수 있는 사람만. 꺼진 사람에게 알림이 가면
   * 눌러도 '기능이 꺼져 있습니다' 만 보게 된다.
   */
  async filterUsers(key: FeatureKey, userIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0 || !(await this.isEnabled(key))) return new Set();
    const users = await User.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'roleId'],
    });
    const allowed = new Set<string>();
    for (const user of users) {
      if (await this.isEnabledFor(key, { id: user.id, roleId: user.roleId })) allowed.add(user.id);
    }
    return allowed;
  },

  /** 관리자 화면용. 한 사람의 기능별 사이트·역할·개인 값과 실제 결과. */
  async describeForUser(subject: FeatureSubject) {
    const site = await this.getAll();
    const rules = await this.getRules();
    const effective = await this.resolveFor(subject);
    const byUser = rules.user.get(subject.id) ?? {};
    const byRole = rules.role.get(subject.roleId) ?? {};
    return FEATURE_KEYS.map(key => ({
      key,
      label: FEATURES[key].label,
      group: FEATURES[key].group,
      site: site[key],
      role: byRole[key] ?? null,
      user: byUser[key] ?? null,
      effective: effective[key],
    }));
  },

  /**
   * 예외를 저장한다. 값이 null 이면 규칙을 지운다(위 단계를 따른다).
   */
  async setRules(
    scope: FeatureRuleScope,
    targetId: string,
    changes: Partial<Record<FeatureKey, boolean | null>>,
    adminId: string
  ): Promise<void> {
    for (const [key, enabled] of Object.entries(changes)) {
      if (!isFeatureKey(key)) continue;
      if (enabled === null || enabled === undefined) {
        await FeatureRule.destroy({ where: { featureKey: key, scope, targetId } });
      } else {
        const existing = await FeatureRule.findOne({ where: { featureKey: key, scope, targetId } });
        if (existing) await existing.update({ enabled, updatedBy: adminId });
        else
          await FeatureRule.create({
            featureKey: key,
            scope,
            targetId,
            enabled,
            updatedBy: adminId,
          });
      }
    }
    this.invalidate();
  },

  /** 역할·사용자를 지울 때 그 대상의 규칙을 함께 지운다 */
  async removeRulesFor(scope: FeatureRuleScope, targetId: string): Promise<void> {
    await FeatureRule.destroy({ where: { scope, targetId } });
    this.invalidate();
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
    const rules = await this.getRules();
    const roleRules = (key: FeatureKey) => {
      const out: Record<string, boolean> = {};
      for (const [roleId, entry] of rules.role) {
        if (entry[key] !== undefined) out[roleId] = entry[key] as boolean;
      }
      return out;
    };
    const userRuleCount = (key: FeatureKey) =>
      [...rules.user.values()].filter(entry => entry[key] !== undefined).length;
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
        /** 역할 id → 켬/끔. 규칙이 없는 역할은 빠진다(켜짐). */
        roleRules: roleRules(key),
        /** 이 기능에 개인 예외가 걸린 사람 수. 화면이 '예외 n명' 으로 알린다. */
        userRuleCount: userRuleCount(key),
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
