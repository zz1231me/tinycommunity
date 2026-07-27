import { useEffect, useState } from 'react';

/**
 * 값이 delay(ms) 동안 변하지 않을 때까지 기다렸다가 갱신된 값을 반환한다.
 * 검색 입력 등에서 키 입력마다 API를 호출하지 않도록 디바운스할 때 사용.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
