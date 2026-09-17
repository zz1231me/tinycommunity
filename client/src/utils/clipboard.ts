// client/src/utils/clipboard.ts
// 텍스트 복사.
//
// 비밀번호 초기화 코드·임시 공유 링크·댓글 전체 복사 세 화면이 공유한다.
// 각자 구현하면 다음 두 가지를 빠뜨리기 쉽다:
//  - select() 앞의 focus() — 없으면 iOS Safari 에서 복사되지 않는다.
//  - 보안 컨텍스트 확인 — HTTP 환경에서 navigator.clipboard 가 거부될 때 폴백이 필요하다.
//
// 별도 라이브러리를 두지 않는다. 필요한 동작이 이 파일 하나에 들어간다.

/**
 * 클립보드에 텍스트를 넣는다.
 *
 * navigator.clipboard 는 보안 컨텍스트(HTTPS·localhost)에서만 쓸 수 있다.
 * 사내망 HTTP 로 접속하는 경우가 있으므로 textarea + execCommand 폴백을 남긴다
 * (execCommand 는 폐기 예정이지만 그 환경에서는 아직 유일한 방법이다).
 *
 * @returns 성공 여부. 던지지 않으므로 호출부는 결과로 안내를 정하면 된다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 권한 거부 등 — 아래 폴백으로 한 번 더 시도한다
    }
  }

  return copyViaTextarea(text);
}

/** 화면 밖 textarea 를 잠깐 만들어 선택 후 복사한다 */
function copyViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // 화면에 보이지 않되 선택은 가능해야 한다 — display:none 이면 선택이 안 된다
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);

  try {
    // iOS Safari 는 focus() 없이 select() 만 하면 선택 영역이 잡히지 않는다
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
