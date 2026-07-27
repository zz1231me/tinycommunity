import { useState, useEffect } from 'react';
import axios from '../../../api/axios';
import { useAuth } from '../../../store/auth';
import { AdminSection } from '../common/AdminSection';
import { toast } from '../../../utils/toast';

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
  const [settings, setSettings] = useState<RateLimitSetting[]>([]);
  const [stats, setStats] = useState<RateLimitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    id: number;
    type: 'delete' | 'preset';
    label: string;
  } | null>(null);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/admin/rate-limits');
      if (response.data?.data) {
        setSettings(response.data.data.settings || []);
        setStats(response.data.data.stats);
      } else {
        setSettings([]);
        setStats(null);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.response?.status === 404) {
        toast.error('Rate Limiting API를 찾을 수 없습니다.');
      } else if (error.response?.status === 403) {
        toast.error('Rate Limiting 관리 권한이 없습니다.');
      } else {
        toast.error('설정을 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleSetting = async (id: number) => {
    try {
      await axios.patch(`/admin/rate-limits/${id}/toggle`);
      await fetchSettings();
    } catch {
      toast.error('설정 변경에 실패했습니다.');
    }
  };

  const deleteSetting = async (id: number) => {
    try {
      await axios.delete(`/admin/rate-limits/${id}`);
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
      await axios.post('/admin/rate-limits/refresh-cache');
      await fetchSettings();
      toast.success('캐시가 새로고침되었습니다.');
    } catch {
      toast.error('캐시 새로고침에 실패했습니다.');
    }
  };

  const applyPreset = async (preset: string) => {
    try {
      await axios.post(`/admin/rate-limits/presets/${preset}`);
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

  useEffect(() => {
    if (isAdmin()) fetchSettings();
  }, [isAdmin]);

  if (!isAdmin()) {
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
      {/* 확인 모달 */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
              정말 실행하시겠습니까?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{confirmAction.label}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={executeConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 통계 & 관리 */}
      <AdminSection
        title="Rate Limiting 현황"
        actions={
          <button
            onClick={refreshCache}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          프리셋 적용 시 기존 설정이 변경될 수 있습니다.
        </p>
      </AdminSection>

      {/* 설정 목록 */}
      <AdminSection title={`설정 목록 (${settings.length}개)`}>
        {settings.length === 0 ? (
          <p className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
            설정된 Rate Limiting이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    카테고리 / 이름
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    제한 설정
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    적용 경로
                  </th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20">
                    상태
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {settings.map(setting => (
                  <tr key={setting.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[setting.category] || CATEGORY_COLORS.custom}`}
                      >
                        {setting.category}
                      </span>
                      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {setting.name}
                      </div>
                      {setting.description && (
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {setting.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm text-slate-900 dark:text-slate-100">
                        {setting.maxRequests}회 / {setting.windowDisplay}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        우선순위 {setting.priority}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {setting.applyTo}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${setting.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${setting.enabled ? 'bg-green-500' : 'bg-slate-400'}`}
                        />
                        {setting.enabled ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
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
                          className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
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
