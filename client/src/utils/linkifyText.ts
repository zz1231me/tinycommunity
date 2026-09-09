// client/src/utils/linkifyText.ts
// 평문에서 링크로 만들 부분을 찾아 조각으로 나눈다.
//
// HTML 을 만들어 주입하지 않고 조각만 돌려주는 이유: 호출부가 React 요소로 그리면
// 텍스트는 React 가 알아서 이스케이프한다. 정화기를 한 벌 더 두거나 원시 HTML 을
// 그대로 밀어 넣는 경로를 만들 필요가 없다 — 메시지는 사용자가 쓴 글 그대로라
// 그런 표면을 아예 만들지 않는 편이 낫다.

export type TextSegment =
  { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

/**
 * http/https 로 시작하거나 www. 로 시작하는 덩어리.
 * 다른 스킴은 애초에 찾지 않는다 — 찾은 뒤 거르는 것보다 찾지 않는 쪽이
 * 빠뜨릴 구석이 없다.
 */
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

/** 문장 끝의 문장부호는 링크에서 뺀다 — "확인하세요: https://a.com." 의 마침표 */
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
