// client/src/components/admin/tabs/AnnouncementManagement.test.tsx
//
// 못 불러온 것을 '없다' 로 보여 주지 않는가.
//
// 실패를 빈 목록으로 보여 주면, 있는 공지가 사라진 것으로 읽힌다 — 이 저장소가 버그로
// 규정한 유형이다(ListState 주석). 관리자 화면 여러 곳이 같은 상태였다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { AnnouncementManagement } from './AnnouncementManagement';
const fetchAllAnnouncements = vi.hoisted(() => vi.fn());
vi.mock('../../../api/announcements', () => ({
  fetchAllAnnouncements,
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
describe('공지 목록을 불러오지 못했을 때', () => {
  it("'없다' 가 아니라 못 불러왔다고 말한다", async () => {
    fetchAllAnnouncements.mockRejectedValue(new Error('끊김'));
    renderWithQuery(<AnnouncementManagement />);
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/등록된 공지가 없습니다/)).not.toBeInTheDocument();
  });
  it('정말 없을 때만 없다고 말한다 — 대조', async () => {
    fetchAllAnnouncements.mockResolvedValue([]);
    renderWithQuery(<AnnouncementManagement />);
    expect(await screen.findByText(/등록된 공지가 없습니다/)).toBeInTheDocument();
  });
});
