// server/src/config/themes.ts
// 사용자가 고를 수 있는 테마.
//
// 값 검사는 서버가 하고 화면은 클라이언트가 그린다. 목록이 갈리면 고를 수는 있는데
// 저장은 안 되는 테마가 생기므로 한곳에 둔다.
//
// dracula 는 다크의 변종이다. 화면에는 dark 와 같은 규칙을 쓰되 색만 갈아 끼운다.
// https://github.com/dracula/dracula-theme

export const USER_THEMES = ['light', 'dark', 'dracula', 'system'] as const;
export type UserTheme = (typeof USER_THEMES)[number];
