// 로그로 남길 값을 컬럼 폭에 맞춰 자른다. 모델 len 검증기로 막으면 긴 값이 INSERT 실패가 되어 기록 자체가 사라진다.

/** 문자열이면 max 자로 자른다. 경계에서 서로게이트 쌍은 쪼개지 않는다. */
export function clampText<T extends string | null | undefined>(value: T, max: number): T {
  if (typeof value !== 'string' || value.length <= max) return value;
  const lastUnit = value.charCodeAt(max - 1);
  // 마지막 자리가 상위 서로게이트면 한 칸 덜 가져간다
  const end = lastUnit >= 0xd800 && lastUnit <= 0xdbff ? max - 1 : max;
  return value.slice(0, end) as T;
}

/** JSON 컬럼에 넣을 값의 직렬화 길이를 제한한다. 넘치면 원래 크기와 앞부분만 남긴다. */
export function clampJson(value: unknown, maxChars: number): unknown {
  if (value === null || value === undefined) return value;
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    // 순환 참조 등 직렬화할 수 없는 값
    return { _truncated: true, _reason: 'not-serializable' };
  }
  if (serialized.length <= maxChars) return value;
  return {
    _truncated: true,
    _originalChars: serialized.length,
    _preview: serialized.slice(0, maxChars),
  };
}
