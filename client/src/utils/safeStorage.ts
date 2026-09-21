// localStorage 래퍼. 사이트 데이터를 막은 브라우저에서는 읽기만 해도 예외가 나므로 모두 삼킨다.

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
      // 저장 실패는 현재 화면 동작에 영향이 없다.
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // 지우지 못해도 메모리 상태는 이미 비어 있다.
    }
  },
};
