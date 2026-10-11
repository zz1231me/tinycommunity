// /dashboard 로 들어왔을 때 갈 곳. 꺼졌거나 본인이 숨긴 곳으로 보내지 않는다.

import { describe, expect, it } from 'vitest';
import { landingPage } from './menus';

describe('landingPage', () => {
  it('모두 켜져 있으면 일정(대시보드)', () => {
    expect(landingPage({})).toBe('calendar');
  });

  it('일정이 꺼져 있으면 다음 켜진 곳', () => {
    expect(landingPage({ 'tools.calendar': false })).toBe('explore');
  });

  it('본인이 일정을 숨겼어도 다음 곳으로', () => {
    expect(landingPage({}, ['tools.calendar'])).toBe('explore');
  });

  it('다 꺼져도 갈 곳이 있다', () => {
    expect(
      landingPage({
        'tools.calendar': false,
        'discovery.popular': false,
        'tools.memo': false,
        'tools.wiki': false,
      })
    ).toBe('scraps');
  });
});
