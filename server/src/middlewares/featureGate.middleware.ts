// 꺼진 기능의 API 를 막는다. 없는 리소스와 구분되도록 404 가 아니라 403 을 쓴다.
//
// 역할·사람별 예외까지 본다. 그러려면 누가 부르는지 알아야 하는데, '/api/events' 처럼
// 라우터 전체 앞에 붙은 곳은 아직 authenticate 를 지나기 전이다. 그렇다고 여기서 로그인을
// 강제하면 임시 공유 내려받기처럼 로그인 없이 쓰는 주소가 막힌다. 그래서 쿠키를 읽어
// 누군지 '알 수 있으면' 그 사람 기준으로, 모르면 사이트 전체 값으로 판정한다.
// 로그인 없는 요청은 뒤의 authenticate 가 따로 막는다.

import { Request, Response, NextFunction, RequestHandler } from 'express';
import fs from 'fs/promises';
import jwt from 'jsonwebtoken';
import { FEATURES, type FeatureKey } from '../config/features';
import { featureFlagService, type FeatureSubject } from '../services/featureFlag.service';
import { env } from '../config/env';
import { JWT_ALGORITHM } from '../config/constants';
import User from '../models/User';
import type { AuthRequest } from '../types/auth-request';

const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { roleId: string; at: number }>();

/** 이미 인증을 지났으면 그 사람, 아니면 쿠키로 알아낸다. 모르면 null. */
async function identify(req: Request): Promise<FeatureSubject | null> {
  const user = (req as Partial<AuthRequest>).user;
  if (user?.id && user.role) return { id: user.id, roleId: user.role };

  const token = req.cookies?.access_token as string | undefined;
  if (!token) return null;
  let id: string;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as {
      id: string;
      type?: string;
    };
    if (decoded.type === '2fa_pending') return null;
    id = decoded.id;
  } catch {
    return null; // 만료·위조 토큰은 뒤의 authenticate 가 알맞게 답한다
  }

  const cached = roleCache.get(id);
  if (cached && Date.now() - cached.at < ROLE_CACHE_TTL_MS) return { id, roleId: cached.roleId };
  const row = await User.findByPk(id, { attributes: ['id', 'roleId'] });
  if (!row) return null;
  roleCache.set(id, { roleId: row.roleId, at: Date.now() });
  return { id, roleId: row.roleId };
}

export function requireFeature(key: FeatureKey): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const subject = await identify(req);
    const enabled = subject
      ? await featureFlagService.isEnabledFor(key, subject)
      : await featureFlagService.isEnabled(key);
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

  const subject = await identify(req);
  const enabled = subject
    ? await featureFlagService.isEnabledFor('post.attachments', subject)
    : await featureFlagService.isEnabled('post.attachments');
  if (enabled) return next();

  await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
  res.status(403).json({
    success: false,
    message: '파일 첨부 기능이 꺼져 있습니다. 관리자에게 문의하세요.',
    code: 'FEATURE_DISABLED',
    details: { feature: 'post.attachments' },
  });
};
