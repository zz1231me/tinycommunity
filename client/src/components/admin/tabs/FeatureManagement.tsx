// 기능 스위치 관리 화면. 즉시 저장이 아니라 고친 뒤 한 번에 저장한다.
// 사이트 전체 스위치 아래에 역할별 켬/끔을 둔다. 개인 예외는 사용자 관리에서 바꾼다.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Monitor, RotateCcw, Save, SlidersHorizontal, UserCog } from 'lucide-react';
import {
  fetchFeatureCatalog,
  saveFeatures,
  saveRoleFeatureRules,
  type AdminFeature,
  type FeatureCatalog,
} from '../../../api/features';
import api from '../../../api/axios';
import type { Role } from '../../../types/admin.types';
import { adminKeys } from '../../../api/queryKeys';
import { getApiErrorMessage, unwrap } from '../../../api/utils';
import { useFeatures } from '../../../store/features';
import { toast } from '../../../utils/toast';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import { Link } from 'react-router-dom';
import { FEATURE_SETTINGS } from '../../../constants/featureSettings';

/** 역할별 규칙을 걸 수 있는 역할. 관리자는 예외를 받지 않는다(서버도 거절한다). */
const ADMIN_ROLE = 'admin';

function FeatureRow({
  feature,
  value,
  labelOf,
  onChange,
  roles,
  roleOn,
  onRoleChange,
}: {
  feature: AdminFeature;
  value: boolean;
  /** 의존성 키를 사람이 읽는 이름으로 바꾼다. */
  labelOf: (key: string) => string;
  onChange: (key: string, next: boolean) => void;
  roles: Role[];
  /** 이 역할에게 켜져 있는지(편집 중인 값 포함) */
  roleOn: (roleId: string) => boolean;
  onRoleChange: (key: string, roleId: string, on: boolean) => void;
}) {
  // 켜 두었지만 선행 기능이 꺼져 실제로는 동작하지 않는 상태.
  const blocked = value && !feature.effective;
  const blockedBy = blocked ? feature.requires : [];
  const settingsLink = FEATURE_SETTINGS[feature.key];

  return (
    <div className="flex items-start gap-4 px-4 py-3.5 sm:px-6">
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

        {/* 역할별. 사이트 전체가 꺼져 있으면 역할 설정은 쓰이지 않으므로 감춘다. */}
        {value && roles.length > 0 && (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={`${feature.label} 역할별 사용`}
          >
            <span className="text-xs text-slate-400">역할별:</span>
            {roles.map(role => {
              const on = roleOn(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={on}
                  title={
                    on
                      ? `${role.name} 은(는) 쓸 수 있습니다. 누르면 끕니다.`
                      : `${role.name} 은(는) 못 씁니다. 누르면 켭니다.`
                  }
                  onClick={() => onRoleChange(feature.key, role.id, !on)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    on
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700 line-through hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                  }`}
                >
                  {role.name}
                </button>
              );
            })}
            {feature.userRuleCount > 0 && (
              <span
                className="badge badge-gray inline-flex items-center gap-1"
                title="사용자 관리의 '기능 예외' 에서 사람별로 바꿉니다."
              >
                <UserCog className="h-3 w-3" />
                개인 예외 {feature.userRuleCount}명
              </span>
            )}
          </div>
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

  const { data: allRoles = [] } = useQuery({
    queryKey: adminKeys.roles.all,
    queryFn: async () => unwrap<Role[]>(await api.get('/admin/roles')),
  });
  const roles = useMemo(() => allRoles.filter(r => r.id !== ADMIN_ROLE), [allRoles]);

  // 저장 전까지의 편집 상태. 서버 값과 다른 키만 저장한다.
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  // 역할별 편집 상태. 키 → 역할 → 켜짐 여부
  const [roleDraft, setRoleDraft] = useState<Record<string, Record<string, boolean>>>({});

  // 서버 값이 새로 오면 편집 상태를 버린다. 어느 쪽이든 서버 값이 옳다.
  useEffect(() => {
    if (data) {
      setDraft({});
      setRoleDraft({});
    }
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

  // 저장된 역할 규칙: 규칙이 false 인 역할만 꺼진 것이다
  const savedRoleOn = (key: string, roleId: string) =>
    data?.features.find(f => f.key === key)?.roleRules[roleId] !== false;

  /** 역할별로 바뀐 것: 역할 → { 키: 켜짐이면 null(규칙 지우기), 꺼짐이면 false } */
  const roleChanges = useMemo(() => {
    const byRole: Record<string, Record<string, boolean | null>> = {};
    for (const [key, perRole] of Object.entries(roleDraft)) {
      for (const [roleId, on] of Object.entries(perRole)) {
        const saved = data?.features.find(f => f.key === key)?.roleRules[roleId] !== false;
        if (on === saved) continue;
        (byRole[roleId] ??= {})[key] = on ? null : false;
      }
    }
    return byRole;
  }, [roleDraft, data]);
  const roleChangeCount = Object.values(roleChanges).reduce(
    (n, changes) => n + Object.keys(changes).length,
    0
  );
  const dirtyCount = dirtyKeys.length + roleChangeCount;

  const save = useMutation({
    mutationFn: async () => {
      let catalog: FeatureCatalog | undefined;
      if (dirtyKeys.length > 0) {
        catalog = await saveFeatures(Object.fromEntries(dirtyKeys.map(k => [k, draft[k]])));
      }
      for (const [roleId, changes] of Object.entries(roleChanges)) {
        catalog = await saveRoleFeatureRules(roleId, changes);
      }
      return catalog as FeatureCatalog;
    },
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
  const roleOnOf = (key: string) => (roleId: string) =>
    roleDraft[key]?.[roleId] ?? savedRoleOn(key, roleId);
  const changeRole = (key: string, roleId: string, on: boolean) =>
    setRoleDraft(d => ({ ...d, [key]: { ...d[key], [roleId]: on } }));

  const groups = Object.entries(data.groups) as Array<[string, string]>;

  return (
    <div className="space-y-6">
      <AdminSection
        title="기능 사용 설정"
        description="끈 기능은 화면에서 사라지고 해당 API도 막힙니다. 이미 쌓인 데이터는 지워지지 않으며, 다시 켜면 그대로 돌아옵니다. 켜 둔 기능은 아래 역할 이름을 눌러 역할별로 끌 수 있고(관리자 역할은 제외), 사람별 예외는 사용자 관리의 '기능 예외' 에서 정합니다."
      >
        <div className="space-y-4">
          {groups.map(([groupKey, groupLabel]) => {
            const items = data.features.filter(f => f.group === groupKey);
            if (items.length === 0) return null;
            return (
              <div key={groupKey} className="card overflow-hidden">
                <h3 className="card-header block bg-slate-50 text-sm font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
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
                      roles={roles}
                      roleOn={roleOnOf(f.key)}
                      onRoleChange={changeRole}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AdminSection>

      {/* 저장하지 않은 변경은 화면 아래에 고정해 둔다 */}
      {dirtyCount > 0 && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg dark:border-amber-700 dark:bg-amber-900/30">
          <span className="text-sm text-amber-800 dark:text-amber-200">
            저장하지 않은 변경 {dirtyCount}건이 있습니다.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft({});
                setRoleDraft({});
              }}
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
