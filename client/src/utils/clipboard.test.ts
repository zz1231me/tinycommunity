// client/src/utils/clipboard.test.ts
// 복사는 "되면 다행" 이 아니라 환경마다 되는지가 갈리는 동작이다.
// 사내망 HTTP, 권한 거부, iOS Safari 처럼 갈리는 지점을 고정한다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

const originalClipboard = navigator.clipboard;
const originalSecure = window.isSecureContext;

function setEnvironment({ secure, clipboard }: { secure: boolean; clipboard?: unknown }) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

beforeEach(() => {
  document.execCommand = vi.fn().mockReturnValue(true);
});

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard,
    configurable: true,
  });
  Object.defineProperty(window, 'isSecureContext', { value: originalSecure, configurable: true });
  vi.restoreAllMocks();
});

describe('보안 컨텍스트(HTTPS·localhost)', () => {
  it('navigator.clipboard 로 복사한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setEnvironment({ secure: true, clipboard: { writeText } });

    expect(await copyText('복사할 내용')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('복사할 내용');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('권한이 거부되면 폴백으로 한 번 더 시도한다', async () => {
    // 사용자가 클립보드 권한을 막아 두면 writeText 가 거부된다 —
    // 거기서 끝내면 복사가 되는 환경인데도 실패로 끝난다
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    setEnvironment({ secure: true, clipboard: { writeText } });

    expect(await copyText('내용')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('비보안 컨텍스트(사내망 HTTP)', () => {
  it('navigator.clipboard 를 건드리지 않고 폴백을 쓴다', async () => {
    // 이 환경에서 clipboard API 는 없거나 거부된다
    const writeText = vi.fn();
    setEnvironment({ secure: false, clipboard: { writeText } });

    expect(await copyText('사내망')).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('clipboard API 자체가 없어도 복사한다', async () => {
    setEnvironment({ secure: false, clipboard: undefined });
    expect(await copyText('내용')).toBe(true);
  });
});

describe('폴백 동작', () => {
  it('select() 앞에 focus() 를 부른다 — iOS Safari 는 이게 없으면 선택이 안 된다', async () => {
    setEnvironment({ secure: false, clipboard: undefined });
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select');

    await copyText('내용');

    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();
    expect(focus.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0]);
  });

  it('복사한 뒤 임시 textarea 를 남기지 않는다', async () => {
    setEnvironment({ secure: false, clipboard: undefined });
    await copyText('내용');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('execCommand 가 실패하면 false 를 돌려준다', async () => {
    setEnvironment({ secure: false, clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('내용')).toBe(false);
  });

  it('execCommand 가 던져도 textarea 를 정리하고 false 를 돌려준다', async () => {
    setEnvironment({ secure: false, clipboard: undefined });
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('unsupported');
    });

    expect(await copyText('내용')).toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('빈 값', () => {
  it('빈 문자열은 복사하지 않는다', async () => {
    const writeText = vi.fn();
    setEnvironment({ secure: true, clipboard: { writeText } });

    expect(await copyText('')).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
