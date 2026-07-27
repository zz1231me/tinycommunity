import { renderTiptapToHTML } from '../utils/tiptapRenderer';

// 서버 측 sanitize-html이 동영상 임베드(iframe)를 신뢰 호스트만 통과시키는지 검증.
// client/src/utils/htmlSanitizer.ts의 DOMPurify allowlist와 동기화되어야 한다.

const wrap = (iframe: string) => `<figure class="media"><div>${iframe}</div></figure>`;

describe('renderTiptapToHTML — 동영상 임베드 iframe allowlist', () => {
  it('YouTube embed iframe을 유지한다', () => {
    const out = renderTiptapToHTML(
      wrap('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')
    );
    expect(out).toMatch(/<iframe[^>]+youtube\.com\/embed\/dQw4w9WgXcQ/);
  });

  it('Vimeo embed iframe을 유지한다', () => {
    const out = renderTiptapToHTML(
      wrap('<iframe src="https://player.vimeo.com/video/123"></iframe>')
    );
    expect(out).toMatch(/player\.vimeo\.com\/video\/123/);
  });

  it('살아남은 iframe에 referrerpolicy/loading을 강제한다', () => {
    const out = renderTiptapToHTML(
      wrap('<iframe src="https://www.youtube.com/embed/abc"></iframe>')
    );
    expect(out).toMatch(/referrerpolicy="strict-origin-when-cross-origin"/);
    expect(out).toMatch(/loading="lazy"/);
  });

  it('신뢰하지 않는 호스트(evil.com) iframe을 제거한다', () => {
    const out = renderTiptapToHTML(wrap('<iframe src="https://evil.com/phish"></iframe>'));
    expect(out).not.toMatch(/<iframe/);
  });

  it('서브도메인 트릭(youtube.com.evil.com)을 제거한다', () => {
    const out = renderTiptapToHTML(
      wrap('<iframe src="https://www.youtube.com.evil.com/embed/x"></iframe>')
    );
    expect(out).not.toMatch(/<iframe/);
  });

  it('프로토콜 상대 URL(//youtube)을 제거한다', () => {
    const out = renderTiptapToHTML(wrap('<iframe src="//www.youtube.com/embed/x"></iframe>'));
    expect(out).not.toMatch(/<iframe/);
  });

  it('호스트는 맞지만 경로가 다른 iframe(youtube.com/watch)을 제거한다', () => {
    const out = renderTiptapToHTML(
      wrap('<iframe src="https://www.youtube.com/watch?v=x"></iframe>')
    );
    expect(out).not.toMatch(/<iframe/);
  });

  it('javascript: 스킴 iframe을 제거한다', () => {
    const out = renderTiptapToHTML(wrap('<iframe src="javascript:alert(1)"></iframe>'));
    expect(out).not.toMatch(/<iframe/);
  });

  it('iframe의 on* 이벤트 핸들러를 제거한다', () => {
    const out = renderTiptapToHTML(
      wrap('<iframe src="https://www.youtube.com/embed/x" onload="alert(1)"></iframe>')
    );
    expect(out).not.toMatch(/onload/);
  });

  it('position:fixed(클릭재킹)는 제거하고 position:absolute는 유지한다', () => {
    const fixed = renderTiptapToHTML('<p style="position:fixed;top:0">x</p>');
    expect(fixed).not.toMatch(/position/);
    const abs = renderTiptapToHTML('<div style="position:absolute;top:0">x</div>');
    expect(abs).toMatch(/position:\s*absolute/);
  });
});
