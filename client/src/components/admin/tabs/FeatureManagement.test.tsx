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

// 기능이 서른 개를 넘으면 쭉 늘어놓은 목록에서 하나를 눈으로 찾아야 한다(실측 4,851px).
// 이름으로 거르고, 관리자가 실제로 묻는 것을 단추로 둔다.
describe('기능 찾기와 거르기', () => {
  beforeEach(() => vi.clearAllMocks());

  const many: FeatureCatalog = {
    groups: { tools: '도구', boards: '게시판' },
    features: [
      { ...catalog().features[0], key: 'tools.memo', label: '메모', group: 'tools' },
      {
        ...catalog().features[0],
        key: 'tools.calendar',
        label: '일정',
        group: 'tools',
        enabled: false,
        effective: false,
      },
      { ...catalog().features[0], key: 'boards.tag', label: '태그', group: 'boards' },
    ],
  };

  const titles = () =>
    screen.getAllByRole('switch').map(s => s.getAttribute('aria-label')?.replace(' 사용', ''));

  it('이름으로 거른다', async () => {
    setup(many);
    await screen.findByRole('switch', { name: '메모 사용' });

    fireEvent.change(screen.getByRole('searchbox', { name: /기능 이름/ }), {
      target: { value: '일정' },
    });
    expect(titles()).toEqual(['일정']);
  });

  // 이름을 몰라도 키로 찾을 수 있어야 한다 — '달력' 을 찾는 사람은 'calendar' 를 친다.
  it('기능 키로도 거른다', async () => {
    setup(many);
    await screen.findByRole('switch', { name: '메모 사용' });

    fireEvent.change(screen.getByRole('searchbox', { name: /기능 이름/ }), {
      target: { value: 'calendar' },
    });
    expect(titles()).toEqual(['일정']);
  });

  it('꺼진 것만 모아 본다 — 개수도 함께 알린다', async () => {
    setup(many);
    await screen.findByRole('switch', { name: '메모 사용' });

    const off = screen.getByRole('button', { name: '꺼짐 1' });
    fireEvent.click(off);
    expect(titles()).toEqual(['일정']);
    expect(off).toHaveAttribute('aria-pressed', 'true');
  });

  it('맞는 것이 없으면 빈 목록 대신 그렇다고 말한다', async () => {
    setup(many);
    await screen.findByRole('switch', { name: '메모 사용' });

    fireEvent.change(screen.getByRole('searchbox', { name: /기능 이름/ }), {
      target: { value: '없는기능' },
    });
    expect(screen.getByText('조건에 맞는 기능이 없습니다.')).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('거르는 중에도 고친 것은 저장에 실려 간다', async () => {
    featuresApi.saveFeatures.mockResolvedValue(many);
    setup(many);
    await screen.findByRole('switch', { name: '메모 사용' });

    // 메모를 끄고 나서 다른 것만 보이게 거른다
    fireEvent.click(screen.getByRole('switch', { name: '메모 사용' }));
    fireEvent.change(screen.getByRole('searchbox', { name: /기능 이름/ }), {
      target: { value: '태그' },
    });
    expect(titles()).toEqual(['태그']);
    expect(screen.getByText('저장하지 않은 변경 1건이 있습니다.')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
    expect(featuresApi.saveFeatures).toHaveBeenCalledWith({ 'tools.memo': false });
  });
});
