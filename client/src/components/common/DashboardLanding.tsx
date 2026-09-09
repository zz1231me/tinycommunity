// client/src/components/common/DashboardLanding.tsx
// /dashboard 로 들어왔을 때 어디로 보낼지 정한다.
//
// 켜져 있는 기능 중 첫 번째로 보낸다. 목적지를 고정하면 관리자가 그 기능을 껐을 때
// 로그인 직후 첫 화면이 "이 기능은 꺼져 있습니다" 가 된다.

import { Navigate } from 'react-router-dom';
import { useFeatures } from '../../store/features';

/** 위에서부터 살아 있는 첫 곳으로 보낸다 */
const CANDIDATES: Array<{ to: string; feature?: string }> = [
  { to: 'calendar', feature: 'tools.calendar' },
  { to: 'explore', feature: 'discovery.popular' },
  { to: 'memos', feature: 'tools.memo' },
  { to: 'wiki', feature: 'tools.wiki' },
  // 모든 기능을 끈 상태에서도 갈 곳은 있어야 한다.
  // 프로필은 스위치가 없는 화면이라 마지막 보루로 둔다.
  { to: 'scraps' },
];

export function DashboardLanding() {
  const features = useFeatures(s => s.features);
  const loaded = useFeatures(s => s.loaded);

  // 아직 못 읽었으면 기존 동작(일정)을 그대로 쓴다 — 대부분의 경우 맞고,
  // 틀렸더라도 FeatureRoute 가 무슨 일인지 설명해 준다.
  const target = loaded
    ? (CANDIDATES.find(c => !c.feature || features[c.feature] !== false)?.to ?? 'calendar')
    : 'calendar';

  return <Navigate to={target} replace />;
}
