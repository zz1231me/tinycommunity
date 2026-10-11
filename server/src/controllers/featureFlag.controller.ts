// 기능 스위치 조회(모든 사용자)와 변경(관리자).

import { Request, Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { FEATURE_GROUPS, isFeatureKey, type FeatureKey } from '../config/features';
import { Role } from '../models/Role';
import User from '../models/User';
import { ROLES } from '../config/constants';
import { featureFlagService } from '../services/featureFlag.service';
import { auditLogService } from '../services/auditLog.service';

/**
 * GET /api/features — 이 사람에게 켜져 있는 기능들.
 * 사이트 전체 값에 역할·개인 예외를 얹은 결과다. 화면은 이 값으로 메뉴를 숨긴다.
 */
export const getEnabledFeatures = async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  try {
    sendSuccess(res, await featureFlagService.resolveFor({ id: user.id, roleId: user.role }));
  } catch (err) {
    logError('기능 스위치 조회 실패', err);
    sendError(res, 500, '기능 설정을 불러오지 못했습니다.');
  }
};

/** GET /api/admin/features — 카탈로그 + 현재 값 + 마지막 변경자 */
export const getFeatureCatalog = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, {
      groups: FEATURE_GROUPS,
      features: await featureFlagService.listForAdmin(),
    });
  } catch (err) {
    logError('기능 카탈로그 조회 실패', err);
    sendError(res, 500, '기능 목록을 불러오지 못했습니다.');
  }
};

/** PUT /api/admin/features — { "post.like": false, ... } 형태로 한 번에 저장 */
export const updateFeatures = async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendError(res, 400, '변경할 기능을 지정해주세요.');
    return;
  }

  const changes: Record<string, boolean> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!isFeatureKey(key)) {
      unknown.push(key);
      continue;
    }
    if (typeof value !== 'boolean') {
      sendError(res, 400, `'${key}' 값은 true/false 여야 합니다.`);
      return;
    }
    changes[key] = value;
  }

  // 모르는 키를 조용히 버리면 저장된 것처럼 보이므로 오류로 돌려준다
  if (unknown.length > 0) {
    sendError(res, 400, `알 수 없는 기능입니다: ${unknown.join(', ')}`);
    return;
  }
  if (Object.keys(changes).length === 0) {
    sendError(res, 400, '변경할 기능을 지정해주세요.');
    return;
  }

  try {
    const before = await featureFlagService.getAll();
    await featureFlagService.setMany(changes, req.user.id);

    // 전용 action 을 만들면 감사 로그 ENUM 컬럼을 손봐야 해서 update_site_settings 를 쓴다
    await auditLogService.createAuditLog({
      actorId: req.user.id,
      actorName: req.user.name ?? req.user.id,
      action: 'update_site_settings',
      targetType: 'setting',
      targetId: 'features',
      targetName: `기능 스위치 (${Object.keys(changes).join(', ')})`,
      beforeValue: Object.fromEntries(Object.keys(changes).map(k => [k, before[k as never]])),
      afterValue: changes,
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, {
      groups: FEATURE_GROUPS,
      features: await featureFlagService.listForAdmin(),
    });
  } catch (err) {
    logError('기능 스위치 저장 실패', err, { adminId: req.user.id });
    sendError(res, 500, '기능 설정을 저장하지 못했습니다.');
  }
};

/**
 * { "tools.wiki": true | false | null, ... } 를 검사한다. null 은 '규칙 지우기'.
 * 잘못된 값이면 오류 문구를, 아니면 바꿀 목록을 돌려준다.
 */
function parseRuleChanges(
  body: unknown
): { changes: Partial<Record<FeatureKey, boolean | null>> } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: '변경할 기능을 지정해주세요.' };
  }
  const changes: Partial<Record<FeatureKey, boolean | null>> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!isFeatureKey(key)) return { error: `알 수 없는 기능입니다: ${key}` };
    if (value !== null && typeof value !== 'boolean') {
      return { error: `'${key}' 값은 true/false/null 이어야 합니다.` };
    }
    changes[key] = value;
  }
  if (Object.keys(changes).length === 0) return { error: '변경할 기능을 지정해주세요.' };
  return { changes };
}

/** PUT /api/admin/features/roles/:roleId — 역할별 규칙. 관리자 역할에는 걸 수 없다. */
export const updateRoleFeatureRules = async (req: AuthRequest, res: Response): Promise<void> => {
  const { roleId } = req.params;
  if (roleId === ROLES.ADMIN) {
    sendError(res, 400, '관리자 역할은 기능 예외를 받지 않습니다. 사이트 전체 스위치를 쓰세요.');
    return;
  }
  const parsed = parseRuleChanges(req.body);
  if ('error' in parsed) {
    sendError(res, 400, parsed.error);
    return;
  }
  try {
    const role = await Role.findByPk(roleId, { attributes: ['id', 'name'] });
    if (!role) {
      sendError(res, 404, '역할을 찾을 수 없습니다.');
      return;
    }
    await featureFlagService.setRules('role', roleId, parsed.changes, req.user.id);
    await auditLogService.createAuditLog({
      actorId: req.user.id,
      actorName: req.user.name ?? req.user.id,
      action: 'update_site_settings',
      targetType: 'setting',
      targetId: `features:role:${roleId}`,
      targetName: `역할별 기능 (${role.name})`,
      afterValue: parsed.changes,
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, {
      groups: FEATURE_GROUPS,
      features: await featureFlagService.listForAdmin(),
    });
  } catch (err) {
    logError('역할별 기능 저장 실패', err, { adminId: req.user.id, roleId });
    sendError(res, 500, '역할별 기능을 저장하지 못했습니다.');
  }
};

/** GET /api/admin/features/users/:userId — 한 사람의 기능별 사이트·역할·개인 값 */
export const getUserFeatureRules = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.params.userId, { attributes: ['id', 'roleId'] });
    if (!user) {
      sendError(res, 404, '사용자를 찾을 수 없습니다.');
      return;
    }
    sendSuccess(res, {
      isAdmin: user.roleId === ROLES.ADMIN,
      features: await featureFlagService.describeForUser({ id: user.id, roleId: user.roleId }),
    });
  } catch (err) {
    logError('개인 기능 조회 실패', err, { userId: req.params.userId });
    sendError(res, 500, '개인 기능 설정을 불러오지 못했습니다.');
  }
};

/** PUT /api/admin/features/users/:userId — 개인 예외. null 이면 역할 설정을 따른다. */
export const updateUserFeatureRules = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = parseRuleChanges(req.body);
  if ('error' in parsed) {
    sendError(res, 400, parsed.error);
    return;
  }
  try {
    const user = await User.findByPk(req.params.userId, { attributes: ['id', 'name', 'roleId'] });
    if (!user) {
      sendError(res, 404, '사용자를 찾을 수 없습니다.');
      return;
    }
    if (user.roleId === ROLES.ADMIN) {
      sendError(res, 400, '관리자는 기능 예외를 받지 않습니다.');
      return;
    }
    await featureFlagService.setRules('user', user.id, parsed.changes, req.user.id);
    await auditLogService.createAuditLog({
      actorId: req.user.id,
      actorName: req.user.name ?? req.user.id,
      action: 'update_site_settings',
      targetType: 'setting',
      targetId: `features:user:${user.id}`,
      targetName: `개인 기능 예외 (${user.name})`,
      afterValue: parsed.changes,
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, {
      isAdmin: false,
      features: await featureFlagService.describeForUser({ id: user.id, roleId: user.roleId }),
    });
  } catch (err) {
    logError('개인 기능 저장 실패', err, { adminId: req.user.id, userId: req.params.userId });
    sendError(res, 500, '개인 기능 설정을 저장하지 못했습니다.');
  }
};

/** 저장된 숨김 목록. 깨진 값이나 카탈로그에서 사라진 키는 버린다. */
function parseHiddenMenus(raw: string | null | undefined): FeatureKey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is FeatureKey => isFeatureKey(k)) : [];
  } catch {
    return [];
  }
}

/** GET /api/features/hidden-menus — 본인이 사이드바에서 숨긴 메뉴 */
export const getHiddenMenus = async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  try {
    const row = await User.findByPk(user.id, { attributes: ['id', 'hiddenMenus'] });
    sendSuccess(res, parseHiddenMenus(row?.hiddenMenus));
  } catch (err) {
    logError('숨긴 메뉴 조회 실패', err, { userId: user.id });
    sendError(res, 500, '메뉴 설정을 불러오지 못했습니다.');
  }
};

/** PUT /api/features/hidden-menus — 숨길 메뉴 목록을 통째로 바꾼다. 권한이 아니라 보기 설정이다. */
export const updateHiddenMenus = async (req: Request, res: Response): Promise<void> => {
  const { user } = req as AuthRequest;
  const body = req.body as { hiddenMenus?: unknown } | undefined;
  const list = body?.hiddenMenus;
  if (!Array.isArray(list) || list.some(k => typeof k !== 'string' || !isFeatureKey(k))) {
    sendError(res, 400, 'hiddenMenus 는 기능 키 배열이어야 합니다.');
    return;
  }
  const unique = [...new Set(list as FeatureKey[])];
  try {
    await User.update({ hiddenMenus: JSON.stringify(unique) }, { where: { id: user.id } });
    sendSuccess(res, unique);
  } catch (err) {
    logError('숨긴 메뉴 저장 실패', err, { userId: user.id });
    sendError(res, 500, '메뉴 설정을 저장하지 못했습니다.');
  }
};
