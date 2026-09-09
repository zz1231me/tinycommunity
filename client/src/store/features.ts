// client/src/store/features.ts
// 지금 켜져 있는 기능들. 메뉴·버튼을 숨기는 데만 쓴다.
//
// ⚠️ 여기서 숨기는 것은 안내이지 차단이 아니다. 실제 차단은 서버의 requireFeature 가 한다.
//    이 store 가 비어 있거나 조회에 실패해도 보안이 약해지지는 않는다 — 최악의 경우
//    눌러 봐야 403 이 뜰 뿐이다. 그래서 실패 시에는 "모두 켜짐" 으로 둔다:
//    설정을 못 읽었다고 멀쩡한 기능이 사라져 보이는 쪽이 더 나쁘다.

import { create } from 'zustand';
import api from '../api/axios';
import { unwrap } from '../api/utils';

export type FeatureKey = string;

interface FeatureState {
  features: Record<FeatureKey, boolean>;
  loaded: boolean;
  load: () => Promise<void>;
  /** 관리자 화면에서 저장한 직후 곧바로 반영하기 위한 것 */
  set: (features: Record<FeatureKey, boolean>) => void;
}

export const useFeatures = create<FeatureState>(set => ({
  features: {},
  loaded: false,
  load: async () => {
    try {
      const res = await api.get('/features');
      set({ features: unwrap<Record<string, boolean>>(res), loaded: true });
    } catch {
      // 못 읽었으면 아무것도 숨기지 않는다 (위 주석 참고)
      set({ features: {}, loaded: true });
    }
  },
  set: features => set({ features, loaded: true }),
}));

/**
 * 이 기능을 화면에 노출할지.
 * 아직 못 읽었거나 목록에 없는 키는 켜진 것으로 본다 — 잘못 숨기는 것보다 낫다.
 */
export function useFeature(key: FeatureKey): boolean {
  return useFeatures(s => s.features[key] !== false);
}
