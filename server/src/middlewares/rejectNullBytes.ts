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
// 검사 대상은 경로와 쿼리로 한정한다. 본문은 형식이 제각각이고(파일 업로드 포함)
// 저장 계층이 따로 검증한다.

import { RequestHandler } from 'express';

const NULL_BYTE = String.fromCharCode(0);

function hasNullByte(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NULL_BYTE);
  if (Array.isArray(value)) return value.some(hasNullByte);
  return false;
}

export const rejectNullBytes: RequestHandler = (req, res, next) => {
  // 아직 디코딩되지 않은 주소에는 %00 문자열로 들어온다. 디코딩된 값도 함께 본다.
  const raw = req.originalUrl ?? req.url ?? '';
  const suspicious =
    /%00/i.test(raw) ||
    raw.includes(NULL_BYTE) ||
    Object.values(req.params ?? {}).some(hasNullByte) ||
    Object.values(req.query ?? {}).some(hasNullByte);

  if (!suspicious) return next();

  res.status(400).json({
    success: false,
    message: '요청 주소에 사용할 수 없는 문자가 있습니다.',
  });
};
