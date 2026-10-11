// 본인 메뉴 숨기기. 바로 반영하고 저장하며, 실패하면 되돌린다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFeatures } from '../store/features';
import { MenuSettings } from './MenuSettings';

const saveHiddenMenus = vi.hoisted(() => vi.fn());
vi.mock('../api/features', () => ({ saveHiddenMenus }));

const toggle = (label: string) => screen.getByRole('switch', { name: `${label} 메뉴 보이기` });

describe('MenuSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFeatures.setState({ features: {}, loaded: true, hidden: [] });
  });

  it('끄면 숨긴 목록에 넣어 저장한다', async () => {
    saveHiddenMenus.mockImplementation(async (list: string[]) => list);
    render(<MenuSettings />);
    await act(async () => fireEvent.click(toggle('메모')));
    expect(saveHiddenMenus).toHaveBeenCalledWith(['tools.memo']);
    expect(useFeatures.getState().hidden).toEqual(['tools.memo']);
  });

  it('다시 켜면 목록에서 뺀다', async () => {
    useFeatures.setState({ hidden: ['tools.memo', 'tools.wiki'] });
    saveHiddenMenus.mockImplementation(async (list: string[]) => list);
    render(<MenuSettings />);
    await act(async () => fireEvent.click(toggle('메모')));
    expect(saveHiddenMenus).toHaveBeenCalledWith(['tools.wiki']);
  });

  it('저장에 실패하면 원래대로 돌린다', async () => {
    saveHiddenMenus.mockRejectedValue(new Error('network'));
    render(<MenuSettings />);
    await act(async () => fireEvent.click(toggle('메모')));
    expect(useFeatures.getState().hidden).toEqual([]);
  });

  it('관리자가 꺼 둔 기능은 목록에 없다 — 숨기고 말고가 없다', () => {
    useFeatures.setState({ features: { 'tools.wiki': false } });
    render(<MenuSettings />);
    expect(screen.queryByRole('switch', { name: '위키 메뉴 보이기' })).not.toBeInTheDocument();
    expect(toggle('메모')).toBeInTheDocument();
  });
});
