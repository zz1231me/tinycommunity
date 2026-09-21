import { useEffect, useState } from 'react';

/**
 * 값이 delay(ms) 동안 변하지 않으면 갱신된 값을 반환한다.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
