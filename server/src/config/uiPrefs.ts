// 사람마다 다른 '보기 설정'. 권한이 아니라 취향이다.
//
// 지금까지 이 값들은 브라우저 localStorage 에만 있어서 기기를 바꾸면 초기화됐다
// (숨긴 메뉴는 계정에 저장하는데 보기 설정만 기기에 남아 있었다). 계정에 옮긴다.
//
// 아무 JSON 이나 받지 않는다. 키와 값을 여기서 못박아 두고 서버가 검사한다 —
// 화면이 보내는 값을 그대로 저장하면 남이 못 읽는 쓰레기가 쌓인다.

export const UI_PREF_SPEC = {
  /** 업무 화면의 보기 방식 */
  taskView: ['list', 'kanban', 'gantt'],
  /** 업무 목록 정렬 */
  taskSort: ['stale', 'due', 'priority'],
  /** 완료한 일도 함께 보기 */
  taskShowDone: [true, false],
  /** 간트의 확대 단위 */
  taskGanttZoom: ['day', 'week', 'month'],
  /**
   * /dashboard 로 들어왔을 때 갈 첫 화면. 'auto' 는 켜져 있는 첫 곳으로 — 고르기를 무르는 값이다
   * (보낸 키만 덮어쓰므로, 되돌릴 값이 없으면 한 번 고른 뒤로는 자동으로 돌아갈 수 없다).
   * 고른 곳이 나중에 꺼지면 화면이 알아서 다음 곳으로 보낸다.
   */
  landing: ['auto', 'calendar', 'explore', 'memos', 'wiki', 'tasks', 'scraps'],
} as const;

export type UiPrefKey = keyof typeof UI_PREF_SPEC;
export type UiPrefs = Partial<{
  taskView: (typeof UI_PREF_SPEC.taskView)[number];
  taskSort: (typeof UI_PREF_SPEC.taskSort)[number];
  taskShowDone: boolean;
  taskGanttZoom: (typeof UI_PREF_SPEC.taskGanttZoom)[number];
  landing: (typeof UI_PREF_SPEC.landing)[number];
}>;

function isUiPrefKey(key: string): key is UiPrefKey {
  return Object.prototype.hasOwnProperty.call(UI_PREF_SPEC, key);
}

/**
 * 받은 값에서 아는 키·아는 값만 남긴다. 모르는 것은 조용히 버린다 —
 * 보기 설정 때문에 저장이 실패하면 화면 조작이 막힌다.
 */
export function sanitizeUiPrefs(input: unknown): UiPrefs {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isUiPrefKey(key)) continue;
    if ((UI_PREF_SPEC[key] as readonly unknown[]).includes(value)) out[key] = value;
  }
  return out as UiPrefs;
}

/** 저장된 JSON 을 읽는다. 깨져 있으면 빈 값. */
export function parseUiPrefs(raw: string | null | undefined): UiPrefs {
  if (!raw) return {};
  try {
    return sanitizeUiPrefs(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}
