// server/src/controllers/featureFlag.controller.ts
// 기능 스위치 조회(모든 사용자)와 변경(관리자).

import { Request, Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { FEATURE_GROUPS, isFeatureKey } from '../config/features';
import { featureFlagService } from '../services/featureFlag.service';
import { auditLogService } from '../services/auditLog.service';

/**
 * GET /api/features — 지금 켜져 있는 기능들.
 * 화면이 없는 기능의 메뉴·버튼을 숨기는 데 쓴다. 인증만 요구하고 역할은 보지 않는다 —
 * 어떤 기능이 켜져 있는지는 로그인한 사람이면 어차피 화면에서 알 수 있는 정보다.
 */
export const getEnabledFeatures = async (_req: Request, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await featureFlagService.getAll());
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

  // 모르는 키를 조용히 버리면 관리자는 저장했다고 믿는데 아무 일도 일어나지 않는다
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

    // 기능 스위치는 운영자 입장에서 사이트 설정의 일부다.
    // 전용 action 값을 새로 만들면 감사 로그 ENUM 컬럼을 손봐야 해서
    // 기존 update_site_settings 를 쓰고, 무엇이 바뀌었는지는 값에 남긴다.
    await auditLogService.createAuditLog({
      adminId: req.user.id,
      adminName: req.user.name ?? req.user.id,
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
