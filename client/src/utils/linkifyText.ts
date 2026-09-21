// 평문에서 링크로 만들 부분을 찾아 조각으로 나눈다.
// HTML 을 만들지 않고 조각만 돌려줘야 호출부의 React 렌더가 이스케이프를 맡는다.

export type TextSegment =
  { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

/** http/https 또는 www. 로 시작하는 덩어리. 다른 스킴은 애초에 찾지 않는다. */
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

/** 문장 끝의 문장부호는 링크에서 뺀다 */
const TRAILING = /[.,;:!?)\]}'"]+$/;

export function linkifyText(text: string): TextSegment[] {
  if (!text) return [];

  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let raw = match[0];

    // 뒤에 붙은 문장부호를 떼어 본문으로 돌려보낸다
    const trailing = raw.match(TRAILING)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({
      type: 'link',
      value: raw,
      // www. 로 시작하면 스킴을 붙여야 상대 경로로 해석되지 않는다
      href: /^www\./i.test(raw) ? `https://${raw}` : raw,
    });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
