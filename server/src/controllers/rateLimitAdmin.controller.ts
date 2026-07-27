// server/src/controllers/rateLimitAdmin.controller.ts - Rate Limiting 관리 컨트롤러
import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { rateLimitManager } from '../middlewares/dynamicRateLimit';
import { RateLimitSettings } from '../models/RateLimitSettings';
import { logInfo, logSuccess, logError, logWarning } from '../utils/logger';
import { sendSuccess, sendError, sendValidationError, sendNotFound } from '../utils/response';

/**
 * ✅ Rate Limiting 설정 목록 조회
 */
export const getRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logInfo('Rate Limiting 설정 조회 요청', { user: req.user?.name, role: req.user?.role });

    const settings = await rateLimitManager.getSettings();
    const stats = rateLimitManager.getStats();

    const formattedSettings = settings.map(setting => ({
      id: setting.id,
      category: setting.category,
      name: setting.name,
      description: setting.description,
      windowMs: setting.windowMs,
      windowDisplay: setting.getWindowMsDisplay(),
      maxRequests: setting.maxRequests,
      enabled: setting.enabled,
      skipSuccessfulRequests: setting.skipSuccessfulRequests,
      skipFailedRequests: setting.skipFailedRequests,
      message: setting.message,
      statusCode: setting.statusCode,
      applyTo: setting.applyTo,
      priority: setting.priority,
      whitelistIPs: setting.getWhitelistIPs(),
      blacklistIPs: setting.getBlacklistIPs(),
      headers: setting.getHeaders(),
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    }));

    sendSuccess(res, {
      settings: formattedSettings,
      stats: {
        ...stats,
        totalSettings: settings.length,
        activeSettings: settings.filter(s => s.enabled).length,
        categories: [...new Set(settings.map(s => s.category))],
      },
    });
  } catch (error: unknown) {
    logError('Rate Limit 설정 조회 실패', error);
    sendError(res, 500, 'Rate Limiting 설정 조회 중 오류가 발생했습니다.');
  }
};

/**
 * ✅ Rate Limiting 설정 생성
 */
export const createRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    logInfo('Rate Limiting 설정 생성 요청', req.body);

    const {
      category,
      name,
      description,
      windowMs,
      maxRequests,
      enabled = true,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      message = '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
      statusCode = 429,
      applyTo,
      priority = 100,
      whitelistIPs = [],
      blacklistIPs = [],
      headers = {},
    } = req.body;

    // ✅ 필수 값 검증
    if (!category || !name || !description || !windowMs || !maxRequests || !applyTo) {
      logWarning('Rate Limiting 필수 필드 누락', {
        category,
        name,
        description,
        windowMs,
        maxRequests,
        applyTo,
      });
      sendValidationError(res, 'fields', '필수 필드가 누락되었습니다.');
      return;
    }

    // ✅ 값 범위 검증
    if (windowMs < 1000 || windowMs > 24 * 60 * 60 * 1000) {
      sendValidationError(res, 'windowMs', '시간 창은 1초 이상 24시간 이하여야 합니다.');
      return;
    }

    if (maxRequests < 1 || maxRequests > 100000) {
      sendValidationError(res, 'maxRequests', '최대 요청 수는 1 이상 100,000 이하여야 합니다.');
      return;
    }

    // ✅ 중복 체크
    const existing = await RateLimitSettings.findOne({
      where: { category, name },
    });

    if (existing) {
      sendValidationError(res, 'name', '이미 존재하는 설정 이름입니다.');
      return;
    }

    // ✅ 설정 생성
    const newSettings = await rateLimitManager.createSettings({
      category,
      name,
      description,
      windowMs,
      maxRequests,
      enabled,
      skipSuccessfulRequests,
      skipFailedRequests,
      message,
      statusCode,
      applyTo,
      priority,
      whitelistIPs: JSON.stringify(whitelistIPs),
      blacklistIPs: JSON.stringify(blacklistIPs),
      headers: JSON.stringify(headers),
    });

    if (newSettings) {
      logSuccess('Rate Limiting 설정 생성 성공', { id: newSettings.id });
      sendSuccess(res, newSettings, 'Rate Limiting 설정이 생성되었습니다.', 201);
    } else {
      sendError(res, 500, '설정 생성에 실패했습니다.');
    }
  } catch (error: unknown) {
    logError('Rate Limit 설정 생성 실패', error);
    sendError(res, 500, 'Rate Limiting 설정 생성 중 오류가 발생했습니다.');
  }
};

/**
 * ✅ Rate Limiting 설정 수정
 */
export const updateRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    logInfo('Rate Limiting 설정 수정 요청', { id, updateData });

    if (!id || isNaN(Number(id))) {
      sendValidationError(res, 'id', '유효하지 않은 설정 ID입니다.');
      return;
    }

    // ✅ IP 목록과 헤더를 JSON으로 변환
    if (updateData.whitelistIPs) {
      updateData.whitelistIPs = JSON.stringify(updateData.whitelistIPs);
    }
    if (updateData.blacklistIPs) {
      updateData.blacklistIPs = JSON.stringify(updateData.blacklistIPs);
    }
    if (updateData.headers) {
      updateData.headers = JSON.stringify(updateData.headers);
    }

    const success = await rateLimitManager.updateSettings(Number(id), updateData);

    if (success) {
      logSuccess('Rate Limiting 설정 수정 성공', { id });
      sendSuccess(res, null, 'Rate Limiting 설정이 업데이트되었습니다.');
    } else {
      sendNotFound(res, 'Rate Limiting 설정');
    }
  } catch (error: unknown) {
    logError('Rate Limit 설정 업데이트 실패', error);
    sendError(res, 500, 'Rate Limiting 설정 업데이트 중 오류가 발생했습니다.');
  }
};

/**
 * ✅ Rate Limiting 설정 삭제
 */
export const deleteRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    logInfo('Rate Limiting 설정 삭제 요청', { id });

    if (!id || isNaN(Number(id))) {
      sendValidationError(res, 'id', '유효하지 않은 설정 ID입니다.');
      return;
    }

    const success = await rateLimitManager.deleteSettings(Number(id));

    if (success) {
      logSuccess('Rate Limiting 설정 삭제 성공', { id });
      sendSuccess(res, null, 'Rate Limiting 설정이 삭제되었습니다.');
    } else {
      sendNotFound(res, 'Rate Limiting 설정');
    }
  } catch (error: unknown) {
    logError('Rate Limit 설정 삭제 실패', error);
    sendError(res, 500, 'Rate Limiting 설정 삭제 중 오류가 발생했습니다.');
  }
};

/**
 * ✅ Rate Limiting 설정 토글 (활성화/비활성화)
 */
export const toggleRateLimitSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    logInfo('Rate Limiting 설정 토글 요청', { id });

    if (!id || isNaN(Number(id))) {
      sendValidationError(res, 'id', '유효하지 않은 설정 ID입니다.');
      return;
    }

    const setting = await RateLimitSettings.findByPk(Number(id));
    if (!setting) {
      sendNotFound(res, 'Rate Limiting 설정');
      return;
    }

    const success = await rateLimitManager.updateSettings(Number(id), {
      enabled: !setting.enabled,
    });

    if (success) {
      logSuccess('Rate Limiting 토글 성공', { id, enabled: !setting.enabled });
      sendSuccess(
        res,
        { enabled: !setting.enabled },
        `Rate Limiting이 ${setting.enabled ? '비활성화' : '활성화'}되었습니다.`
      );
    } else {
      sendError(res, 500, '설정 변경에 실패했습니다.');
    }
  } catch (error: unknown) {
    logError('Rate Limit 설정 토글 실패', error);
    sendError(res, 500, 'Rate Limiting 설정 토글 중 오류가 발생했습니다.');
  }
};

/**
 * ✅ Rate Limiting 캐시 새로고침
 */
export const refreshRateLimitCache = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    logInfo('Rate Limiting 캐시 새로고침 요청');

    await rateLimitManager.refreshCache();
    const stats = rateLimitManager.getStats();

    logSuccess('Rate Limiting 캐시 새로고침 완료', stats);
    sendSuccess(res, stats, 'Rate Limiting 캐시가 새로고침되었습니다.');
  } catch (error: unknown) {
    logError('Rate Limit 캐시 새로고침 실패', error);
    sendError(res, 500, 'Rate Limiting 캐시 새로고침 중 오류가 발생했습니다.');
  }
};

/**
 * ✅ Rate Limiting 프리셋 적용
 */
export const applyRateLimitPreset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { preset } = req.params; // 'strict', 'moderate', 'lenient'

    logInfo('Rate Limiting 프리셋 적용 요청', { preset });

    const presets: Record<string, Record<string, { windowMs: number; maxRequests: number }>> = {
      strict: {
        auth: { windowMs: 10 * 60 * 1000, maxRequests: 5 },
        api: { windowMs: 10 * 60 * 1000, maxRequests: 100 },
        upload: { windowMs: 30 * 60 * 1000, maxRequests: 10 },
      },
      moderate: {
        auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
        api: { windowMs: 15 * 60 * 1000, maxRequests: 1000 },
        upload: { windowMs: 60 * 60 * 1000, maxRequests: 50 },
      },
      lenient: {
        auth: { windowMs: 15 * 60 * 1000, maxRequests: 20 },
        api: { windowMs: 15 * 60 * 1000, maxRequests: 5000 },
        upload: { windowMs: 60 * 60 * 1000, maxRequests: 100 },
      },
    };

    const selectedPreset = presets[preset];
    if (!selectedPreset) {
      sendValidationError(
        res,
        'preset',
        '유효하지 않은 프리셋입니다. (strict, moderate, lenient 중 선택)'
      );
      return;
    }

    let updatedCount = 0;
    for (const [category, settings] of Object.entries(selectedPreset)) {
      const existing = await RateLimitSettings.findOne({
        where: { category },
      });

      if (existing) {
        const updateData: Partial<RateLimitSettings> = {
          windowMs: settings.windowMs,
          maxRequests: settings.maxRequests,
        };

        const success = await rateLimitManager.updateSettings(existing.id!, updateData);
        if (success) {
          updatedCount++;
          logSuccess(`${category} 카테고리 설정 업데이트됨`, settings);
        }
      }
    }

    logSuccess('프리셋 적용 완료', { preset, updatedCount });
    sendSuccess(
      res,
      {
        preset,
        updatedSettings: updatedCount,
        appliedSettings: selectedPreset,
      },
      `${preset} 프리셋이 적용되었습니다.`
    );
  } catch (error: unknown) {
    logError('Rate Limit 프리셋 적용 실패', error);
    sendError(res, 500, 'Rate Limiting 프리셋 적용 중 오류가 발생했습니다.');
  }
};
