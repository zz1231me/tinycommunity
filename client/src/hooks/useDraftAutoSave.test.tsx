// client/src/hooks/useDraftAutoSave.test.tsx
// 자동저장은 "언제 저장하지 않는가" 가 더 중요하다.
// 빈 글을 저장하면 목록이 빈 초안으로 차고, 같은 내용을 반복 저장하면
// 목록의 "마지막 저장" 시각이 실제로 손댄 시각과 어긋난다.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftAutoSave, type DraftSnapshot } from './useDraftAutoSave';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
vi.mock('../api/drafts', () => ({
  createDraft: (...args: unknown[]) => mockCreate(...args),
  updateDraft: (...args: unknown[]) => mockUpdate(...args),
}));

const INTERVAL = 1000;

/** 훅을 띄우고, read() 가 돌려줄 스냅샷을 바꿔 가며 시간을 흘린다 */
function setup(initial: DraftSnapshot, initialDraftId: string | null = null) {
  const snapshot = { current: initial };
  const view = renderHook(() =>
    useDraftAutoSave({
      enabled: true,
      boardType: 'notice',
      intervalMs: INTERVAL,
      initialDraftId,
      read: () => snapshot.current,
    })
  );
  return { ...view, snapshot };
}

/** 타이머를 한 주기 돌리고, 그 안에서 시작된 저장이 끝나기를 기다린다 */
async function tick() {
  await act(async () => {
    vi.advanceTimersByTime(INTERVAL);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'draft-1', updatedAt: new Date().toISOString() });
  mockUpdate.mockResolvedValue({ id: 'draft-1', updatedAt: new Date().toISOString() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('저장하지 않는 경우', () => {
  it('제목·본문이 모두 비어 있으면 저장하지 않는다', async () => {
    setup({ title: '', content: '' });
    await tick();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('본문이 빈 태그뿐이면 비어 있는 것으로 본다', async () => {
    setup({ title: '   ', content: '<p></p><p>&nbsp;</p>' });
    await tick();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('내용이 그대로면 다음 주기에 다시 저장하지 않는다', async () => {
    setup({ title: '제목', content: '<p>내용</p>' });
    await tick();
    await tick();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('저장하는 경우', () => {
  it('처음에는 새로 만들고, 그다음부터는 같은 초안을 갱신한다', async () => {
    const { snapshot } = setup({ title: '제목', content: '<p>1</p>' });

    await tick();
    expect(mockCreate).toHaveBeenCalledWith('notice', '제목', '<p>1</p>');

    snapshot.current = { title: '제목', content: '<p>2</p>' };
    await tick();
    expect(mockUpdate).toHaveBeenCalledWith('draft-1', '제목', '<p>2</p>');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('이어쓰기로 열었으면 처음부터 그 초안을 갱신한다', async () => {
    setup({ title: '이어쓰기', content: '<p>x</p>' }, 'existing-9');
    await tick();
    expect(mockUpdate).toHaveBeenCalledWith('existing-9', '이어쓰기', '<p>x</p>');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('제목만 있어도 저장한다 — 본문 전에 제목부터 쓰는 경우가 있다', async () => {
    setup({ title: '제목만', content: '' });
    await tick();
    expect(mockCreate).toHaveBeenCalled();
  });

  it('저장에 성공하면 저장 시각을 남긴다', async () => {
    const { result } = setup({ title: '제목', content: '<p>x</p>' });
    expect(result.current.savedAt).toBeNull();

    await tick();
    expect(result.current.savedAt).toBeInstanceOf(Date);
    expect(result.current.failed).toBe(false);
    expect(result.current.draftId).toBe('draft-1');
  });
});

describe('실패했을 때', () => {
  it('실패를 감추지 않는다', async () => {
    mockCreate.mockRejectedValue(new Error('network'));
    const { result } = setup({ title: '제목', content: '<p>x</p>' });

    await tick();
    expect(result.current.failed).toBe(true);
    expect(result.current.savedAt).toBeNull();
  });

  it('실패해도 다음 주기에 다시 시도한다', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network'));
    const { result } = setup({ title: '제목', content: '<p>x</p>' });

    await tick();
    expect(result.current.failed).toBe(true);

    await tick();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.current.failed).toBe(false);
  });
});

describe('발행 후', () => {
  it('forget 하면 다음 저장은 새 초안을 만든다', async () => {
    const { result, snapshot } = setup({ title: '제목', content: '<p>1</p>' });
    await tick();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    act(() => result.current.forget());
    snapshot.current = { title: '새 글', content: '<p>2</p>' };
    await tick();

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('꺼져 있을 때', () => {
  it('enabled 가 false 면 아무것도 저장하지 않는다', async () => {
    renderHook(() =>
      useDraftAutoSave({
        enabled: false,
        boardType: 'notice',
        intervalMs: INTERVAL,
        read: () => ({ title: '제목', content: '<p>x</p>' }),
      })
    );
    await tick();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
