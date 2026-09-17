// server/src/utils/clamp.ts
// 로그로 남길 값을 컬럼 폭에 맞춰 자른다.
//
// 로그는 "실패하느니 잘려서라도 남는" 쪽이 옳다. 모델에 len 검증기를 달면 반대가 된다 —
// 값이 길면 INSERT 가 거부되고, 로그 서비스들은 실패를 삼키므로 기록이 통째로 사라진다.
// 그러면 긴 URL 을 쓰는 것만으로 흔적을 지울 수 있다.
//
// SQLite 는 VARCHAR 길이를 강제하지 않아 로컬에서는 넘겨도 그냥 저장된다. MySQL·MariaDB·
// PostgreSQL 은 거부한다 — 이 프로젝트는 넷 다 지원하므로, 개발에서 안 보이고 운영에서만
// 기록이 비는 형태가 된다. 그래서 쓰는 쪽에서 자른다.

/**
 * 문자열이면 max 자로 자른다. null·undefined·비문자열은 그대로 둔다.
 *
 * 경계에서 서로게이트 쌍을 쪼개지 않는다. 이모지 같은 보조 평면 문자는 코드 유닛 두 개로
 * 이루어져 있어 그냥 slice 하면 짝 잃은 상위 서로게이트가 남고, UTF-8 로 내보낼 때
 * U+FFFD 로 뭉개진다(실측: 499자 + 😀 를 500 으로 자르면 끝이 0xD83D 로 남았다).
 * 이 사이트에는 이름에 이모지를 쓰는 계정이 실제로 있고 route 에도 들어올 수 있다.
 */
export function clampText<T extends string | null | undefined>(value: T, max: number): T {
  if (typeof value !== 'string' || value.length <= max) return value;
  const lastUnit = value.charCodeAt(max - 1);
  // 마지막 자리가 상위 서로게이트면 짝이 잘린 것이므로 한 칸 덜 가져간다
  const end = lastUnit >= 0xd800 && lastUnit <= 0xdbff ? max - 1 : max;
  return value.slice(0, end) as T;
}

/**
 * JSON 컬럼에 넣을 값의 크기를 제한한다.
 *
 * 키 개수에 상한이 없으면 본문 하나가 로그 한 행을 수십만 자로 부풀린다
 * (실측: 키 3,000개짜리 본문 → requestBody 183,063자). 문자열 하나하나를 잘라도
 * 개수는 못 막으므로 직렬화 길이로 한 번 더 막는다.
 *
 * 넘치면 버리지 않고 "얼마나 컸는지" 를 남긴다 — 크기 자체가 신호다.
 */
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
