// client/src/utils/mentionQuery.ts
// @멘션 자동완성의 "언제 뜨고, 무엇을 검색하고, 무엇으로 치환하는가" 규칙.
//
// CKEditor 접합부와 분리해 둔 이유: 이 판단이 자동완성 동작의 전부인데,
// 에디터에 붙은 채로는 테스트하기 어렵기 때문이다.

/**
 * 자동완성에 넘길 검색어를 뽑는 규칙.
 *
 * 아이디는 서버(mention.service 의 MENTION_RE)와 같은 문자 집합이지만,
 * 검색어는 한글 이름도 받는다. 아이디를 모르는 상대도 멘션할 수 있어야 한다.
 *
 * 영문과 한글을 섞어 받지는 않는다. 섞으면 `@alice님이` 처럼 멘션 뒤에 붙은 조사까지
 * 검색어로 삼아 빈 목록이 따라다닌다.
 *
 * 앞에 글자가 붙어 있으면(user@example, 홍길동@abc) 멘션이 아니라 이메일 등으로 본다.
 */
const TRIGGER_RE = /(?:^|[^\p{L}\p{N}_@])@(?:([A-Za-z0-9_]{0,20})|([가-힣]{1,20}))$/u;

/** 서버가 실제로 멘션으로 인식하는 아이디 길이(4~20자) */
export const MENTION_ID_MIN = 4;
export const MENTION_ID_MAX = 20;

export interface MentionQuery {
  /** @ 뒤에 입력된 검색어 (빈 문자열 가능) */
  query: string;
  /** 치환해야 할 구간의 길이 — '@' + query */
  replaceLength: number;
}

/**
 * 캐럿 바로 앞의 텍스트에서 진행 중인 멘션 입력을 찾는다.
 * 멘션 입력 중이 아니면 null.
 */
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

/**
 * 이 아이디가 서버에서 실제로 멘션으로 인식되는지.
 * 4자 미만 아이디는 서버 정규식에 걸리지 않아 알림이 가지 않으므로,
 * 자동완성 목록에서 그 사실을 알려주기 위해 쓴다.
 */
export function isMentionable(userId: string): boolean {
  return (
    userId.length >= MENTION_ID_MIN &&
    userId.length <= MENTION_ID_MAX &&
    /^[a-zA-Z0-9_]+$/.test(userId)
  );
}
