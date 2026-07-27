// client/src/utils/sessionExpiry.ts
// 세션 만료로 인한 강제 로그아웃 시, 하드 리다이렉트(전체 새로고침) 후에도 안내 토스트를
// 띄우기 위한 1회성 플래그. 메모리 상태는 새로고침으로 사라지므로 sessionStorage를 사용한다.
const KEY = 'session_expired';

/** 세션 만료 표시 — 다음 페이지 로드 때 consumeSessionExpired()가 1회 소비한다. */
export const flagSessionExpired = (): void => {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // 프라이빗 모드 등 sessionStorage 불가 — 플래그 없이 진행(리다이렉트는 그대로 동작)
  }
};

/** 만료 플래그가 있으면 true를 반환하고 즉시 제거(1회성). 없으면 false. */
export const consumeSessionExpired = (): boolean => {
  try {
    if (sessionStorage.getItem(KEY) === '1') {
      sessionStorage.removeItem(KEY);
      return true;
    }
  } catch {
    // noop
  }
  return false;
};
