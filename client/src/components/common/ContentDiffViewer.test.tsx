// 수정 이력 비교 화면이 본문을 어떻게 내놓는가.
//
// 이 컴포넌트는 diff2html 이 만든 HTML 을 dangerouslySetInnerHTML 로 꽂는다.
// "라이브러리가 만든 HTML 이라 사용자 입력이 아니다" 라고 적혀 있지만, 그 HTML 안에는
// 비교 대상인 본문이 그대로 들어간다 — 본문에 들어 있던 태그가 살아난다면 여기가
// 구멍이다. 글 본문은 2026-10-19 부터 저장할 때 씻지만, 그 전에 쓰인 글과 그 이력에는
// 씻지 않은 값이 남아 있다.
//
// 그래서 '라이브러리를 믿는다' 가 아니라 실제로 무엇이 나오는지를 본다.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ContentDiffViewer } from './ContentDiffViewer';

const EVIL = '<img src=x onerror="window.__xss=1">';

describe('이력 비교에 끼어든 태그', () => {
  it('본문에 있던 태그가 살아나지 않는다', () => {
    const { container } = render(
      <ContentDiffViewer contentA="<p>처음</p>" contentB={`<p>고침</p>${EVIL}`} />
    );

    // 살아 있는 노드로 붙었는지 본다. 글자로 보이는 것은 괜찮다.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror=');
  });

  it('바뀐 내용은 글자로 보인다 — 양성 대조', () => {
    // 이것이 없으면 '아무것도 그리지 않는' 구현도 위를 통과한다
    const { container } = render(
      <ContentDiffViewer contentA="<p>처음</p>" contentB="<p>고침</p>" />
    );

    expect(container.textContent).toContain('고침');
  });
});
