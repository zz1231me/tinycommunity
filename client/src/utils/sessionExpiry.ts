// 세션 만료 후 하드 리다이렉트를 거쳐도 안내를 띄우기 위한 1회성 플래그(sessionStorage).
const KEY = 'session_expired';

/** 세션 만료 표시. 다음 로드 때 consumeSessionExpired() 가 1회 소비한다. */
export const flagSessionExpired = (): void => {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage 를 못 쓰면 플래그 없이 진행한다.
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
