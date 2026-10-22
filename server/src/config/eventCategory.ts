// 일정 분류(연차·회의 …). 조직마다 다른 목록이라 관리자가 정한다.
//
// 예전에는 화면 코드에 세 벌로 박혀 있었다(고르는 폼·달력 칩 색·관리자 목록 라벨).
// 회사마다 쓰는 말이 다른데(재택·출장·교육…) 바꾸려면 배포를 해야 했다.
// 추첨 상품(lotteryPrizes)처럼 JSON 문자열 한 칸에 목록째로 담는다.
//
// 서버는 Event.category 를 자유 문자열로 저장한다(예전부터 그랬다). 이 목록은
// 화면이 무엇을 보여 줄지 정할 뿐이라, 목록에서 빠진 분류의 옛 일정도 그대로 열린다.

export interface EventCategory {
  /** 저장되는 값. 바꾸면 이미 저장된 일정과 이어지지 않는다. */
  key: string;
  label: string;
  /** 고르는 자리에 함께 보이는 그림문자. 비워도 된다. */
  emoji: string;
  /** 달력 칩의 바탕색. 테두리·글자색은 화면이 이 색에서 계산한다. */
  color: string;
}

/** 처음 설치의 목록. 색은 지금까지 쓰던 팔레트 그대로다. */
export const DEFAULT_EVENT_CATEGORIES: EventCategory[] = [
  { key: 'annual', label: '연차', emoji: '🏖️', color: '#fb7185' },
  { key: 'morning_half', label: '오전반차', emoji: '🌅', color: '#fbbf24' },
  { key: 'afternoon_half', label: '오후반차', emoji: '🌆', color: '#fb923c' },
  { key: 'meeting', label: '회의', emoji: '💼', color: '#6366f1' },
  { key: 'dinner', label: '회식', emoji: '🍻', color: '#2dd4bf' },
  { key: 'etc', label: '기타', emoji: '📝', color: '#94a3b8' },
];

/** 한 번에 둘 수 있는 분류 수. 고르는 자리가 한 줄에 들어갈 만큼만. */
export const MAX_EVENT_CATEGORIES = 20;
const KEY_MAX = 40;
const LABEL_MAX = 20;
const EMOJI_MAX = 8;
/** #rgb · #rrggbb 만 받는다. 화면이 이 값에서 테두리·글자색을 계산한다. */
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** 저장되는 값이라 주소·속성에 그대로 쓰여도 안전한 글자만 */
const KEY_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * 받은 값에서 쓸 수 있는 줄만 남긴다. 하나도 남지 않으면 기본 목록으로 돌린다 —
 * 분류가 비면 일정을 만들 수 없다(폼이 분류를 필수로 받는다).
 */
export function sanitizeEventCategories(input: unknown): EventCategory[] {
  if (!Array.isArray(input)) return DEFAULT_EVENT_CATEGORIES;

  const seen = new Set<string>();
  const out: EventCategory[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const emoji = typeof row.emoji === 'string' ? row.emoji.trim() : '';
    const color = typeof row.color === 'string' ? row.color.trim() : '';

    if (!KEY_RE.test(key) || key.length > KEY_MAX) continue;
    if (!label || label.length > LABEL_MAX) continue;
    if (emoji.length > EMOJI_MAX) continue;
    if (!COLOR_RE.test(color)) continue;
    // 같은 키가 둘이면 어느 쪽이 쓰일지 알 수 없다. 먼저 온 것을 남긴다.
    if (seen.has(key)) continue;

    seen.add(key);
    out.push({ key, label, emoji, color });
    if (out.length >= MAX_EVENT_CATEGORIES) break;
  }
  return out.length > 0 ? out : DEFAULT_EVENT_CATEGORIES;
}

/** 저장된 JSON 을 읽는다. 깨져 있으면 기본 목록. */
export function parseEventCategories(raw: string | null | undefined): EventCategory[] {
  if (!raw) return DEFAULT_EVENT_CATEGORIES;
  try {
    return sanitizeEventCategories(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_EVENT_CATEGORIES;
  }
}
