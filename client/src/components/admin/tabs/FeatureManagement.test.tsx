// 기능 탭의 역할별 켬/끔. 사이트 전체 스위치와 같은 '고친 뒤 한 번에 저장' 흐름을 탄다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '../../../test/renderWithQuery';
import FeatureManagement from './FeatureManagement';
import type { FeatureCatalog } from '../../../api/features';

const featuresApi = vi.hoisted(() => ({
  fetchFeatureCatalog: vi.fn(),
  saveFeatures: vi.fn(),
  saveRoleFeatureRules: vi.fn(),
}));
vi.mock('../../../api/features', () => featuresApi);
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../../api/axios', () => ({ default: { get: apiGet } }));

const catalog = (roleRules: Record<string, boolean> = {}, enabled = true): FeatureCatalog => ({
  groups: { tools: '도구' },
  features: [
    {
      key: 'tools.memo',
      label: '메모',
      description: '나만 보는 메모장입니다.',
      group: 'tools',
      defaultEnabled: true,
      requires: [],
      clientOnly: false,
      enabled,
      effective: enabled,
      updatedBy: null,
      updatedAt: null,
      roleRules,
      userRuleCount: 2,
    },
  ],
});

function setup(data = catalog()) {
  featuresApi.fetchFeatureCatalog.mockResolvedValue(data);
  apiGet.mockResolvedValue({
    data: {
      data: [
        { id: 'admin', name: '관리자', description: '', isActive: true },
        { id: 'user', name: '일반 사용자', description: '', isActive: true },
        { id: 'guest', name: '게스트', description: '', isActive: true },
      ],
    },
  });
  renderWithQuery(
    <MemoryRouter>
      <FeatureManagement />
    </MemoryRouter>
  );
}

const roles = async () => screen.findByRole('group', { name: '메모 역할별 사용' });

describe('역할별 기능', () => {
  beforeEach(() => vi.clearAllMocks());

  it('관리자 역할은 고를 수 없다 — 예외를 받지 않는다', async () => {
    setup();
    const group = await roles();
    expect(within(group).queryByRole('button', { name: '관리자' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '일반 사용자' })).toBeInTheDocument();
  });

  it('역할을 누르면 끄고, 저장하면 그 역할에 false 를 보낸다', async () => {
    featuresApi.saveRoleFeatureRules.mockResolvedValue(catalog({ user: false }));
    setup();
    const group = await roles();
    const user = within(group).getByRole('button', { name: '일반 사용자' });
    expect(user).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(user);
    expect(user).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('저장하지 않은 변경 1건이 있습니다.')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
    expect(featuresApi.saveRoleFeatureRules).toHaveBeenCalledWith('user', { 'tools.memo': false });
    expect(featuresApi.saveFeatures).not.toHaveBeenCalled();
  });

  it('꺼진 역할을 다시 켜면 규칙을 지운다(null)', async () => {
    featuresApi.saveRoleFeatureRules.mockResolvedValue(catalog());
    setup(catalog({ guest: false }));
    const group = await roles();
    const guest = within(group).getByRole('button', { name: '게스트' });
    expect(guest).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(guest);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
    expect(featuresApi.saveRoleFeatureRules).toHaveBeenCalledWith('guest', { 'tools.memo': null });
  });

  it('눌렀다 되돌리면 바뀐 것이 없다', async () => {
    setup();
    const user = within(await roles()).getByRole('button', { name: '일반 사용자' });
    fireEvent.click(user);
    fireEvent.click(user);
    expect(screen.queryByText(/저장하지 않은 변경/)).not.toBeInTheDocument();
  });

  it('개인 예외가 걸린 사람 수를 알린다', async () => {
    setup();
    await roles();
    expect(screen.getByText('개인 예외 2명')).toBeInTheDocument();
  });

  it('사이트 전체가 꺼진 기능에는 역할별을 보이지 않는다 — 어차피 쓰이지 않는다', async () => {
    setup(catalog({}, false));
    await screen.findByText('메모');
    expect(screen.queryByRole('group', { name: '메모 역할별 사용' })).not.toBeInTheDocument();
  });
});
