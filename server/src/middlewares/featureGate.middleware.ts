// server/src/middlewares/featureGate.middleware.ts
// 꺼진 기능의 API 를 막는다.
//
// 화면에서 버튼만 숨기면 API 를 직접 호출하는 쪽에는 제약이 걸리지 않는다.
//
// 상태 코드는 404 가 아니라 403 을 쓴다. 리소스가 없는 것과 기능이 꺼진 것을
// 클라이언트가 구분해야 "관리자가 꺼 두었습니다" 로 안내할 수 있다.

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

/**
 * 파일 첨부가 꺼져 있는데 파일이 함께 올라온 요청을 막는다.
 *
 * 글 작성/수정은 파일이 없어도 성립하므로 라우트 전체를 막을 수 없다.
 * multer 가 이미 디스크에 써 둔 뒤라 거절하면서 그 파일들을 지워야 한다 —
 * 그러지 않으면 어디에서도 참조되지 않는 파일이 업로드 폴더에 쌓인다.
 */
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
