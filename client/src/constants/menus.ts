// 사이드바·사용자 메뉴에 나오는 기능 메뉴. 본인 메뉴 숨기기와 첫 화면 고르기가 함께 쓴다.

/** 본인이 숨길 수 있는 메뉴. key 는 그 메뉴를 켜고 끄는 기능 스위치다. */
export const HIDEABLE_MENUS: { key: string; label: string; description: string }[] = [
  { key: 'tools.calendar', label: '일정', description: '전사가 함께 보는 공유 달력' },
  { key: 'discovery.popular', label: '탐색', description: '인기글·태그 모아 보기' },
  { key: 'tools.wiki', label: '위키', description: '함께 고치는 문서' },
  { key: 'post.scrap', label: '스크랩', description: '나중에 볼 글' },
  { key: 'post.drafts', label: '임시저장', description: '쓰다 만 글' },
  { key: 'post.tasks', label: '업무', description: '담당자가 나인 글과, 함께 보는 업무' },
  { key: 'social.dm', label: '메시지', description: '1:1 메시지' },
  { key: 'tools.memo', label: '메모', description: '나만 보는 메모장' },
  { key: 'tools.attendance', label: '출퇴근', description: '출근·퇴근 기록' },
];

/**
 * /dashboard 로 들어왔을 때 갈 수 있는 곳. 본인이 첫 화면으로 고르는 목록이자,
 * 고르지 않았을 때 위에서부터 자동으로 집는 순서다.
 *
 * 스크랩은 스위치 없는 화면이 아니다(post.scrap). 예전에는 '모든 기능을 꺼도 갈 곳' 으로
 * 조건 없이 마지막에 두었는데, 꺼 두면 '꺼져 있습니다' 화면으로 보냈다.
 */
export const LANDING_OPTIONS: Array<{ to: string; feature?: string; label: string }> = [
  // 조망 화면에는 스위치가 없다. 모든 기능을 꺼도 갈 곳이 하나는 있어야 한다.
  { to: 'overview', label: '대시보드' },
  // 이름은 사이드바·메뉴 숨기기에 적힌 것과 같게 둔다 — 한 화면에서 같은 곳을 두 이름으로
  // 부르면 고르는 사람이 둘을 다른 곳으로 읽는다.
  { to: 'calendar', feature: 'tools.calendar', label: '일정' },
  { to: 'explore', feature: 'discovery.popular', label: '탐색' },
  { to: 'memos', feature: 'tools.memo', label: '메모' },
  { to: 'wiki', feature: 'tools.wiki', label: '위키' },
  { to: 'tasks', feature: 'post.tasks', label: '업무' },
  { to: 'scraps', feature: 'post.scrap', label: '스크랩' },
];

function usable(
  option: (typeof LANDING_OPTIONS)[number],
  features: Record<string, boolean>,
  hidden: string[]
): boolean {
  return (
    !option.feature || (features[option.feature] !== false && !hidden.includes(option.feature))
  );
}

/** 지금 갈 수 있는 곳만. 첫 화면 고르개가 보여 줄 목록이기도 하다. */
export function landingOptions(
  features: Record<string, boolean>,
  hidden: string[] = []
): typeof LANDING_OPTIONS {
  return LANDING_OPTIONS.filter(o => usable(o, features, hidden));
}

/**
 * 고른 첫 화면으로 보낸다. 고르지 않았거나, 고른 곳이 그새 꺼졌거나 숨겨졌으면
 * 갈 수 있는 첫 곳으로 — 고를 때는 되던 곳이 나중에 막힐 수 있다.
 */
export function landingPage(
  features: Record<string, boolean>,
  hidden: string[] = [],
  preferred?: string | null
): string {
  const options = landingOptions(features, hidden);
  const chosen = preferred ? options.find(o => o.to === preferred) : undefined;
  return (chosen ?? options[0])?.to ?? 'overview';
}
