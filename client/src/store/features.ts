// 화면 숨김용 기능 목록. 실제 차단은 서버 requireFeature 가 하므로 조회 실패 시 모두 켜짐으로 둔다.

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
      // 못 읽었으면 아무것도 숨기지 않는다.
      set({ features: {}, loaded: true });
    }
  },
  set: features => set({ features, loaded: true }),
}));

/** 화면 노출 여부. 못 읽었거나 목록에 없는 키는 켜진 것으로 본다. */
export function useFeature(key: FeatureKey): boolean {
  return useFeatures(s => s.features[key] !== false);
}
