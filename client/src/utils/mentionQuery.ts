// @멘션 자동완성의 트리거·검색어·치환 규칙.

/** 검색어 추출 규칙. 영문과 한글을 섞어 받지 않고, 앞에 글자가 붙으면(user@example) 멘션으로 보지 않는다. */
const TRIGGER_RE = /(?:^|[^\p{L}\p{N}_@])@(?:([A-Za-z0-9_]{0,20})|([가-힣]{1,20}))$/u;

/** 서버가 실제로 멘션으로 인식하는 아이디 길이(4~20자) */
export const MENTION_ID_MIN = 4;
export const MENTION_ID_MAX = 20;

export interface MentionQuery {
  /** @ 뒤에 입력된 검색어 (빈 문자열 가능) */
  query: string;
  /** 치환할 구간의 길이 ('@' + query) */
  replaceLength: number;
}

/** 캐럿 앞 텍스트에서 진행 중인 멘션 입력을 찾는다. 없으면 null. */
export function findMentionQuery(textBeforeCaret: string): MentionQuery | null {
  if (!textBeforeCaret) return null;
  const m = textBeforeCaret.match(TRIGGER_RE);
  if (!m) return null;
  // 아이디 쪽(1번)이 빈 문자열일 수 있으므로 ?? 로 고른다 (|| 를 쓰면 '' 가 밀려난다)
  const query = m[1] ?? m[2] ?? '';
  return { query, replaceLength: query.length + 1 };
}

/** 선택한 사용자로 치환할 텍스트. 뒤에 공백을 붙여 바로 이어 쓸 수 있게 한다. */
export function buildMentionText(userId: string): string {
  return `@${userId} `;
}

/** 서버가 멘션으로 인식하는 아이디인지. 4자 미만은 알림이 가지 않는다. */
export function isMentionable(userId: string): boolean {
  return (
    userId.length >= MENTION_ID_MIN &&
    userId.length <= MENTION_ID_MAX &&
    /^[a-zA-Z0-9_]+$/.test(userId)
  );
}
