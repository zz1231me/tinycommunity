// server/src/middlewares/ipWhitelistMiddleware.ts
// DB 기반 IP 화이트리스트/블랙리스트 + 환경변수 화이트리스트 통합

import { Request, Response, NextFunction } from 'express';
import { logWarning } from '../utils/logger';
import { sendForbidden } from '../utils/response';
import { getIpRuleCache, matchesIpRule } from '../services/ipRule.service';

/** 요청 IP 추출 및 정규화
 *  ⚠️ 반드시 `req.ip`만 사용 — Express의 `trust proxy` 설정을 거친 검증된 값.
 *      `X-Forwarded-For` 헤더를 직접 파싱하면 클라이언트가 헤더를 위조해 IP를 스푸핑할 수 있음.
 */
function extractClientIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || '';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

export const ipWhitelistMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const clientIp = extractClientIp(req);

  try {
    // 1. DB 기반 규칙 로드 (캐시 활용)
    const cache = await getIpRuleCache();

    // 2. 블랙리스트 체크 (가장 먼저)
    if (cache.blacklist.length > 0) {
      const blocked = cache.blacklist.some(ruleIp => matchesIpRule(clientIp, ruleIp));
      if (blocked) {
        logWarning('블랙리스트 IP 차단', { ip: clientIp, path: req.path });
        sendForbidden(res, '차단된 IP 주소입니다.');
        return;
      }
    }

    // 3. 화이트리스트 체크
    //    - DB 화이트리스트 또는 환경변수 ALLOWED_ADMIN_IPS 둘 중 하나라도 있으면 검증
    const envWhitelist = process.env.ALLOWED_ADMIN_IPS
      ? process.env.ALLOWED_ADMIN_IPS.split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    const combinedWhitelist = [...cache.whitelist, ...envWhitelist];

    if (combinedWhitelist.length === 0) {
      // 화이트리스트 미설정 → 전체 허용 (개발 환경)
      logWarning('IP 화이트리스트 미설정 — 모든 IP 허용 중', { ip: clientIp });
      next();
      return;
    }

    const allowed = combinedWhitelist.some(ruleIp => matchesIpRule(clientIp, ruleIp));
    if (allowed) {
      next();
    } else {
      logWarning('화이트리스트에 없는 IP 차단', { ip: clientIp, path: req.path });
      sendForbidden(res, '관리자 페이지 접근이 허용되지 않은 IP입니다.');
    }
  } catch {
    // DB 에러 시 환경변수 폴백
    const envWhitelist = process.env.ALLOWED_ADMIN_IPS
      ? process.env.ALLOWED_ADMIN_IPS.split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    if (envWhitelist.length === 0) {
      next();
      return;
    }
    const allowed = envWhitelist.some(ruleIp => matchesIpRule(clientIp, ruleIp));
    if (allowed) next();
    else sendForbidden(res, '관리자 페이지 접근이 허용되지 않은 IP입니다.');
  }
};
