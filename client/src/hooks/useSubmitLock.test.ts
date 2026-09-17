// client/src/hooks/useSubmitLock.test.ts
// 같은 제출이 두 번 나가면 메시지가 두 통 간다. 실제로 그랬다.

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSubmitLock } from './useSubmitLock';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
};

describe('제출 잠금', () => {
  it('진행 중인 동안 들어온 호출은 무시한다', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const task = vi.fn();
    const d = deferred();

    act(() => {
      // 같은 틱에 세 번 — 더블클릭이 만드는 상황
      result.current(() => {
        task();
        return d.promise;
      });
      result.current(() => {
        task();
        return d.promise;
      });
      result.current(() => {
        task();
        return d.promise;
      });
    });

    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve();
      await d.promise;
    });
  });

  it('끝나면 다시 보낼 수 있다', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const task = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      result.current(task);
    });
    await act(async () => {
      result.current(task);
    });

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('실패해도 잠금이 남지 않는다 — 한 번 실패하면 영영 못 보내면 안 된다', async () => {
    const { result } = renderHook(() => useSubmitLock());
    const failing = vi.fn().mockRejectedValue(new Error('네트워크'));

    await act(async () => {
      result.current(failing);
    });
    await act(async () => {
      result.current(failing);
    });

    expect(failing).toHaveBeenCalledTimes(2);
  });
});
