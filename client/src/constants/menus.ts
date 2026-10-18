// 사이드바·사용자 메뉴에 나오는 기능 메뉴. 본인 메뉴 숨기기와 첫 화면 고르기가 함께 쓴다.

/** 본인이 숨길 수 있는 메뉴. key 는 그 메뉴를 켜고 끄는 기능 스위치다. */
export const HIDEABLE_MENUS: { key: string; label: string; description: string }[] = [
  { key: 'tools.calendar', label: '대시보드(일정)', description: '첫 화면의 공유 일정' },
  { key: 'discovery.popular', label: '탐색', description: '인기글·태그 모아 보기' },
  { key: 'tools.wiki', label: '위키', description: '함께 고치는 문서' },
  { key: 'post.scrap', label: '스크랩', description: '나중에 볼 글' },
  { key: 'post.drafts', label: '임시저장', description: '쓰다 만 글' },
  { key: 'post.tasks', label: '업무', description: '담당자가 나인 글과, 함께 보는 업무' },
  { key: 'social.dm', label: '메시지', description: '1:1 메시지' },
  { key: 'tools.memo', label: '메모', description: '나만 보는 메모장' },
  { key: 'tools.attendance', label: '출퇴근', description: '출근·퇴근 기록' },
];

/** /dashboard 로 들어왔을 때 갈 곳. 위에서부터 켜져 있고 숨기지 않은 첫 곳. */
const LANDING_CANDIDATES: Array<{ to: string; feature?: string }> = [
  { to: 'calendar', feature: 'tools.calendar' },
  { to: 'explore', feature: 'discovery.popular' },
  { to: 'memos', feature: 'tools.memo' },
  { to: 'wiki', feature: 'tools.wiki' },
  // 모든 기능을 꺼도 갈 곳이 있어야 해서 스위치 없는 화면을 마지막에 둔다.
  { to: 'scraps' },
];

export function landingPage(features: Record<string, boolean>, hidden: string[] = []): string {
  return (
    LANDING_CANDIDATES.find(
      c => !c.feature || (features[c.feature] !== false && !hidden.includes(c.feature))
    )?.to ?? 'calendar'
  );
}
