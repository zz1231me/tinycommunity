/**
 * 에디터 본문에 내용이 있는지 본다. 글자가 없어도 그림·영상이 들어 있으면 내용이다.
 *
 * 글을 보낼 때와 템플릿으로 덮을 때가 같은 기준을 써야 한다. 기준이 어긋나면
 * 그림만 붙여 둔 글이 '빈 글' 로 보여 템플릿이 묻지도 않고 지워 버린다.
 */
export function hasEditorContent(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0 || /<img|<video|<audio|<iframe/i.test(html);
}
