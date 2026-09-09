// client/src/constants/boardTitles.ts - 게시판 제목 중앙 관리

export const BOARD_TITLES: Record<string, string> = {
  notice: '공지사항',
  onboarding: '온보딩',
  shared: '공유 자료',
  internal: '내부 문서',
  free: '자유게시판',
};

/**
 * boardId로 게시판 제목 반환
 * 알 수 없는 boardId는 첫 글자 대문자로 변환
 */
export const getBoardTitle = (boardId: string): string => {
  return BOARD_TITLES[boardId] ?? boardId.charAt(0).toUpperCase() + boardId.slice(1);
};
