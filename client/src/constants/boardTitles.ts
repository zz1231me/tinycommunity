export const BOARD_TITLES: Record<string, string> = {
  notice: '공지사항',
  onboarding: '온보딩',
  shared: '공유 자료',
  internal: '내부 문서',
  free: '자유게시판',
};

/** boardId 로 게시판 제목을 얻는다. 알 수 없는 id 는 첫 글자를 대문자로 바꿔 쓴다. */
export const getBoardTitle = (boardId: string): string => {
  return BOARD_TITLES[boardId] ?? boardId.charAt(0).toUpperCase() + boardId.slice(1);
};
