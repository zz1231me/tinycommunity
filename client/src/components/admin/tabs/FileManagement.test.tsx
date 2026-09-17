// client/src/components/admin/tabs/FileManagement.test.tsx
//
// 삭제 확인 대화상자의 포커스 가두기.
//
// 이 화면은 다른 대화상자와 달리 '열려 있을 때만' 가둔다(useFocusTrap 의 active).
// 그 배선이 실제로 붙었는지를 본다 — 패널에 ref 를 달지 않으면 훅이 가둘 상자를
// 찾지 못해 아무 일도 일어나지 않고, 그래도 화면은 멀쩡해 보인다.
//
// 뒤에 파일 목록이 통째로 깔려 있어, 새면 가려진 줄의 '삭제' 단추로 넘어간다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { FileManagement } from './FileManagement';

const mockFetchAdminFiles = vi.fn();

vi.mock('../../../api/uploads', () => ({
  fetchAdminFiles: (params: unknown, signal: unknown) => mockFetchAdminFiles(params, signal),
  deleteAdminFile: () => Promise.resolve({}),
}));

const file = (name: string) => ({
  filename: name,
  type: 'file' as const,
  size: 1024,
  mtime: '2026-09-16T01:00:00.000Z',
  downloadUrl: `/api/uploads/download/${name}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAdminFiles.mockResolvedValue({
    items: [file('첫.txt'), file('둘.txt')],
    total: 2,
    totalPages: 1,
    totalSize: 2048,
  });
});

/** 목록이 뜨기를 기다렸다가 첫 줄의 삭제를 누른다 */
async function openConfirm() {
  expect(await screen.findByText('첫.txt')).toBeInTheDocument();
  const rowDeletes = screen.getAllByRole('button', { name: '삭제' });
  fireEvent.click(rowDeletes[0]);
  expect(await screen.findByText('파일 삭제 확인')).toBeInTheDocument();
}

describe('삭제 확인 대화상자', () => {
  it('열면 대화상자 안으로 포커스가 들어온다', async () => {
    renderWithQuery(<FileManagement />);
    await openConfirm();

    // 패널에 ref 가 없으면 훅이 포커스를 옮기지 못해 목록의 단추에 남는다
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }))
    );
  });

  it('마지막에서 Tab 하면 안으로 돌아온다', async () => {
    renderWithQuery(<FileManagement />);
    await openConfirm();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }))
    );

    // 대화상자 안의 마지막 요소는 확인용 '삭제'
    const inDialog = screen.getAllByRole('button', { name: '삭제' });
    const confirmDelete = inDialog[inDialog.length - 1];
    confirmDelete.focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }));
  });

  it('ESC 를 누르면 닫힌다', async () => {
    renderWithQuery(<FileManagement />);
    await openConfirm();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('파일 삭제 확인')).not.toBeInTheDocument());
  });
});
