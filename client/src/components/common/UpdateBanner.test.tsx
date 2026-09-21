// client/src/components/common/UpdateBanner.test.tsx
// 켜 둔 채로 배포가 일어났을 때.
//
// 열어 둔 탭은 스스로 다시 받아 오지 않는다 — 예전에는 며칠째 옛 화면을 쓰다가
// 이미 고친 문제를 다시 겪었다. 그렇다고 아무 때나 새로고침하면 쓰던 글이 날아간다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';
import { TopNoticeSlot } from './TopNotice';

const setMeta = (version: string) => {
  const m = document.createElement('meta');
  m.name = 'app-version';
  m.content = version;
  document.head.appendChild(m);
};

const serverSays = (version: string) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { version } }),
  } as unknown as Response);

const reload = vi.fn();

beforeEach(() => {
  document.head.querySelectorAll('meta[name="app-version"]').forEach(m => m.remove());
  reload.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** fetch 가 끝나기를 기다린다(가짜 타이머 아래에서도) */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('새 배포를 알아챘을 때', () => {
  it('같은 버전이면 아무 말도 하지 않는다 — 대조군', async () => {
    setMeta('aaa');
    vi.stubGlobal('fetch', serverSays('aaa'));
    render(<UpdateBanner />);
    await settle();

    expect(screen.queryByText(/새 버전/)).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('버전이 달라지면 알린다', async () => {
    setMeta('aaa');
    vi.stubGlobal('fetch', serverSays('bbb'));
    render(<UpdateBanner />);
    await settle();

    expect(screen.getByText(/새 버전이 있습니다/)).toBeInTheDocument();
  });

  it('글을 쓰는 중이면 기다린다', async () => {
    setMeta('aaa');
    vi.stubGlobal('fetch', serverSays('bbb'));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    render(<UpdateBanner />);
    await settle();
    act(() => void vi.advanceTimersByTime(60_000));

    // 쓰던 글이 날아가면 안 된다 — 띠만 남기고 기다린다
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/새 버전이 있습니다/)).toBeInTheDocument();
    input.remove();
  });

  it('쓰던 것이 없으면 잠시 뒤 스스로 새로고침한다', async () => {
    setMeta('aaa');
    vi.stubGlobal('fetch', serverSays('bbb'));
    render(<UpdateBanner />);
    await settle();

    act(() => void vi.advanceTimersByTime(21_000));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('안 보는 탭이라도 쓰던 것이 있으면 기다린다', () => {
    // 글을 쓰다 다른 탭을 보러 간 사이 배포가 나는 흔한 경우다.
    // 그대로 새로고침하면 작성 중이던 글이 날아간다.
    setMeta('aaa');
    vi.stubGlobal('fetch', serverSays('bbb'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    input.focus();

    render(<UpdateBanner />);
    return settle().then(() => {
      act(() => void vi.advanceTimersByTime(60_000));
      expect(reload).not.toHaveBeenCalled();
      input.remove();
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    });
  });
});

describe('띠가 여럿일 때', () => {
  it('급한 알림이 새 버전 안내보다 위에 앉는다', async () => {
    // 자리는 붙는 순서로 정해진다. 먼저 떠 있던 안내 아래로 밀리면 정작 급한 것이 안 보인다.
    setMeta('aaa');
    vi.stubGlobal('fetch', serverSays('bbb'));
    render(<UpdateBanner />);
    await settle();

    render(
      <TopNoticeSlot priority={10}>
        <div data-testid="urgent">공격 알림</div>
      </TopNoticeSlot>
    );

    const host = document.getElementById('top-notices')!;
    const orderOf = (el: Element | null) => Number((el?.parentElement as HTMLElement)?.style.order);
    const urgent = host.querySelector('[data-testid="urgent"]');
    const update = host.querySelector('[role="status"]');

    expect(orderOf(urgent)).toBeLessThan(orderOf(update));
  });
});
