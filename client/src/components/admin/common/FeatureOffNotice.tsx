// 이 설정이 딸린 기능이 꺼져 있다는 안내와 켜러 가는 링크.

import { Link } from 'react-router-dom';
import { PowerOff } from 'lucide-react';
import { useFeature, type FeatureKey } from '../../../store/features';

export function FeatureOffNotice({ feature, name }: { feature: FeatureKey; name: string }) {
  const enabled = useFeature(feature);
  if (enabled) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
      <PowerOff className="h-3.5 w-3.5 flex-shrink-0" />
      <span>
        <strong className="font-semibold">{name}</strong> 기능이 꺼져 있어, 여기서 정한 값은 아직
        화면에 쓰이지 않습니다.
      </span>
      <Link
        to="/admin/features"
        className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
      >
        기능 설정에서 켜기
      </Link>
    </div>
  );
}
