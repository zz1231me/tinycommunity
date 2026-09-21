// client/src/components/common/UpdateBanner.test.tsx
// 켜 둔 채로 배포가 일어났을 때.
//
// 열어 둔 탭은 스스로 다시 받아 오지 않는다 — 예전에는 며칠째 옛 화면을 쓰다가
// 이미 고친 문제를 다시 겪었다. 그렇다고 아무 때나 새로고침하면 쓰던 글이 날아간다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';

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
});
