// server/src/services/ipRule.service.ts — IP 규칙 서비스

import { IpRule, IpRuleType } from '../models/IpRule';
import { AppError } from '../middlewares/error.middleware';
import { logInfo } from '../utils/logger';

// ── IP 매칭 유틸리티 ────────────────────────────────────────────────────────

/** IPv6-mapped IPv4 정규화 */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** CIDR 범위 내에 IP가 포함되는지 확인 (IPv4 only) */
function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const [base, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipNum = ipToNum(ip);
    const baseNum = ipToNum(base);
    if (ipNum === null || baseNum === null) return false;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (baseNum & mask);
  } catch {
    return false;
  }
}

function ipToNum(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** 하나의 IP가 규칙 IP(단일 또는 CIDR)에 매칭되는지 */
export function matchesIpRule(clientIp: string, ruleIp: string): boolean {
  const normalized = normalizeIp(clientIp);
  if (ruleIp.includes('/')) {
    return ipInCidr(normalized, ruleIp);
  }
  return normalized === ruleIp;
}

// ── 서비스 ────────────────────────────────────────────────────────────────

// 규칙 캐시 (미들웨어 DB 조회 최소화)
interface RuleCache {
  whitelist: string[];
  blacklist: string[];
  loadedAt: number;
}

let ruleCache: RuleCache | null = null;
const CACHE_TTL_MS = 30_000; // 30초

export async function getIpRuleCache(): Promise<RuleCache> {
  const now = Date.now();
  if (ruleCache && now - ruleCache.loadedAt < CACHE_TTL_MS) {
    return ruleCache;
  }

  const rules = await IpRule.findAll({ where: { isActive: true } });
  ruleCache = {
    whitelist: rules.filter(r => r.type === 'whitelist').map(r => r.ip),
    blacklist: rules.filter(r => r.type === 'blacklist').map(r => r.ip),
    loadedAt: now,
  };
  return ruleCache;
}

/** 캐시 강제 초기화 (규칙 변경 시 호출) */
export function invalidateIpRuleCache(): void {
  ruleCache = null;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listIpRules(type?: IpRuleType) {
  const where = type ? { type } : {};
  return IpRule.findAll({
    where,
    order: [['createdAt', 'DESC']],
  });
}

export async function createIpRule(data: {
  type: IpRuleType;
  ip: string;
  description?: string | null;
  createdBy: string;
}) {
  const trimmedIp = data.ip.trim();
  const [rule, created] = await IpRule.findOrCreate({
    where: { type: data.type, ip: trimmedIp },
    defaults: {
      type: data.type,
      ip: trimmedIp,
      description: data.description ?? null,
      createdBy: data.createdBy,
      isActive: true,
    },
  });

  if (!created) {
    throw new AppError(
      409,
      `이미 동일한 ${data.type === 'whitelist' ? '화이트리스트' : '블랙리스트'} 규칙이 존재합니다.`
    );
  }

  invalidateIpRuleCache();
  logInfo('IP 규칙 추가', { type: data.type, ip: trimmedIp, by: data.createdBy });
  return rule;
}

export async function updateIpRule(
  id: string,
  data: {
    description?: string | null;
    isActive?: boolean;
  }
) {
  const rule = await IpRule.findByPk(id);
  if (!rule) throw new AppError(404, 'IP 규칙을 찾을 수 없습니다.');

  if (data.description !== undefined) rule.description = data.description;
  if (data.isActive !== undefined) rule.isActive = data.isActive;
  await rule.save();

  invalidateIpRuleCache();
  return rule;
}

export async function deleteIpRule(id: string) {
  const rule = await IpRule.findByPk(id);
  if (!rule) throw new AppError(404, 'IP 규칙을 찾을 수 없습니다.');
  await rule.destroy();
  invalidateIpRuleCache();
  logInfo('IP 규칙 삭제', { id, ip: rule.ip, type: rule.type });
}

export async function getIpRuleStats() {
  const [total, whitelist, blacklist, active] = await Promise.all([
    IpRule.count(),
    IpRule.count({ where: { type: 'whitelist' } }),
    IpRule.count({ where: { type: 'blacklist' } }),
    IpRule.count({ where: { isActive: true } }),
  ]);
  return { total, whitelist, blacklist, active, inactive: total - active };
}
