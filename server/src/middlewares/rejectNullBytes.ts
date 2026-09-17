// server/src/middlewares/rejectNullBytes.ts
// URL 에 널 바이트(%00)가 섞인 요청을 입구에서 막는다.
//
// 그대로 흘려보내면 조회 단계에서 DB 가 거절한다(SQLite: SequelizeDatabaseError,
// PostgreSQL: invalid byte sequence). 400 이어야 할 요청이 500 으로 나가 오류 로그를
// 채운다.
//
// id 를 받는 모든 경로(글·댓글·위키 등)가 같은 방식으로 실패하므로 컨트롤러마다
// 검사하지 않고 입구에서 한 번만 막는다.
//
// 본문도 함께 본다.
//
// 예전에는 경로와 쿼리만 검사하고 "본문은 저장 계층이 따로 검증한다" 고 두었다.
// 그 전제가 틀렸다 — 메모 제목에 널 바이트를 넣어 보내면 400 이 아니라 201 로 저장됐다.
// SQLite 는 TEXT 에 0x00 을 그냥 담기 때문이다. 위에 적어 둔 그대로, PostgreSQL 은
// invalid byte sequence 로 거절하므로 같은 요청이 운영에서는 500 + 치명 오류 로그가 된다.
// (로컬에 PG 가 없어 그 500 자체를 재현하지는 못했다. 근거는 위 주석과 PG 의 알려진 동작이다.)
//
// 멀티파트(파일 업로드)는 이 시점에 아직 파싱되지 않아 req.body 가 비어 있다 —
// 따로 걸러낼 것이 없다.

import { RequestHandler } from 'express';

const NULL_BYTE = String.fromCharCode(0);

/**
 * 본문 순회 상한.
 *
 * 이 미들웨어는 모든 /api 요청이 지나는 길이고 본문 상한은 maxFileSizeMb + 10 (기본 110MB) 다.
 * 상한 없이 훑으면 거대한 본문 하나가 이벤트 루프를 잡는다. 현실적인 본문은 이 범위 안에 들고,
 * 넘어가는 크기는 그 자체로 이미 비정상이라 완전성보다 응답성을 택한다.
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
  // 아직 디코딩되지 않은 주소에는 %00 문자열로 들어온다. 디코딩된 값도 함께 본다.
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
