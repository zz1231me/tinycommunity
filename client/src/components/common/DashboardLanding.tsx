// /dashboard 로 들어왔을 때 켜져 있는 기능 중 첫 번째로 보낸다.

import { Navigate } from 'react-router-dom';
import { useFeatures } from '../../store/features';

/** 위에서부터 살아 있는 첫 곳으로 보낸다. */
const CANDIDATES: Array<{ to: string; feature?: string }> = [
  { to: 'calendar', feature: 'tools.calendar' },
  { to: 'explore', feature: 'discovery.popular' },
  { to: 'memos', feature: 'tools.memo' },
  { to: 'wiki', feature: 'tools.wiki' },
  // 모든 기능을 꺼도 갈 곳이 있어야 해서 스위치 없는 화면을 마지막에 둔다.
  { to: 'scraps' },
];

export function DashboardLanding() {
  const features = useFeatures(s => s.features);
  const loaded = useFeatures(s => s.loaded);

  // 아직 못 읽었으면 일정으로 보낸다. 꺼져 있으면 FeatureRoute 가 설명한다.
  const target = loaded
    ? (CANDIDATES.find(c => !c.feature || features[c.feature] !== false)?.to ?? 'calendar')
    : 'calendar';

  return <Navigate to={target} replace />;
}
