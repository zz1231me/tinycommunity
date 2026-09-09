import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyRateLimitPreset,
  deleteRateLimit,
  fetchRateLimits,
  refreshRateLimitCache,
  toggleRateLimit,
} from '../../../api/admin';
import { adminKeys } from '../../../api/queryKeys';
import { useAuth } from '../../../store/auth';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { ListState } from '../../common/ListState';

interface RateLimitSetting {
  id: number;
  category: string;
  name: string;
  description: string;
  windowMs: number;
  windowDisplay: string;
  maxRequests: number;
  enabled: boolean;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  message: string;
  statusCode: number;
  applyTo: string;
  priority: number;
  whitelistIPs: string[];
  blacklistIPs: string[];
  headers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface RateLimitStats {
  cachedSettings: number;
  totalSettings: number;
  activeSettings: number;
  categories: string[];
  lastRefresh: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  auth: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  api: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  upload: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  custom: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
};

export const RateLimitManagement = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<{
    id: number;
    type: 'delete' | 'preset';
    label: string;
  } | null>(null);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);

  const isAdminUser = isAdmin();

  const { data, isPending } = useQuery({
    queryKey: adminKeys.rateLimits.all,
    // 관리자가 아니면 조회 자체를 하지 않는다(아래에서 안내 화면을 렌더).
    enabled: isAdminUser,
    queryFn: async ({ signal }) => {
      try {
        return await fetchRateLimits(signal);
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 404) toast.error('Rate Limiting API를 찾을 수 없습니다.');
        else if (status === 403) toast.error('Rate Limiting 관리 권한이 없습니다.');
        else toast.error('설정을 불러오는데 실패했습니다.');
        throw error;
      }
    },
  });

  const settings: RateLimitSetting[] = data?.settings ?? [];
  const stats: RateLimitStats | null = data?.stats ?? null;
  const loading = isAdminUser && isPending;

  const fetchSettings = () => queryClient.invalidateQueries({ queryKey: adminKeys.rateLimits.all });

  const toggleSetting = async (id: number) => {
    try {
      await toggleRateLimit(id);
      await fetchSettings();
    } catch {
      toast.error('설정 변경에 실패했습니다.');
    }
  };

  const deleteSetting = async (id: number) => {
    try {
      await deleteRateLimit(id);
      await fetchSettings();
      toast.success('설정이 삭제되었습니다.');
    } catch {
      toast.error('설정 삭제에 실패했습니다.');
    } finally {
      setConfirmAction(null);
    }
  };

  const refreshCache = async () => {
    try {
      await refreshRateLimitCache();
      await fetchSettings();
      toast.success('캐시가 새로고침되었습니다.');
    } catch {
      toast.error('캐시 새로고침에 실패했습니다.');
    }
  };

  const applyPreset = async (preset: string) => {
    try {
      await applyRateLimitPreset(preset);
      await fetchSettings();
      toast.success(`${preset} 프리셋이 적용되었습니다.`);
    } catch {
      toast.error('프리셋 적용에 실패했습니다.');
    } finally {
      setConfirmAction(null);
      setPendingPreset(null);
    }
  };

  const executeConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete') deleteSetting(confirmAction.id);
    if (confirmAction.type === 'preset' && pendingPreset) applyPreset(pendingPreset);
  };

  if (!isAdminUser) {
    return (
      <div className="text-center py-16">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
          접근 권한이 없습니다
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          관리자만 Rate Limiting 설정에 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 확인 모달 — 전 앱 공통 ConfirmationModal(ESC·백드롭클릭·focus-trap) */}
      <ConfirmationModal
        open={!!confirmAction}
        title="정말 실행하시겠습니까?"
        message={confirmAction?.label}
        variant="danger"
        onConfirm={executeConfirm}
        onCancel={() => setConfirmAction(null)}
      />

      {/* 통계 & 관리 */}
      <AdminSection
        title="Rate Limiting 현황"
        actions={
          <button
            onClick={refreshCache}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            캐시 새로고침
          </button>
        }
      >
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: '총 설정',
                value: stats.totalSettings,
                color: 'text-slate-900 dark:text-slate-100',
              },
              {
                label: '활성 설정',
                value: stats.activeSettings,
                color: 'text-green-600 dark:text-green-400',
              },
              {
                label: '캐시된 설정',
                value: stats.cachedSettings,
                color: 'text-primary-600 dark:text-primary-400',
              },
              {
                label: '카테고리',
                value: stats.categories.length,
                color: 'text-purple-600 dark:text-purple-400',
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      {/* 프리셋 */}
      <AdminSection title="빠른 프리셋 적용">
        <div className="flex flex-wrap gap-3">
          {[
            { key: 'strict', label: '엄격한 제한', color: 'bg-red-600 hover:bg-red-700' },
            { key: 'moderate', label: '보통 제한', color: 'bg-amber-600 hover:bg-amber-700' },
            { key: 'lenient', label: '관대한 제한', color: 'bg-green-600 hover:bg-green-700' },
          ].map(preset => (
            <button
              key={preset.key}
              onClick={() => {
                setPendingPreset(preset.key);
                setConfirmAction({
                  id: 0,
                  type: 'preset',
                  label: `'${preset.label}' 프리셋을 적용합니다. 기존 설정이 변경될 수 있습니다.`,
                });
              }}
              className={`${preset.color} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          프리셋 적용 시 기존 설정이 변경될 수 있습니다.
        </p>
      </AdminSection>

      {/* 설정 목록 */}
      <AdminSection title={`설정 목록 (${settings.length}개)`}>
        {settings.length === 0 ? (
          <ListState>설정된 Rate Limiting이 없습니다.</ListState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="admin-th">카테고리 / 이름</th>
                  <th className="admin-th">제한 설정</th>
                  <th className="admin-th">적용 경로</th>
                  <th className="admin-th text-center w-20">상태</th>
                  <th className="admin-th text-right w-32">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {settings.map(setting => (
                  <tr key={setting.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="admin-td">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[setting.category] || CATEGORY_COLORS.custom}`}
                      >
                        {setting.category}
                      </span>
                      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {setting.name}
                      </div>
                      {setting.description && (
                        <div className="text-xs text-slate-400">{setting.description}</div>
                      )}
                    </td>
                    <td className="admin-td">
                      <div className="text-sm text-slate-900 dark:text-slate-100">
                        {setting.maxRequests}회 / {setting.windowDisplay}
                      </div>
                      <div className="text-xs text-slate-400">우선순위 {setting.priority}</div>
                    </td>
                    <td className="admin-td font-mono text-xs">{setting.applyTo}</td>
                    <td className="admin-td text-center">
                      <span className={`badge ${setting.enabled ? 'badge-success' : 'badge-gray'}`}>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${setting.enabled ? 'bg-green-500' : 'bg-slate-400'}`}
                        />
                        {setting.enabled ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="admin-td text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => toggleSetting(setting.id)}
                          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${setting.enabled ? 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600 dark:hover:bg-amber-900/20' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-green-50 hover:border-green-300 hover:text-green-600 dark:hover:bg-green-900/20'}`}
                        >
                          {setting.enabled ? '비활성화' : '활성화'}
                        </button>
                        <button
                          onClick={() =>
                            setConfirmAction({
                              id: setting.id,
                              type: 'delete',
                              label: `'${setting.name}' 설정을 삭제합니다.`,
                            })
                          }
                          className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
};

export default RateLimitManagement;
