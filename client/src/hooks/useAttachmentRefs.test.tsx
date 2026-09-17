// client/src/hooks/useAttachmentRefs.test.tsx
// 본문에 꽂힌 증적 참조가 실제 첨부와 이어지는지, 첨부가 사라졌을 때
// 그 사실이 남는지를 고정한다. 이 둘이 무너지면 "증적" 이라는 목적 자체가 깨진다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { useAttachmentRefs, type AttachmentRefTarget } from './useAttachmentRefs';

const mockDownload = vi.fn();
vi.mock('../utils/downloadUtils', () => ({
  downloadFile: (info: unknown) => mockDownload(info),
}));

const ATTACHMENTS: AttachmentRefTarget[] = [
  { originalName: '결과.xlsx', storedName: 'stored-1', size: 2048, url: '/api/x/stored-1' },
  { originalName: '증적.png', storedName: 'stored-2', size: 1024, url: '/api/x/stored-2' },
];

function Harness({
  html,
  attachments = ATTACHMENTS,
  onPreviewImage,
  enabled = true,
}: {
  html: string;
  attachments?: AttachmentRefTarget[];
  onPreviewImage?: (url: string, alt: string) => void;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useAttachmentRefs(ref, attachments, onPreviewImage, enabled);
  return <div ref={ref} data-testid="body" dangerouslySetInnerHTML={{ __html: html }} />;
}

const ref = (name: string) =>
  `<p>1단계 <span class="attachment-ref" data-attachment="${name}">${name}</span></p>`;

beforeEach(() => vi.clearAllMocks());

describe('첨부가 있는 참조', () => {
  it('파일명과 용량을 보여준다', () => {
    render(<Harness html={ref('결과.xlsx')} />);
    expect(screen.getByText('결과.xlsx')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('클릭하면 그 첨부를 내려받는다', () => {
    render(<Harness html={ref('결과.xlsx')} />);
    fireEvent.click(screen.getByRole('button', { name: /결과.xlsx/ }));
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({ storedName: 'stored-1', originalName: '결과.xlsx' })
    );
  });

  it('본문이 다시 그려져도 다시 꾸민다 — 눌러도 아무 일 없는 상태가 되면 안 된다', () => {
    // 상세 화면은 dangerouslySetInnerHTML 로 본문을 붙인다. 다시 그려지면 여기서
    // 꾸며 둔 카드가 통째로 버려지는데, 그 뒤에 훅이 다시 돌 계기가 없으면
    // 참조가 맨 글자로 남아 눌러도 아무 일도 일어나지 않는다.
    const { getByTestId } = render(<Harness html={ref('결과.xlsx')} />);
    const body = getByTestId('body');
    expect(body.querySelector('span.attachment-ref')?.getAttribute('data-ref-ready')).toBe('true');

    // React 가 본문을 새로 붙이는 것과 같은 일을 손으로 일으킨다
    body.innerHTML = ref('결과.xlsx');
    expect(body.querySelector('span.attachment-ref')?.getAttribute('data-ref-ready')).toBeNull();

    // 자식 교체를 지켜보다 다시 꾸며야 한다
    return waitFor(() => {
      const el = body.querySelector('span.attachment-ref');
      expect(el?.getAttribute('data-ref-ready')).toBe('true');
      expect(el?.getAttribute('role')).toBe('button');
    });
  });

  it('Enter 로도 열 수 있다', () => {
    render(<Harness html={ref('결과.xlsx')} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /결과.xlsx/ }), { key: 'Enter' });
    expect(mockDownload).toHaveBeenCalled();
  });

  it('이미지 첨부는 내려받지 않고 미리보기로 넘긴다', () => {
    const onPreview = vi.fn();
    render(<Harness html={ref('증적.png')} onPreviewImage={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: /증적.png/ }));
    expect(onPreview).toHaveBeenCalledWith('/api/x/stored-2', '증적.png');
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('첨부가 사라진 참조', () => {
  it('무엇이 없어졌는지 남긴다', () => {
    render(<Harness html={ref('지워진파일.pdf')} />);
    expect(screen.getByText('삭제된 첨부: 지워진파일.pdf')).toBeInTheDocument();
  });

  it('클릭해도 다운로드를 시도하지 않는다', () => {
    const { getByText } = render(<Harness html={ref('지워진파일.pdf')} />);
    fireEvent.click(getByText('삭제된 첨부: 지워진파일.pdf'));
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('본문에 참조가 없을 때', () => {
  it('아무것도 건드리지 않는다', () => {
    render(<Harness html="<p>그냥 본문</p>" />);
    expect(screen.getByTestId('body').innerHTML).toBe('<p>그냥 본문</p>');
  });
});

describe('기능이 꺼져 있을 때', () => {
  it('참조를 건드리지 않는다 — 삭제된 첨부로 오해시키지 않는다', () => {
    // 관리자가 문단별 첨부를 꺼도 첨부 자체는 남아 있다.
    // "삭제된 첨부" 로 표시하면 남아 있는 파일을 없다고 알리게 된다.
    const { getByTestId } = render(<Harness html={ref('결과.xlsx')} enabled={false} />);
    expect(getByTestId('body').innerHTML).toBe(ref('결과.xlsx'));
    expect(screen.queryByText(/삭제된 첨부/)).not.toBeInTheDocument();
  });
});
