// client/src/components/attendance/CheckInDialog.test.tsx
//
// 출근 확인 창이 출근 시각 보정을 미리 알리는가.
//
// 보정은 실제 근무 기록을 바꾸는 값이다. 안내가 출근 알림 팝업에만 있고 이 창에는
// 없어서, 출근 페이지의 '출근' 버튼으로 찍는 사람은 자기 기록이 당겨진다는 것을 몰랐다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckInDialog } from './CheckInDialog';
import type { ChecklistItem } from '../../types/attendance.types';

const item = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: 1,
  label: '보안 점검',
  description: '',
  required: true,
  order: 1,
  isActive: true,
  ...over,
});

const open = (props: { graceMinutes?: number; items?: ChecklistItem[] } = {}) =>
  render(
    <CheckInDialog
      items={props.items ?? []}
      requireChecklist
      graceMinutes={props.graceMinutes}
      submitting={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );

describe('출근 시각 보정 안내', () => {
  it('보정이 있으면 몇 분 앞당겨지는지 알린다', () => {
    open({ graceMinutes: 10 });
    expect(screen.getByText('출근 시각은 10분 앞당겨 기록됩니다.')).toBeInTheDocument();
  });

  it('보정이 0 이면 아무 말도 하지 않는다 — 음성 대조', () => {
    open({ graceMinutes: 0 });
    expect(screen.queryByText(/앞당겨 기록/)).not.toBeInTheDocument();
  });

  it('남은 필수 항목이 있으면 그 안내가 먼저다', () => {
    // 지금 해야 할 일이 먼저 보여야 한다. 보정은 항목을 다 체크하면 다시 보인다.
    open({ graceMinutes: 10, items: [item()] });
    expect(screen.getByText('확인하지 않은 항목 1개')).toBeInTheDocument();
    expect(screen.queryByText(/앞당겨 기록/)).not.toBeInTheDocument();
  });
});
