// 점검 모드는 서버가 응답으로 알려 준다.
//
// 관리자가 점검을 켜면 서버는 503 에 maintenanceMode: true 와 안내 문구를 실어 보낸다.
// 그런데 화면은 시작할 때 읽어 둔 설정만 보고 있어서, 이미 열어 둔 탭은 평소와 똑같아 보이고
// 누르는 것마다 조용히 실패했다. 서버가 보내 주는 신호를 받아 점검 화면으로 바꾼다.

import { useSiteSettings } from '../store/siteSettings';

interface MaintenanceBody {
  maintenanceMode?: unknown;
  message?: unknown;
}

/** 503 + maintenanceMode 응답이면 화면을 점검 상태로 돌린다. */
export function applyMaintenanceSignal(error: unknown): void {
  const res = (error as { response?: { status?: number; data?: MaintenanceBody } })?.response;
  if (res?.status !== 503 || res.data?.maintenanceMode !== true) return;

  const { settings, updateSettings } = useSiteSettings.getState();
  // 이미 점검 중으로 알고 있으면 건드리지 않는다. 매 응답마다 store 를 흔들면 화면이 다시 그려진다.
  if (settings.maintenanceMode) return;

  const message = typeof res.data?.message === 'string' ? res.data.message : '';
  updateSettings({
    maintenanceMode: true,
    ...(message ? { maintenanceMessage: message } : {}),
  });
}
