// client/src/utils/safeStorage.ts
// localStorage 를 예외 없이 쓰기 위한 얇은 껍데기.
//
// localStorage 는 값이 없을 때 null 을 주지만, 사이트 데이터를 막아 둔 브라우저나
// 저장 용량이 찬 경우에는 읽기만 해도 예외를 던진다. 그 호출이 useState 초기화나
// 전역 Provider 안에 있으면 화면 전체가 그려지지 않는다.
//
// 저장 실패는 다음 방문에 기본값으로 시작하는 것으로 끝나므로 여기서 삼킨다.

export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 저장에 실패해도 현재 화면 동작에는 영향이 없다.
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // 지우지 못해도 메모리 상태는 이미 비워져 있다.
    }
  },
};
