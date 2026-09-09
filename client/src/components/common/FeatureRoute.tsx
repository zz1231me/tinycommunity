// client/src/components/common/FeatureRoute.tsx
// 관리자가 끈 기능의 화면을 열었을 때 무슨 일이 일어났는지 알려 준다.
//
// 안내가 없으면 화면이 "비어 있음" 으로 보여, 자료가 없는 것인지 기능이 꺼진 것인지
// 구별할 수 없다.
//
// 메뉴를 숨기는 것만으로는 부족하다. 주소를 직접 입력하거나, 알림·북마크 링크로
// 들어오거나, 보고 있는 동안 관리자가 끄는 경우가 남는다.

import { Link } from 'react-router-dom';
import { PowerOff } from 'lucide-react';
import { PageContainer } from './PageContainer';
import { useFeature, useFeatures, type FeatureKey } from '../../store/features';

interface Props {
  feature: FeatureKey;
  /** 안내에 쓸 기능 이름 — "위키 기능이 꺼져 있습니다" */
  name: string;
  children: React.ReactNode;
}

export function FeatureRoute({ feature, name, children }: Props) {
  const enabled = useFeature(feature);
  const loaded = useFeatures(s => s.loaded);

  // 아직 못 읽었으면 막지 않는다 — store 와 같은 원칙이다.
  // 잘못 숨기는 것보다 잠깐 보여 주고 서버가 막는 편이 낫다.
  if (!loaded || enabled) return <>{children}</>;

  return (
    <PageContainer>
      <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <PowerOff className="h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {name} 기능이 꺼져 있습니다.
        </p>
        <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
          관리자가 이 기능을 사용하지 않도록 설정했습니다. 지금까지의 내용은 지워지지 않으며, 다시
          켜면 그대로 돌아옵니다.
        </p>
        <Link to="/dashboard" className="btn-secondary mt-1">
          홈으로
        </Link>
      </div>
    </PageContainer>
  );
}
