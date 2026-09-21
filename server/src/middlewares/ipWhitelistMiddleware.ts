// DB 의 IP 화이트리스트·블랙리스트와 환경변수 화이트리스트를 함께 본다.

import { Request, Response, NextFunction } from 'express';
import { logWarning } from '../utils/logger';
import { sendForbidden } from '../utils/response';
import { getIpRuleCache, matchesIpRule } from '../services/ipRule.service';

/** 요청 IP 추출. req.ip 만 쓴다. X-Forwarded-For 를 직접 파싱하면 스푸핑된다. */
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
    const cache = await getIpRuleCache();

    // 블랙리스트를 가장 먼저 본다.
    if (cache.blacklist.length > 0) {
      const blocked = cache.blacklist.some(ruleIp => matchesIpRule(clientIp, ruleIp));
      if (blocked) {
        logWarning('블랙리스트 IP 차단', { ip: clientIp, path: req.path });
        sendForbidden(res, '차단된 IP 주소입니다.');
        return;
      }
    }

    // DB 또는 환경변수 화이트리스트가 하나라도 있으면 검증한다.
    const envWhitelist = process.env.ALLOWED_ADMIN_IPS
      ? process.env.ALLOWED_ADMIN_IPS.split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    const combinedWhitelist = [...cache.whitelist, ...envWhitelist];

    if (combinedWhitelist.length === 0) {
      // 화이트리스트가 없으면 전부 허용한다.
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
    // DB 오류 시 환경변수로 폴백한다.
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
