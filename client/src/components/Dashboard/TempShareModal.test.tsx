// client/src/components/Dashboard/TempShareModal.test.tsx
//
// 이 대화상자만 body 로 포털한다(머리글의 backdrop-blur 가 fixed 의 기준이 되는 문제).
// 포커스 가두기가 포털 경계를 넘어서도 동작하는지를 본다 — ref 가 가리키는 것은
// 어차피 실제 DOM 노드지만, '그럴 것이다' 와 '그렇다' 는 다르다.
//
// 그리고 기능이 꺼져 있을 때 ESC 를 먹지 않는지도 함께 고정한다. 그리지도 않은
// 대화상자가 ESC 를 가로채면 뒤에 있는 화면의 ESC 가 동작하지 않는다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TempShareModal } from './TempShareModal';

const featureOn = vi.hoisted(() => ({ value: true }));

vi.mock('../../store/features', () => ({
  useFeature: () => featureOn.value,
}));

vi.mock('../../store/siteSettings', () => ({
  useSiteSettings: (select: (s: { settings: { maxFileSizeMb: number } }) => unknown) =>
    select({ settings: { maxFileSizeMb: 10 } }),
}));

const btn = (name: string) => screen.getByRole('button', { name });

describe('파일공유 대화상자의 포커스', () => {
  it('포털로 띄워도 안쪽으로 포커스가 들어온다', async () => {
    featureOn.value = true;
    render(<TempShareModal open onClose={vi.fn()} />);

    await waitFor(() => expect(document.activeElement).toBe(btn('닫기')));
  });

  // Tab 순환은 여기서 보지 않는다. 이 대화상자는 파일을 고르기 전에는 포커스를 받는
  // 것이 닫기 단추 하나뿐이라 처음과 마지막이 같다 — 가두든 말든 결과가 같아서
  // 무엇도 가려내지 못한다. 진짜 순환은 신고 대화상자(ReportButton)에서 본다.

  it('ESC 를 누르면 닫는다', () => {
    // ESC 는 포커스가 어디 있든 동작한다 — 첫 포커스를 기다릴 이유가 없다.
    // 기다리면 첫 포커스가 깨질 때 이 테스트까지 덩달아 깨져 원인이 흐려진다.
    featureOn.value = true;
    const onClose = vi.fn();
    render(<TempShareModal open onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('기능이 꺼져 있으면 ESC 를 가로채지 않는다 — 음성 대조', () => {
    // 그리지도 않은 대화상자가 ESC 를 먹으면 뒤쪽 화면의 ESC 가 죽는다
    featureOn.value = false;
    const onClose = vi.fn();
    render(<TempShareModal open onClose={onClose} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
