// server/src/controllers/ipRule.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import { logError } from '../utils/logger';
import {
  listIpRules,
  createIpRule,
  updateIpRule,
  deleteIpRule,
  getIpRuleStats,
  matchesIpRule,
  getIpRuleCache,
} from '../services/ipRule.service';
import { IpRule, IpRuleType } from '../models/IpRule';
import { AppError } from '../middlewares/error.middleware';
import { auditLogService } from '../services/auditLog.service';

function logIpRuleAudit(
  req: AuthRequest,
  action: 'create_ip_rule' | 'update_ip_rule' | 'delete_ip_rule',
  targetId: string | null,
  payload: Record<string, unknown>
): void {
  auditLogService
    .createAuditLog({
      adminId: req.user?.id ?? 'unknown',
      adminName: req.user?.name ?? 'unknown',
      action,
      targetType: 'ip_rule',
      targetId: targetId ?? undefined,
      afterValue: payload,
      ipAddress: req.ip ?? null,
    })
    .catch(err => logError(`감사 로그 기록 실패 (${action})`, err));
}

function toAppError(err: unknown): AppError | null {
  return err instanceof AppError ? err : null;
}

// GET /api/admin/ip-rules
export const getIpRules = async (req: AuthRequest, res: Response): Promise<void> => {
  const type = req.query.type as IpRuleType | undefined;
  try {
    const rules = await listIpRules(type);
    sendSuccess(res, rules);
  } catch (err) {
    logError('IP 규칙 조회 실패', err);
    sendError(res, 500, 'IP 규칙 조회 실패');
  }
};

// GET /api/admin/ip-rules/stats
export const getStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await getIpRuleStats();
    sendSuccess(res, stats);
  } catch (err) {
    logError('IP 규칙 통계 조회 실패', err);
    sendError(res, 500, '통계 조회 실패');
  }
};

// POST /api/admin/ip-rules
export const addIpRule = async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, ip, description } = req.body as {
    type?: string;
    ip?: string;
    description?: string | null;
  };
  const userId = req.user?.id;

  if (!type || !['whitelist', 'blacklist'].includes(type)) {
    sendError(res, 400, 'type은 whitelist 또는 blacklist여야 합니다.');
    return;
  }
  if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
    sendError(res, 400, 'IP 주소를 입력해주세요.');
    return;
  }

  // 기본 IP/CIDR 형식 검증
  const ipTrimmed = ip.trim();

  function isValidIpCidr(value: string): boolean {
    if (value === '::1' || value === 'localhost') return true;
    const cidrMatch = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
    if (!cidrMatch) return false;
    const octets = [cidrMatch[1], cidrMatch[2], cidrMatch[3], cidrMatch[4]];
    if (octets.some(o => parseInt(o, 10) > 255)) return false;
    if (cidrMatch[5] !== undefined && parseInt(cidrMatch[5], 10) > 32) return false;
    return true;
  }

  if (!isValidIpCidr(ipTrimmed)) {
    sendError(res, 400, '유효하지 않은 IP 형식입니다. (예: 192.168.1.1 또는 192.168.0.0/24)');
    return;
  }

  // self-lockout 방지 — 현재 접속 중인 본인 IP를 차단 목록에 추가하면 즉시 관리 화면 접근 불가
  if (type === 'blacklist' && req.ip && matchesIpRule(req.ip, ipTrimmed)) {
    sendError(res, 400, '현재 접속 중인 본인 IP는 차단(blacklist) 목록에 추가할 수 없습니다.');
    return;
  }

  // self-lockout 방지(whitelist) — whitelist가 하나라도 활성화되면 목록에 없는 IP는 전부 차단된다.
  // 신규 규칙은 즉시 활성(isActive:true)이므로, 본인 IP가 새 규칙·기존 활성 whitelist·환경변수
  // 어느 것에도 포함되지 않으면 관리 화면(IP 규칙 해제 포함)에 락아웃될 수 있어 거부한다.
  if (type === 'whitelist' && req.ip) {
    const selfIp = req.ip.startsWith('::ffff:') ? req.ip.slice(7) : req.ip;
    let covered = true; // 캐시 조회 실패 시 가드 스킵(fail-open — 편의 안전장치)
    try {
      const cache = await getIpRuleCache();
      const envWhitelist = process.env.ALLOWED_ADMIN_IPS
        ? process.env.ALLOWED_ADMIN_IPS.split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      covered =
        matchesIpRule(selfIp, ipTrimmed) ||
        [...cache.whitelist, ...envWhitelist].some(r => matchesIpRule(selfIp, r));
    } catch {
      covered = true;
    }
    if (!covered) {
      sendError(
        res,
        400,
        '이 화이트리스트 규칙은 현재 접속 중인 본인 IP를 포함하지 않아 관리자 접근이 차단될 수 있습니다. 본인 IP를 포함하는 규칙을 먼저 추가하세요.'
      );
      return;
    }
  }

  try {
    const rule = await createIpRule({
      type: type as IpRuleType,
      ip: ipTrimmed,
      description: description ?? null,
      createdBy: userId,
    });
    logIpRuleAudit(req, 'create_ip_rule', rule.id ?? null, {
      type,
      ip: ipTrimmed,
      description: description ?? null,
    });
    sendSuccess(res, rule, 'IP 규칙이 추가되었습니다.', 201);
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 409) {
      sendError(res, 409, appErr.message);
      return;
    }
    logError('IP 규칙 추가 실패', err);
    sendError(res, 500, 'IP 규칙 추가 실패');
  }
};

// PATCH /api/admin/ip-rules/:id
export const patchIpRule = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { description, isActive } = req.body as {
    description?: string | null;
    isActive?: boolean;
  };

  // self-lockout 방지 — 본인 IP에 매칭되는 차단 규칙을 활성화하려는 경우 거부
  if (isActive === true && req.ip) {
    const existing = await IpRule.findByPk(id);
    if (existing && existing.type === 'blacklist' && matchesIpRule(req.ip, existing.ip)) {
      sendError(res, 400, '현재 접속 중인 본인 IP에 매칭되는 차단 규칙은 활성화할 수 없습니다.');
      return;
    }
  }

  try {
    const rule = await updateIpRule(id, { description, isActive });
    logIpRuleAudit(req, 'update_ip_rule', id, { description, isActive });
    sendSuccess(res, rule, 'IP 규칙이 수정되었습니다.');
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) return sendNotFound(res, 'IP 규칙');
    logError('IP 규칙 수정 실패', err, { id });
    sendError(res, 500, 'IP 규칙 수정 실패');
  }
};

// DELETE /api/admin/ip-rules/:id
export const removeIpRule = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    await deleteIpRule(id);
    logIpRuleAudit(req, 'delete_ip_rule', id, {});
    sendSuccess(res, null, 'IP 규칙이 삭제되었습니다.');
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) return sendNotFound(res, 'IP 규칙');
    logError('IP 규칙 삭제 실패', err, { id });
    sendError(res, 500, 'IP 규칙 삭제 실패');
  }
};
