// client/src/pages/components/calendar/components/CalendarModal.test.tsx
//
// 일정 대화상자의 포커스 가두기.
//
// 여기는 본문 편집기를 lazy 로 불러온다. 훅의 첫 포커스는 setTimeout(0) 이라 편집기가
// 아직 안 왔을 수 있는데, 머리글의 닫기 단추는 Suspense 밖이라 줄 곳이 언제나 있다.
// 그 전제를 고정한다 — 깨지면 열었을 때 포커스가 아무 데도 가지 않는다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CalendarModal } from './CalendarModal';
import type { EventFormData } from '../types';

const noop = () => {};

/** 머리글만 그리게 둔다 — 상세 화면의 필드 모양에 이 테스트가 매이지 않도록 */
const renderModal = (onClose = vi.fn()) => {
  render(
    <CalendarModal
      isOpen
      mode="view"
      selectedEvent={null}
      formData={{} as EventFormData}
      canEdit={false}
      canDelete={false}
      onClose={onClose}
      onEdit={noop}
      onDelete={noop}
      onSubmit={noop}
      onFormChange={noop}
      onCancelEdit={noop}
    />
  );
  return onClose;
};

describe('일정 대화상자의 포커스', () => {
  it('열면 닫기 단추로 포커스가 들어온다', async () => {
    renderModal();
    // 패널에 ref 가 없으면 훅이 가둘 상자를 못 찾아 포커스가 body 에 남는다
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }))
    );
  });

  it('ESC 를 누르면 닫는다', () => {
    const onClose = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('대화상자로 알린다', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: '일정 상세' })).toBeInTheDocument();
  });
});

// 반복 일정을 고칠 때 '어디까지' 를 먼저 묻는다.
//
// 번째를 눌러 수정에 들어가면 예전에는 그대로 규칙 전체가 바뀌었다 — 제목만 고쳐도
// 시작 날짜가 그 날로 밀려 앞의 날들이 사라졌다. 이제 범위를 고르고, 덜 위험한
// '이 날만' 이 기본이다.
describe('반복 일정 수정 범위', () => {
  const form = {
    title: '회의',
    body: '',
    isAllday: false,
    start: '2026-11-20',
    end: '2026-11-20',
    category: 'meeting',
    location: '',
    color: '#3B82F6',
    backgroundColor: '#3B82F6',
  } as EventFormData;

  const renderEdit = (props: Record<string, unknown> = {}) => {
    const onEditScopeChange = vi.fn();
    render(
      <CalendarModal
        isOpen
        mode="edit"
        selectedEvent={{ id: 1, title: '회의' } as never}
        formData={form}
        canEdit
        canDelete
        onClose={noop}
        onEdit={noop}
        onDelete={noop}
        onSubmit={noop}
        onFormChange={noop}
        onCancelEdit={noop}
        onEditScopeChange={onEditScopeChange}
        {...props}
      />
    );
    return onEditScopeChange;
  };

  it('반복의 번째면 범위를 고르는 줄이 있다', () => {
    renderEdit({ editScope: 'one' });
    expect(screen.getByRole('radio', { name: '이 날만' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '반복 전체' })).not.toBeChecked();
  });

  it('고르면 알려 준다', () => {
    const onEditScopeChange = renderEdit({ editScope: 'one' });
    fireEvent.click(screen.getByRole('radio', { name: '반복 전체' }));
    expect(onEditScopeChange).toHaveBeenCalledWith('all');
  });

  it('반복 전체를 고르면 앞의 날이 사라질 수 있다고 알린다', () => {
    renderEdit({ editScope: 'all' });
    expect(screen.getByText(/반복하는 모든 날이 함께 바뀝니다/)).toBeInTheDocument();
  });

  it('보통 일정에는 그 줄을 두지 않는다 — 양성 대조', () => {
    renderEdit({ editScope: undefined });
    expect(screen.queryByRole('radio', { name: '이 날만' })).not.toBeInTheDocument();
  });
});
