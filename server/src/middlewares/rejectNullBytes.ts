// URL·쿼리·본문에 널 바이트(%00)가 섞인 요청을 입구에서 400으로 막는다.
// 본문까지 보는 이유: SQLite는 0x00을 그대로 저장하고 PostgreSQL은 invalid byte sequence로 500이 된다.

import { RequestHandler } from 'express';

const NULL_BYTE = String.fromCharCode(0);

/**
 * 본문 순회 상한. 모든 /api 요청이 지나므로 거대한 본문이 이벤트 루프를 잡지 않게 한다.
 */
const MAX_NODES = 10_000;
const MAX_DEPTH = 6;

function hasNullByte(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NULL_BYTE);
  if (Array.isArray(value)) return value.some(hasNullByte);
  return false;
}

/** 본문 안의 문자열을 상한 안에서 훑는다 */
function bodyHasNullByte(value: unknown, budget: { left: number }, depth = 0): boolean {
  if (budget.left <= 0 || depth > MAX_DEPTH) return false;
  budget.left -= 1;

  if (typeof value === 'string') return value.includes(NULL_BYTE);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (bodyHasNullByte(item, budget, depth + 1)) return true;
      if (budget.left <= 0) return false;
    }
    return false;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      if (bodyHasNullByte(item, budget, depth + 1)) return true;
      if (budget.left <= 0) return false;
    }
  }
  return false;
}

export const rejectNullBytes: RequestHandler = (req, res, next) => {
  // 디코딩 전 주소에는 %00 문자열로 들어오므로 디코딩된 값도 함께 본다.
  const raw = req.originalUrl ?? req.url ?? '';
  const inUrl =
    /%00/i.test(raw) ||
    raw.includes(NULL_BYTE) ||
    Object.values(req.params ?? {}).some(hasNullByte) ||
    Object.values(req.query ?? {}).some(hasNullByte);

  if (inUrl) {
    res.status(400).json({
      success: false,
      message: '요청 주소에 사용할 수 없는 문자가 있습니다.',
    });
    return;
  }

  if (bodyHasNullByte(req.body, { left: MAX_NODES })) {
    res.status(400).json({
      success: false,
      message: '요청 내용에 사용할 수 없는 문자가 있습니다.',
    });
    return;
  }

  next();
};
