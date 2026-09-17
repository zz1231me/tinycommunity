// client/src/utils/htmlSanitizer.test.ts
// highlightMentions 는 이미 정화된 HTML 을 DOM 으로 다시 조작한다.
// 마크업을 깨뜨리지 않는지, 강조하면 안 되는 위치를 건드리지 않는지 고정한다.

import { describe, expect, it } from 'vitest';
import { highlightMentions } from './htmlSanitizer';

describe('highlightMentions', () => {
  it('텍스트 안의 멘션을 span 으로 감싼다', () => {
    expect(highlightMentions('<p>@alice 확인 부탁</p>')).toBe(
      '<p><span class="mention">@alice</span> 확인 부탁</p>'
    );
  });

  it('한 줄에 여러 멘션을 모두 감싼다', () => {
    const out = highlightMentions('<p>@alice 와 @bobby</p>');
    expect(out).toBe(
      '<p><span class="mention">@alice</span> 와 <span class="mention">@bobby</span></p>'
    );
  });

  it('링크 href 안의 @ 를 건드리지 않는다', () => {
    const html = '<p><a href="mailto:someone@example.com">메일</a></p>';
    expect(highlightMentions(html)).toBe(html);
  });

  it('링크 텍스트 안에서는 강조하지 않는다(링크 속 링크 방지)', () => {
    const html = '<p><a href="/u">@alice</a></p>';
    expect(highlightMentions(html)).toBe(html);
  });

  it('코드 블록 안에서는 강조하지 않는다', () => {
    const html = '<pre><code>const x = "@alice";</code></pre>';
    expect(highlightMentions(html)).toBe(html);
  });

  it('이메일 주소는 멘션으로 보지 않는다', () => {
    const html = '<p>연락처 user@example.com</p>';
    expect(highlightMentions(html)).toBe(html);
  });

  it('아이디 규칙에 맞지 않으면 그대로 둔다', () => {
    expect(highlightMentions('<p>@abc</p>')).toBe('<p>@abc</p>');
  });

  it('중첩 태그 안의 멘션도 찾는다', () => {
    expect(highlightMentions('<p><strong>@alice</strong></p>')).toBe(
      '<p><strong><span class="mention">@alice</span></strong></p>'
    );
  });

  it('@ 가 없으면 원본을 그대로 반환한다', () => {
    const html = '<p>평범한 본문</p>';
    expect(highlightMentions(html)).toBe(html);
  });

  it('빈 값과 비문자열에 안전하다', () => {
    expect(highlightMentions('')).toBe('');
    expect(highlightMentions(null as unknown as string)).toBe(null);
  });

  it('멘션 뒤에 붙은 한글을 잘라내지 않고 보존한다', () => {
    expect(highlightMentions('<p>@alice님 안녕</p>')).toBe(
      '<p><span class="mention">@alice</span>님 안녕</p>'
    );
  });
});
