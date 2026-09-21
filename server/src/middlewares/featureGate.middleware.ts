// 꺼진 기능의 API 를 막는다. 없는 리소스와 구분되도록 404 가 아니라 403 을 쓴다.

import { Request, Response, NextFunction, RequestHandler } from 'express';
import fs from 'fs/promises';
import { FEATURES, type FeatureKey } from '../config/features';
import { featureFlagService } from '../services/featureFlag.service';

export function requireFeature(key: FeatureKey): RequestHandler {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const enabled = await featureFlagService.isEnabled(key);
    if (enabled) return next();

    res.status(403).json({
      success: false,
      message: `'${FEATURES[key].label}' 기능이 꺼져 있습니다. 관리자에게 문의하세요.`,
      code: 'FEATURE_DISABLED',
      details: { feature: key },
    });
  };
}

/** 첨부가 꺼진 상태에서 파일이 함께 온 요청을 막는다. multer 가 이미 저장한 파일은 지운다. */
export const rejectAttachmentsWhenDisabled: RequestHandler = async (req, res, next) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) return next();

  if (await featureFlagService.isEnabled('post.attachments')) return next();

  await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
  res.status(403).json({
    success: false,
    message: '파일 첨부 기능이 꺼져 있습니다. 관리자에게 문의하세요.',
    code: 'FEATURE_DISABLED',
    details: { feature: 'post.attachments' },
  });
};
