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
