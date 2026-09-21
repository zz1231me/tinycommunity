/**
 * 클립보드에 텍스트를 넣는다. HTTP 환경에서는 navigator.clipboard 가 거부되어 textarea 폴백을 쓴다.
 *
 * @returns 성공 여부. 던지지 않는다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 권한 거부 등은 아래 폴백으로 다시 시도한다.
    }
  }

  return copyViaTextarea(text);
}

/** 화면 밖 textarea 를 잠깐 만들어 선택 후 복사한다 */
function copyViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // display:none 이면 선택이 안 되므로 화면 밖으로 밀어 둔다.
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);

  try {
    // iOS Safari 는 focus() 없이 select() 하면 선택 영역이 잡히지 않는다.
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}
