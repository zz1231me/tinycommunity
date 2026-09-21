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

describe('스크롤바 자리', () => {
  beforeEach(() => {
    resetScrollLock();
  });

  it('잠글 때 스크롤바 폭만큼 여백을 주고, 풀 때 되돌린다', () => {
    // 스크롤바가 사라지면 본문이 그 폭만큼 옆으로 튄다. 여백으로 그 자리를 채운다.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1015 });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1000,
    });

    lockScroll();
    expect(document.body.style.paddingRight).toBe('15px');
    unlockScroll();
    expect(document.body.style.paddingRight).toBe('');
  });

  it('겹쳐 잠긴 동안에는 여백이 남아 있는다', () => {
    // 여백을 먼저 빼면 남은 대화상자가 닫힐 때까지 본문이 밀린 채로 있는다.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1015 });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1000,
    });

    lockScroll();
    lockScroll();
    unlockScroll();
    expect(document.body.style.paddingRight).toBe('15px');
    unlockScroll();
    expect(document.body.style.paddingRight).toBe('');
  });
});
