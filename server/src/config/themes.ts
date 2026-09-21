// 고를 수 있는 테마. 서버 검사와 화면 목록이 갈리면 저장되지 않는 테마가 생기므로 한곳에 둔다.
// dracula 는 dark 와 같은 규칙에 색만 다르다.

export const USER_THEMES = ['light', 'dark', 'dracula', 'system'] as const;
export type UserTheme = (typeof USER_THEMES)[number];
