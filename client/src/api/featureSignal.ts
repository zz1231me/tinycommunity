// 기능 스위치가 꺼진 것을 열어 둔 탭이 알아채게 한다.
//
// 스위치 목록은 로그인할 때 한 번만 읽는다. 관리자가 도중에 기능을 끄면 서버는
// 403 + code: 'FEATURE_DISABLED' 로 정확히 알려 주는데, 그것을 읽는 자리가 없었다.
// 그래서 화면은 메뉴를 그대로 두고, 눌러 보면 각 판이 "잠시 후 다시 시도해주세요" 라고
// 엉뚱한 원인을 댔다. 기다려도 달라지지 않는다 — 관리자가 끈 것이니까.
//
// 끊긴 기능 하나만 끄는 대신 목록을 다시 읽는다. 그러면 그 사이 다시 켜진 기능도 같이
// 돌아온다. 숨기기만 하면 켜진 뒤에도 새로고침할 때까지 숨은 채로 남는다.

import { useFeatures } from '../store/features';

interface FeatureBody {
  code?: unknown;
}

/** 한 화면에서 여러 판이 동시에 거절당한다. 목록은 한 번만 다시 읽는다. */
let refreshing = false;

export function applyFeatureSignal(error: unknown): void {
  const res = (error as { response?: { status?: number; data?: FeatureBody } })?.response;
  if (res?.status !== 403 || res.data?.code !== 'FEATURE_DISABLED') return;
  if (refreshing) return;

  refreshing = true;
  void useFeatures
    .getState()
    .load()
    .finally(() => {
      refreshing = false;
    });
}
