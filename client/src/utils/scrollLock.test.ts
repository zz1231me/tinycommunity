// client/src/utils/scrollLock.test.ts
// 대화상자가 겹쳐 열릴 때 배경 잠금이 어긋나지 않는지.
//
// 각자 body.style.overflow 를 만지던 시절의 두 가지 고장을 그대로 재현한다:
// 안쪽이 닫히며 바깥 잠금까지 풀리는 것, 그리고 잠금이 영영 남아 닫았는데도
// 페이지가 스크롤되지 않는 것.

import { beforeEach, describe, expect, it } from 'vitest';
import { lockScroll, resetScrollLock, unlockScroll } from './scrollLock';

describe('scrollLock', () => {
  beforeEach(() => {
    resetScrollLock();
  });

  it('하나만 열려도 배경이 잠기고, 닫으면 원래대로 돌아온다', () => {
    lockScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockScroll();
    expect(document.body.style.overflow).toBe('');
  });

  it('겹쳐 열린 뒤 안쪽만 닫혀도 배경은 잠긴 채로 남는다', () => {
    lockScroll(); // 바깥 대화상자
    lockScroll(); // 그 위에 열린 확인 상자
    unlockScroll(); // 확인 상자만 닫힘
    expect(document.body.style.overflow).toBe('hidden');
    unlockScroll(); // 바깥까지 닫힘
    expect(document.body.style.overflow).toBe('');
  });

  it('잠그기 전의 overflow 값을 기억했다가 되돌린다', () => {
    document.body.style.overflow = 'scroll';
    lockScroll();
    lockScroll();
    unlockScroll();
    unlockScroll();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('짝이 맞지 않는 unlock 이 더 와도 다음 잠금을 망가뜨리지 않는다', () => {
    unlockScroll();
    unlockScroll();
    lockScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockScroll();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('마지막 하나가 풀렸는지 알려 준다', () => {
  beforeEach(() => {
    resetScrollLock();
  });

  it('겹쳐 잠긴 동안에는 false, 마지막에만 true', () => {
    // 사진 뷰어는 스크롤바가 사라진 만큼 본문에 여백을 준다. 아직 다른 대화상자가
    // 잠가 두고 있는데 그 여백을 먼저 빼면 본문이 스크롤바 폭만큼 옆으로 밀린다.
    lockScroll();
    lockScroll();
    expect(unlockScroll()).toBe(false);
    expect(unlockScroll()).toBe(true);
  });

  it('잠근 적이 없으면 false', () => {
    expect(unlockScroll()).toBe(false);
  });
});
