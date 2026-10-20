// 편집 중에 옆 문서를 ⌘-클릭하면 어떻게 되는가.
//
// 위키는 편집 중 사이드바를 누르면 '버리시겠습니까?' 를 먼저 띄운다. 쓰던 글을
// 말없이 날리지 않으려는 것이니 맞다. 그런데 가로채는 자리가 수식 키를 보지
// 않아서, ⌘-클릭(새 탭에서 열기)까지 함께 막혔다.
//
// ⌘-클릭은 이 탭을 떠나지 않는다. 쓰던 글은 그대로 남는다. 그런데도 확인창이
// 뜨고, 거기서 '버리기' 를 누르면 열려던 새 탭 대신 이 탭이 그 문서로 가면서
// 쓰던 내용이 사라진다 — 아무것도 잃지 않을 클릭이 글을 잃게 만든다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WikiSidebar } from './WikiSidebar';
import type { WikiTreePage } from '../../types/wiki.types';

const page = (id: number, slug: string, title: string): WikiTreePage => ({
  id,
  slug,
  title,
  parentId: null,
  authorId: 'u1',
  order: id,
  isPublished: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const PAGES = [page(1, 'now-editing', '쓰고 있는 문서'), page(2, 'other', '옆 문서')];

/** 쓰던 중에 옆 문서를 누른다. 수식 키는 opts 로 준다. */
function clickOther(opts: MouseEventInit) {
  const onInterceptNav = vi.fn();
  render(
    <MemoryRouter initialEntries={['/dashboard/wiki/now-editing']}>
      <WikiSidebar pages={PAGES} isEditing onInterceptNav={onInterceptNav} />
    </MemoryRouter>
  );

  const link = screen.getByRole('link', { name: '옆 문서' });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...opts });
  link.dispatchEvent(event);

  return { onInterceptNav, prevented: event.defaultPrevented };
}

describe('편집 중 사이드바', () => {
  it('평범한 클릭은 가로챈다 — 쓰던 글을 말없이 버리지 않으려고', () => {
    const { onInterceptNav, prevented } = clickOther({});

    expect(prevented).toBe(true);
    expect(onInterceptNav).toHaveBeenCalledWith('other');
  });

  it('⌘-클릭은 그냥 둔다 — 새 탭으로 열릴 뿐 이 탭을 떠나지 않는다', () => {
    const { onInterceptNav, prevented } = clickOther({ metaKey: true });

    expect(prevented).toBe(false);
    expect(onInterceptNav).not.toHaveBeenCalled();
  });

  it('Ctrl-클릭도 마찬가지다 — 윈도우·리눅스에서 새 탭이다', () => {
    const { onInterceptNav, prevented } = clickOther({ ctrlKey: true });

    expect(prevented).toBe(false);
    expect(onInterceptNav).not.toHaveBeenCalled();
  });

  it('Shift-클릭도 마찬가지다 — 새 창이다', () => {
    const { onInterceptNav, prevented } = clickOther({ shiftKey: true });

    expect(prevented).toBe(false);
    expect(onInterceptNav).not.toHaveBeenCalled();
  });
});

// '홈' 은 가로채는 자리가 따로 있다 — 같은 실수가 두 군데에 있었다.
describe("편집 중 '홈'", () => {
  function clickHome(opts: MouseEventInit) {
    const onInterceptNav = vi.fn();
    render(
      <MemoryRouter initialEntries={['/dashboard/wiki/now-editing']}>
        <WikiSidebar pages={PAGES} isEditing onInterceptNav={onInterceptNav} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: '홈' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...opts });
    link.dispatchEvent(event);

    return { onInterceptNav, prevented: event.defaultPrevented };
  }

  it('평범한 클릭은 가로챈다', () => {
    const { onInterceptNav, prevented } = clickHome({});

    expect(prevented).toBe(true);
    expect(onInterceptNav).toHaveBeenCalledWith(null);
  });

  it('⌘-클릭은 그냥 둔다', () => {
    const { onInterceptNav, prevented } = clickHome({ metaKey: true });

    expect(prevented).toBe(false);
    expect(onInterceptNav).not.toHaveBeenCalled();
  });
});
