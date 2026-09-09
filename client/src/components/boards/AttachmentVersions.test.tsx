// client/src/components/boards/AttachmentVersions.test.tsx
// 첨부 개정 이력의 표시 규칙.
//
// 눈으로는 잘 안 걸리는 것들이다. 이력이 없는 첨부에 빈 줄이 붙는지, 버전 번호가
// 최신부터 매겨지는지, 받은 파일 이름이 현재 첨부와 구별되는지 — 셋 다 파일을 여러 번
// 교체해 봐야 드러난다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttachmentVersions } from './AttachmentVersions';
import type { AttachmentVersionGroup } from '../../api/tasks';

const downloadFile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../utils/downloadUtils', () => ({ downloadFile }));

function group(count: number): AttachmentVersionGroup {
  return {
    originalName: '보고서.docx',
    versions: Array.from({ length: count }, (_, i) => ({
      filename: `stored-${i}.docx`,
      size: 1024,
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      uploadedBy: 'admin',
      // 최신이 먼저 — 서버가 그 순서로 준다
      createdAt: new Date(2026, 0, 10 - i).toISOString(),
      url: `/api/uploads/download/stored-${i}.docx`,
    })),
  };
}

beforeEach(() => downloadFile.mockClear());

describe('언제 나타나는가', () => {
  it('이력이 없으면 아무것도 그리지 않는다', () => {
    // 대부분의 첨부는 한 번 올리고 끝이라, 빈 줄이 파일마다 붙으면 목록만 길어진다
    const { container } = render(<AttachmentVersions group={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('버전이 0개인 묶음도 그리지 않는다', () => {
    const { container } = render(<AttachmentVersions group={group(0)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('접힌 상태에서는 개수만 보여 준다', () => {
    render(<AttachmentVersions group={group(2)} />);
    expect(screen.getByRole('button', { name: /이전 버전 2개/ })).toBeTruthy();
    expect(screen.queryByText('v2')).toBeNull();
  });
});

describe('펼친 목록', () => {
  it('최신이 큰 번호를 갖는다 — v1 이 가장 오래된 것', () => {
    render(<AttachmentVersions group={group(3)} />);
    fireEvent.click(screen.getByRole('button', { name: /이전 버전 3개/ }));

    const labels = screen.getAllByText(/^v\d+$/).map(el => el.textContent);
    expect(labels).toEqual(['v3', 'v2', 'v1']);
  });

  it('내려받는 파일 이름에 버전을 붙인다 — 현재 첨부와 이름이 같으면 구별되지 않는다', async () => {
    render(<AttachmentVersions group={group(2)} />);
    fireEvent.click(screen.getByRole('button', { name: /이전 버전 2개/ }));
    fireEvent.click(screen.getByRole('button', { name: '보고서.docx v2 내려받기' }));

    expect(downloadFile).toHaveBeenCalledWith({
      storedName: 'stored-0.docx',
      originalName: '보고서.docx'.replace('.docx', ' (v2).docx'),
    });
  });

  it('확장자가 없는 이름도 버전이 붙는다', () => {
    const noExt: AttachmentVersionGroup = { ...group(1), originalName: 'README' };
    render(<AttachmentVersions group={noExt} />);
    fireEvent.click(screen.getByRole('button', { name: /이전 버전 1개/ }));
    fireEvent.click(screen.getByRole('button', { name: 'README v1 내려받기' }));

    expect(downloadFile).toHaveBeenCalledWith({
      storedName: 'stored-0.docx',
      originalName: 'README (v1)',
    });
  });
});
