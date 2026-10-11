// /dashboard 로 들어왔을 때 켜져 있는 기능 중 첫 번째로 보낸다.

import { Navigate } from 'react-router-dom';
import { useFeatures } from '../../store/features';
import { landingPage } from '../../constants/menus';

export function DashboardLanding() {
  const features = useFeatures(s => s.features);
  const hidden = useFeatures(s => s.hidden);
  const loaded = useFeatures(s => s.loaded);

  // 아직 못 읽었으면 일정으로 보낸다. 꺼져 있으면 FeatureRoute 가 설명한다.
  const target = loaded ? landingPage(features, hidden) : 'calendar';

  return <Navigate to={target} replace />;
}
