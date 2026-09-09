import { renderContentToHTML } from '../utils/contentRenderer';

// 서버 측 sanitize-html이 동영상 임베드(iframe)를 신뢰 호스트만 통과시키는지 검증.
// client/src/utils/htmlSanitizer.ts의 DOMPurify allowlist와 동기화되어야 한다.

const wrap = (iframe: string) => `<figure class="media"><div>${iframe}</div></figure>`;

describe('renderContentToHTML — 동영상 임베드 iframe allowlist', () => {
  it('YouTube embed iframe을 유지한다', () => {
    const out = renderContentToHTML(
      wrap('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')
    );
    expect(out).toMatch(/<iframe[^>]+youtube\.com\/embed\/dQw4w9WgXcQ/);
  });

  it('Vimeo embed iframe을 유지한다', () => {
    const out = renderContentToHTML(
      wrap('<iframe src="https://player.vimeo.com/video/123"></iframe>')
    );
    expect(out).toMatch(/player\.vimeo\.com\/video\/123/);
  });

  it('살아남은 iframe에 referrerpolicy/loading을 강제한다', () => {
    const out = renderContentToHTML(
      wrap('<iframe src="https://www.youtube.com/embed/abc"></iframe>')
    );
    expect(out).toMatch(/referrerpolicy="strict-origin-when-cross-origin"/);
    expect(out).toMatch(/loading="lazy"/);
  });

  it('신뢰하지 않는 호스트(evil.com) iframe을 제거한다', () => {
    const out = renderContentToHTML(wrap('<iframe src="https://evil.com/phish"></iframe>'));
    expect(out).not.toMatch(/<iframe/);
  });

  it('서브도메인 트릭(youtube.com.evil.com)을 제거한다', () => {
    const out = renderContentToHTML(
      wrap('<iframe src="https://www.youtube.com.evil.com/embed/x"></iframe>')
    );
    expect(out).not.toMatch(/<iframe/);
  });

  it('프로토콜 상대 URL(//youtube)을 제거한다', () => {
    const out = renderContentToHTML(wrap('<iframe src="//www.youtube.com/embed/x"></iframe>'));
    expect(out).not.toMatch(/<iframe/);
  });

  it('호스트는 맞지만 경로가 다른 iframe(youtube.com/watch)을 제거한다', () => {
    const out = renderContentToHTML(
      wrap('<iframe src="https://www.youtube.com/watch?v=x"></iframe>')
    );
    expect(out).not.toMatch(/<iframe/);
  });

  it('javascript: 스킴 iframe을 제거한다', () => {
    const out = renderContentToHTML(wrap('<iframe src="javascript:alert(1)"></iframe>'));
    expect(out).not.toMatch(/<iframe/);
  });

  it('iframe의 on* 이벤트 핸들러를 제거한다', () => {
    const out = renderContentToHTML(
      wrap('<iframe src="https://www.youtube.com/embed/x" onload="alert(1)"></iframe>')
    );
    expect(out).not.toMatch(/onload/);
  });

  it('position:fixed(클릭재킹)는 제거하고 position:absolute는 유지한다', () => {
    const fixed = renderContentToHTML('<p style="position:fixed;top:0">x</p>');
    expect(fixed).not.toMatch(/position/);
    const abs = renderContentToHTML('<div style="position:absolute;top:0">x</div>');
    expect(abs).toMatch(/position:\s*absolute/);
  });
});

// 문단별 첨부(증적) 참조 — 클라이언트 htmlSanitizer 와 같은 규칙이어야 한다.
// 서버 쪽이 더 엄격하면 OG/검색 미리보기 경로에서 증적이 사라진다.
describe('renderContentToHTML — 문단별 첨부 참조', () => {
  it('attachment-ref span 의 data-attachment 를 보존한다', () => {
    const out = renderContentToHTML(
      '<p>1단계 <span class="attachment-ref" data-attachment="결과.xlsx">결과.xlsx</span></p>'
    );
    expect(out).toContain('data-attachment="결과.xlsx"');
    expect(out).toContain('attachment-ref');
  });

  it('그 밖의 data-* 는 계속 제거한다', () => {
    const out = renderContentToHTML('<p><span data-evil="x" data-attachment="a.txt">x</span></p>');
    expect(out).not.toContain('data-evil');
    expect(out).toContain('data-attachment="a.txt"');
  });

  it('참조에 이벤트 핸들러를 붙여도 통과하지 않는다', () => {
    const out = renderContentToHTML(
      '<span class="attachment-ref" data-attachment="a.txt" onclick="alert(1)">a</span>'
    );
    expect(out).not.toContain('onclick');
  });
});

// 체크리스트(CKEditor TodoList).
// <input> 을 허용하는 순간 본문에 조작 가능한 입력칸이 생길 수 있으므로,
// "표시용 체크박스" 를 벗어나지 못하게 하는 것이 이 규칙의 전부다.
describe('renderContentToHTML — 체크리스트', () => {
  const CHECKLIST =
    '<ul class="todo-list"><li><label class="todo-list__label">' +
    '<input type="checkbox" disabled="disabled" checked="checked">' +
    '<span class="todo-list__label__description">1단계 완료</span></label></li></ul>';

  it('체크리스트 마크업을 보존한다', () => {
    const out = renderContentToHTML(CHECKLIST);
    expect(out).toContain('todo-list');
    expect(out).toContain('<input');
    expect(out).toContain('checked');
    expect(out).toContain('1단계 완료');
  });

  it('체크 안 된 항목도 보존한다', () => {
    const out = renderContentToHTML(
      '<ul class="todo-list"><li><label><input type="checkbox" disabled></label></li></ul>'
    );
    expect(out).toContain('<input');
    expect(out).not.toContain('checked');
  });

  it('checkbox 가 아닌 input 은 checkbox 로 바꾼다', () => {
    // text·password·file 입력이 본문에 생기면 그 자체로 사고다
    const out = renderContentToHTML('<input type="text" name="pw" value="x">');
    expect(out).toContain('type="checkbox"');
    expect(out).not.toContain('type="text"');
    expect(out).not.toContain('name=');
    expect(out).not.toContain('value=');
  });

  it('항상 disabled 로 강제한다 — 본문의 체크박스는 표시일 뿐이다', () => {
    const out = renderContentToHTML('<input type="checkbox">');
    expect(out).toContain('disabled');
  });

  it('input 에 붙은 이벤트 핸들러와 스타일은 제거한다', () => {
    const out = renderContentToHTML(
      '<input type="checkbox" onclick="alert(1)" onfocus="alert(2)" style="position:fixed">'
    );
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onfocus');
    expect(out).not.toContain('position');
  });

  it('input type=image 로 스크립트를 끌어오지 못한다', () => {
    // src·onerror 조합은 고전적인 우회 경로다
    const out = renderContentToHTML('<input type="image" src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('src=');
    expect(out).toContain('type="checkbox"');
  });
});
