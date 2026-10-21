// /dashboard 로 들어왔을 때, 본인이 고른 첫 화면으로 보낸다.
// 고르지 않았으면 켜져 있는 기능 중 첫 번째다.

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatures } from '../../store/features';
import { landingPage } from '../../constants/menus';
import { useUiPrefs } from '../../hooks/useUiPrefs';

/** 설정을 기다리는 상한. 이보다 늦으면 기다리지 않고 자동으로 보낸다. */
const WAIT_MS = 1200;

export function DashboardLanding() {
  const features = useFeatures(s => s.features);
  const hidden = useFeatures(s => s.hidden);
  const loaded = useFeatures(s => s.loaded);
  const { prefs, ready } = useUiPrefs();

  // 설정이 늦거나 끝내 오지 않는 날에도 대시보드가 빈 화면으로 멈추면 안 된다.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  // 보낸 뒤에는 되돌릴 수 없다. 고른 곳을 모르는 채로 보내면 새 기기에서 첫 방문마다 엉뚱한
  // 화면이 열린다 — 설정을 읽을 때까지만, 그것도 잠깐만 비워 둔다.
  if (!ready && !waited) return null;

  // 기능 목록을 아직 못 읽었으면 일정으로. 꺼져 있으면 FeatureRoute 가 설명한다.
  const target = loaded ? landingPage(features, hidden, prefs.landing ?? null) : 'calendar';

  return <Navigate to={target} replace />;
}
