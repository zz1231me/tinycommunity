// 한 사람의 기능 예외. 역할 따름/허용/차단 중 고르고 바꾼 것만 보낸다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { UserFeatureModal } from './UserFeatureModal';
import type { UserFeatureRules } from '../../../api/features';

const featuresApi = vi.hoisted(() => ({
  fetchUserFeatureRules: vi.fn(),
  saveUserFeatureRules: vi.fn(),
}));
vi.mock('../../../api/features', () => featuresApi);

const rules = (over: Partial<UserFeatureRules> = {}): UserFeatureRules => ({
  isAdmin: false,
  features: [
    {
      key: 'tools.memo',
      label: '메모',
      group: 'tools',
      site: true,
      role: false,
      user: null,
      effective: false,
    },
    {
      key: 'tools.wiki',
      label: '위키',
      group: 'tools',
      site: true,
      role: null,
      user: false,
      effective: false,
    },
    {
      key: 'tools.lottery',
      label: '포인트 뽑기',
      group: 'tools',
      site: false,
      role: null,
      user: null,
      effective: false,
    },
  ],
  ...over,
});

function setup(data = rules()) {
  featuresApi.fetchUserFeatureRules.mockResolvedValue(data);
  const onClose = vi.fn();
  renderWithQuery(<UserFeatureModal userId="u1" userName="홍길동" onClose={onClose} />);
  return onClose;
}

const choices = (label: string) => screen.findByRole('radiogroup', { name: `${label} 예외` });

describe('UserFeatureModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('저장된 값을 보여 준다 — 규칙 없음은 역할 따름', async () => {
    setup();
    expect(within(await choices('메모')).getByRole('radio', { name: '역할 따름' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(within(await choices('위키')).getByRole('radio', { name: '차단' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('역할에서 꺼진 기능을 이 사람만 허용하고, 바꾼 것만 보낸다', async () => {
    featuresApi.saveUserFeatureRules.mockResolvedValue(rules());
    const onClose = setup();
    fireEvent.click(within(await choices('메모')).getByRole('radio', { name: '허용' }));
    expect(screen.getByText('쓸 수 있음')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
    expect(featuresApi.saveUserFeatureRules).toHaveBeenCalledWith('u1', { 'tools.memo': true });
    expect(onClose).toHaveBeenCalled();
  });

  it('역할 따름으로 되돌리면 null 을 보낸다', async () => {
    featuresApi.saveUserFeatureRules.mockResolvedValue(rules());
    setup();
    fireEvent.click(within(await choices('위키')).getByRole('radio', { name: '역할 따름' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
    expect(featuresApi.saveUserFeatureRules).toHaveBeenCalledWith('u1', { 'tools.wiki': null });
  });

  it('바꾼 것이 없으면 저장할 수 없다', async () => {
    setup();
    await choices('메모');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('사이트 전체가 꺼진 기능은 고를 수 없다', async () => {
    setup();
    for (const radio of within(await choices('포인트 뽑기')).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByText(/사이트 전체 꺼짐/)).toBeInTheDocument();
  });

  it('관리자 계정은 예외를 받지 않는다고 알린다', async () => {
    setup(rules({ isAdmin: true }));
    expect(await screen.findByText(/관리자는 기능 예외를 받지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
  });
});
