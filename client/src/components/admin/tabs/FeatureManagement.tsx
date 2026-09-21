// 기능 스위치 관리 화면. 즉시 저장이 아니라 고친 뒤 한 번에 저장한다.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Monitor, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { fetchFeatureCatalog, saveFeatures, type AdminFeature } from '../../../api/features';
import { adminKeys } from '../../../api/queryKeys';
import { getApiErrorMessage } from '../../../api/utils';
import { useFeatures } from '../../../store/features';
import { toast } from '../../../utils/toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import { Link } from 'react-router-dom';
import { FEATURE_SETTINGS } from '../../../constants/featureSettings';

function FeatureRow({
  feature,
  value,
  labelOf,
  onChange,
}: {
  feature: AdminFeature;
  value: boolean;
  /** 의존성 키를 사람이 읽는 이름으로 바꾼다. */
  labelOf: (key: string) => string;
  onChange: (key: string, next: boolean) => void;
}) {
  // 켜 두었지만 선행 기능이 꺼져 실제로는 동작하지 않는 상태.
  const blocked = value && !feature.effective;
  const blockedBy = blocked ? feature.requires : [];
  const settingsLink = FEATURE_SETTINGS[feature.key];

  return (
    <div className="flex items-start gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {feature.label}
          </span>
          {feature.clientOnly && (
            <span
              className="badge badge-gray inline-flex items-center gap-1"
              title="API로 막을 것이 없어 화면 표시에만 적용됩니다."
            >
              <Monitor className="h-3 w-3" />
              화면 전용
            </span>
          )}
          {blocked && (
            <span className="badge badge-warning inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {blockedBy.map(labelOf).join(', ')} 꺼짐
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{feature.description}</p>
        {feature.requires.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">
            필요한 기능: {feature.requires.map(labelOf).join(', ')}
          </p>
        )}
        {feature.updatedBy && (
          <p className="mt-1 text-xs text-slate-400">마지막 변경: {feature.updatedBy}</p>
        )}

        {/* 세부 설정이 다른 탭에 있으면 그리로 보낸다 */}
        {settingsLink && (
          <Link
            to={`${settingsLink.path}#${settingsLink.section}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {settingsLink.label}
          </Link>
        )}
      </div>

      <ToggleSwitch
        checked={value}
        label={`${feature.label} 사용`}
        onChange={next => onChange(feature.key, next)}
      />
    </div>
  );
}

const FeatureManagement = () => {
  const queryClient = useQueryClient();
  const setStoreFeatures = useFeatures(s => s.set);

  const { data, isLoading, isError } = useQuery({
    queryKey: adminKeys.features.all,
    queryFn: ({ signal }) => fetchFeatureCatalog(signal),
  });

  // 저장 전까지의 편집 상태. 서버 값과 다른 키만 저장한다.
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  // 서버 값이 새로 오면 편집 상태를 버린다. 어느 쪽이든 서버 값이 옳다.
  useEffect(() => {
    if (data) setDraft({});
  }, [data]);

  const labelOf = useMemo(() => {
    const labels = new Map((data?.features ?? []).map(f => [f.key, f.label]));
    return (key: string) => labels.get(key) ?? key;
  }, [data]);

  // 저장값을 Map 으로 한 번만 만들어 둔다
  const savedByKey = useMemo(
    () => new Map((data?.features ?? []).map(f => [f.key, f.enabled])),
    [data]
  );

  const dirtyKeys = useMemo(
    () => Object.keys(draft).filter(k => draft[k] !== savedByKey.get(k)),
    [draft, savedByKey]
  );

  const save = useMutation({
    mutationFn: () => saveFeatures(Object.fromEntries(dirtyKeys.map(k => [k, draft[k]]))),
    onSuccess: catalog => {
      queryClient.setQueryData(adminKeys.features.all, catalog);
      // 관리자 본인 화면에도 곧바로 반영한다
      setStoreFeatures(Object.fromEntries(catalog.features.map(f => [f.key, f.effective])));
      setDraft({});
      toast.success('기능 설정을 저장했습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '기능 설정을 저장하지 못했습니다.')),
  });

  if (isError) {
    return (
      <div className="py-12 text-center text-sm text-red-500 dark:text-red-400">
        기능 목록을 불러오지 못했습니다.
      </div>
    );
  }
  if (isLoading || !data) return <LoadingSpinner message="기능 목록을 불러오는 중..." />;

  const valueOf = (f: AdminFeature) => draft[f.key] ?? f.enabled;
  const change = (key: string, next: boolean) => setDraft(d => ({ ...d, [key]: next }));

  const groups = Object.entries(data.groups) as Array<[string, string]>;

  return (
    <div className="space-y-6">
      <AdminSection
        title="기능 사용 설정"
        description="끈 기능은 화면에서 사라지고 해당 API도 막힙니다. 이미 쌓인 데이터는 지워지지 않으며, 다시 켜면 그대로 돌아옵니다."
      >
        <div className="space-y-4">
          {groups.map(([groupKey, groupLabel]) => {
            const items = data.features.filter(f => f.group === groupKey);
            if (items.length === 0) return null;
            return (
              <div key={groupKey} className="card overflow-hidden">
                <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  {groupLabel}
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map(f => (
                    <FeatureRow
                      key={f.key}
                      feature={f}
                      value={valueOf(f)}
                      labelOf={labelOf}
                      onChange={change}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AdminSection>

      {/* 저장하지 않은 변경은 화면 아래에 고정해 둔다 */}
      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg dark:border-amber-700 dark:bg-amber-900/30">
          <span className="text-sm text-amber-800 dark:text-amber-200">
            저장하지 않은 변경 {dirtyKeys.length}건이 있습니다.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDraft({})}
              className="btn-secondary flex items-center"
            >
              <RotateCcw className="h-4 w-4" />
              되돌리기
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="btn-primary flex items-center"
            >
              <Save className="h-4 w-4" />
              {save.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatureManagement;
