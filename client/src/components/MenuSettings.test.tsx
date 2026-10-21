// 본인 메뉴 숨기기와 첫 화면 고르기. 바로 반영하고 저장하며, 실패하면 되돌린다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFeatures } from '../store/features';
import { MenuSettings } from './MenuSettings';

const saveHiddenMenus = vi.hoisted(() => vi.fn());
vi.mock('../api/features', () => ({ saveHiddenMenus }));
// 첫 화면은 보기 설정이라 계정에 저장한다. 그 길은 따로 시험한다.
const saveUiPrefs = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('../api/uiPrefs', () => ({ saveUiPrefs, fetchUiPrefs: vi.fn().mockResolvedValue({}) }));

/** 보기 설정이 쿼리를 쓰므로 Provider 안에서 그린다 */
const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MenuSettings />
    </QueryClientProvider>
  );

const toggle = (label: string) => screen.getByRole('switch', { name: `${label} 메뉴 보이기` });

describe('MenuSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFeatures.setState({ features: {}, loaded: true, hidden: [] });
  });

  it('끄면 숨긴 목록에 넣어 저장한다', async () => {
    saveHiddenMenus.mockImplementation(async (list: string[]) => list);
    show();
    await act(async () => fireEvent.click(toggle('메모')));
    expect(saveHiddenMenus).toHaveBeenCalledWith(['tools.memo']);
    expect(useFeatures.getState().hidden).toEqual(['tools.memo']);
  });

  it('다시 켜면 목록에서 뺀다', async () => {
    useFeatures.setState({ hidden: ['tools.memo', 'tools.wiki'] });
    saveHiddenMenus.mockImplementation(async (list: string[]) => list);
    show();
    await act(async () => fireEvent.click(toggle('메모')));
    expect(saveHiddenMenus).toHaveBeenCalledWith(['tools.wiki']);
  });

  it('저장에 실패하면 원래대로 돌린다', async () => {
    saveHiddenMenus.mockRejectedValue(new Error('network'));
    show();
    await act(async () => fireEvent.click(toggle('메모')));
    expect(useFeatures.getState().hidden).toEqual([]);
  });

  it('관리자가 꺼 둔 기능은 목록에 없다 — 숨기고 말고가 없다', () => {
    useFeatures.setState({ features: { 'tools.wiki': false } });
    show();
    expect(screen.queryByRole('switch', { name: '위키 메뉴 보이기' })).not.toBeInTheDocument();
    expect(toggle('메모')).toBeInTheDocument();
  });
});

describe('첫 화면 고르기', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFeatures.setState({ features: {}, loaded: true, hidden: [] });
  });

  const picker = () => screen.getByLabelText('첫 화면') as HTMLSelectElement;

  it('고르면 계정에 저장한다', async () => {
    show();
    await act(async () => fireEvent.change(picker(), { target: { value: 'tasks' } }));
    expect(saveUiPrefs).toHaveBeenCalledWith({ landing: 'tasks' });
  });

  it("고르지 않았으면 '자동'", () => {
    show();
    expect(picker().value).toBe('auto');
  });

  it('꺼진 기능은 후보에 없다 — 갈 수 없는 곳을 고르게 두지 않는다', () => {
    useFeatures.setState({ features: { 'tools.wiki': false } });
    show();
    expect(screen.queryByRole('option', { name: '위키' })).toBeNull();
    expect(screen.getByRole('option', { name: '업무' })).toBeInTheDocument();
  });

  it('본인이 숨긴 메뉴도 후보에서 뺀다', () => {
    useFeatures.setState({ hidden: ['post.tasks'] });
    show();
    expect(screen.queryByRole('option', { name: '업무' })).toBeNull();
  });
});
