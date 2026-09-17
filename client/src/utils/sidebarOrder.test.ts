import { describe, expect, it } from 'vitest';
import { wikiInsertIndex } from './sidebarOrder';

describe('위키가 들어갈 자리', () => {
  it('끌어 옮긴 뒤(0,1,2…)에는 같은 번호 앞에 들어간다', () => {
    expect(wikiInsertIndex([0, 1, 2], 0)).toBe(0);
    expect(wikiInsertIndex([0, 1, 2], 1)).toBe(1);
    expect(wikiInsertIndex([0, 1, 2], 2)).toBe(2);
    expect(wikiInsertIndex([0, 1, 2], 3)).toBe(3);
  });

  it('한 번도 안 옮겨 번호가 띄엄띄엄해도 값으로 견준다', () => {
    // 관리자 화면과 사이드바가 보는 게시판 수가 달라도 결과가 어긋나지 않아야 한다
    expect(wikiInsertIndex([0, 0, 50, 100], 1)).toBe(2);
    expect(wikiInsertIndex([0, 50], 1)).toBe(1);
  });

  it('기본값(큰 수)이면 맨 끝', () => {
    expect(wikiInsertIndex([0, 1, 2], 9999)).toBe(3);
    expect(wikiInsertIndex([], 9999)).toBe(0);
  });
});
