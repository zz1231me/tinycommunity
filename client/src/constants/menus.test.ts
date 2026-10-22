// /dashboard 로 들어왔을 때 갈 곳. 본인이 고른 곳으로 보내되,
// 꺼졌거나 본인이 숨긴 곳으로는 보내지 않는다.

import { describe, expect, it } from 'vitest';
import { landingOptions, landingPage } from './menus';

describe('landingPage', () => {
  it('고르지 않았으면 조망 화면', () => {
    expect(landingPage({})).toBe('overview');
  });

  it('조망 화면에는 스위치가 없다 — 다 꺼도 갈 곳이 남는다', () => {
    expect(
      landingPage({
        'tools.calendar': false,
        'discovery.popular': false,
        'tools.memo': false,
        'tools.wiki': false,
        'post.tasks': false,
        'post.scrap': false,
      })
    ).toBe('overview');
  });

  it('일정을 골랐다가 그 기능이 꺼지면 조망 화면으로', () => {
    expect(landingPage({ 'tools.calendar': false }, [], 'calendar')).toBe('overview');
  });

  it('본인이 숨긴 곳으로는 보내지 않는다', () => {
    expect(landingPage({}, ['tools.calendar'], 'calendar')).toBe('overview');
  });
});

describe('고른 첫 화면', () => {
  it('고른 곳으로 보낸다 — 순서상 앞인 곳을 제친다', () => {
    expect(landingPage({}, [], 'tasks')).toBe('tasks');
  });

  it("'auto' 는 고르기를 무른다 — 조망 화면으로", () => {
    expect(landingPage({}, [], 'auto')).toBe('overview');
  });

  it('고른 곳이 그새 꺼졌으면 갈 수 있는 첫 곳으로', () => {
    expect(landingPage({ 'post.tasks': false }, [], 'tasks')).toBe('overview');
  });

  it('고른 곳을 본인이 숨겼으면 그리로 보내지 않는다', () => {
    expect(landingPage({}, ['post.tasks'], 'tasks')).toBe('overview');
  });

  it('일정을 고르면 일정으로 — 조망 화면을 제친다', () => {
    expect(landingPage({}, [], 'calendar')).toBe('calendar');
  });

  it('스크랩도 스위치가 있다 — 꺼져 있으면 후보에서 빠진다', () => {
    expect(landingOptions({ 'post.scrap': false }).map(o => o.to)).not.toContain('scraps');
    expect(landingOptions({}).map(o => o.to)).toContain('scraps');
  });
});
