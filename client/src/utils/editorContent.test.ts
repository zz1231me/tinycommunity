import { describe, expect, it } from 'vitest';
import { hasEditorContent } from './editorContent';

// 글을 보낼 때의 '내용 없음' 판정과 템플릿이 덮어도 되는지의 판정은 같아야 한다.
describe('본문에 내용이 있는가', () => {
  it('글자가 있으면 내용이다', () => {
    expect(hasEditorContent('<p>쓰던 글</p>')).toBe(true);
  });

  it('빈 태그뿐이면 내용이 아니다', () => {
    expect(hasEditorContent('')).toBe(false);
    expect(hasEditorContent('<p></p>')).toBe(false);
    expect(hasEditorContent('<p>&nbsp;</p>')).toBe(false);
  });

  it('글자가 없어도 그림·영상이 있으면 내용이다 — 말없이 덮으면 그림이 사라진다', () => {
    expect(hasEditorContent('<p><img src="/uploads/a.png"></p>')).toBe(true);
    expect(hasEditorContent('<figure class="image"><img src="x"></figure>')).toBe(true);
    expect(hasEditorContent('<iframe src="https://example.com"></iframe>')).toBe(true);
  });
});
