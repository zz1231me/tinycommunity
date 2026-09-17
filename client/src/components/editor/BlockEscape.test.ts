// 마지막 블록에서 빠져나가는 판단 규칙.
//
// 플러그인 전체는 CKEditor 인스턴스가 있어야 돌아가 여기서 다루지 않는다.
// 대신 "언제 빠져나가야 하는가" 라는 규칙만 떼어 고정한다 — 이 규칙이 느슨해지면
// 평소 이동(줄 사이 이동, 다음 블록으로 이동)까지 가로채게 된다.

import { describe, expect, it } from 'vitest';
import { isClickBelowBlock, needsEscapeHatch, shouldEscapeByArrow } from './BlockEscape';

describe('shouldEscapeByArrow', () => {
  it('코드 블록 끝에서 나갈 곳이 없으면 빠져나간다', () => {
    expect(shouldEscapeByArrow({ blockName: 'codeBlock', atEdge: true, hasSibling: false })).toBe(
      true
    );
  });

  it('블록 중간이면 줄 사이를 오가야 하므로 가로채지 않는다', () => {
    expect(shouldEscapeByArrow({ blockName: 'codeBlock', atEdge: false, hasSibling: false })).toBe(
      false
    );
  });

  it('나갈 곳이 이미 있으면 브라우저에 맡긴다', () => {
    expect(shouldEscapeByArrow({ blockName: 'codeBlock', atEdge: true, hasSibling: true })).toBe(
      false
    );
  });

  it('갇히지 않는 블록에는 손대지 않는다', () => {
    for (const blockName of ['paragraph', 'heading1', 'table', 'listItem']) {
      expect(shouldEscapeByArrow({ blockName, atEdge: true, hasSibling: false })).toBe(false);
    }
  });
});

describe('needsEscapeHatch', () => {
  it('갇히는 블록이 마지막이면 빠져나갈 길이 필요하다', () => {
    for (const blockName of ['codeBlock', 'blockQuote']) {
      expect(needsEscapeHatch({ blockName, isObject: false })).toBe(true);
    }
  });

  it('위젯이 마지막이면 필요하다 — 아래를 누르면 선택돼 다음 입력이 위젯을 지운다', () => {
    // 표·이미지·구분선처럼 스키마가 object 로 보는 것들
    expect(needsEscapeHatch({ blockName: 'table', isObject: true })).toBe(true);
    expect(needsEscapeHatch({ blockName: 'horizontalLine', isObject: true })).toBe(true);
    expect(needsEscapeHatch({ blockName: 'imageBlock', isObject: true })).toBe(true);
  });

  it('평범한 글 블록은 그대로 둔다 — 아래를 누르면 끝으로 가는 것이 자연스럽다', () => {
    for (const blockName of ['paragraph', 'heading1', 'listItem']) {
      expect(needsEscapeHatch({ blockName, isObject: false })).toBe(false);
    }
  });
});

describe('isClickBelowBlock', () => {
  it('블록 아래를 왼쪽 버튼으로 누르면 참', () => {
    expect(isClickBelowBlock({ button: 0, clientY: 300, blockBottom: 200 })).toBe(true);
  });

  it('블록 안쪽을 누르면 거짓 — 코드를 고치려는 클릭이다', () => {
    expect(isClickBelowBlock({ button: 0, clientY: 150, blockBottom: 200 })).toBe(false);
    expect(isClickBelowBlock({ button: 0, clientY: 200, blockBottom: 200 })).toBe(false);
  });

  it('오른쪽 버튼(맥락 메뉴)은 건드리지 않는다', () => {
    expect(isClickBelowBlock({ button: 2, clientY: 300, blockBottom: 200 })).toBe(false);
  });
});
