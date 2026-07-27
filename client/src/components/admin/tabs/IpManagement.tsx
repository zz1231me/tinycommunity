// client/src/components/admin/tabs/IpManagement.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Shield, ShieldOff, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import {
  getIpRules,
  getIpRuleStats,
  createIpRule,
  updateIpRule,
  deleteIpRule,
  IpRule,
  IpRuleType,
  IpRuleStats,
} from '../../../api/ipRules';
import { toast } from '../../../utils/toast';

// ── 통계 카드 ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-1">
    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    <span className={`text-2xl font-bold ${color}`}>{value}</span>
  </div>
);

// ── 배지 ─────────────────────────────────────────────────────────────────────
const TypeBadge = ({ type }: { type: IpRuleType }) =>
  type === 'whitelist' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      <Shield className="w-3 h-3" /> 화이트리스트
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <ShieldOff className="w-3 h-3" /> 블랙리스트
    </span>
  );

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const IpManagement: React.FC = () => {
  const [rules, setRules] = useState<IpRule[]>([]);
  const [stats, setStats] = useState<IpRuleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<IpRuleType | 'all'>('all');

  // 추가 폼 상태
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<IpRuleType>('blacklist');
  const [formIp, setFormIp] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 삭제 확인
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        getIpRules(filterType === 'all' ? undefined : filterType),
        getIpRuleStats(),
      ]);
      setRules(r);
      setStats(s);
    } catch {
      toast.error('IP 규칙 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  // 추가
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formIp.trim()) {
      setFormError('IP 주소를 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      await createIpRule({
        type: formType,
        ip: formIp.trim(),
        description: formDesc.trim() || null,
      });
      toast.success('IP 규칙이 추가되었습니다.');
      setFormIp('');
      setFormDesc('');
      setShowForm(false);
      void load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormError(msg ?? '추가 실패');
    } finally {
      setSubmitting(false);
    }
  };

  // 활성/비활성 토글
  const handleToggle = async (rule: IpRule) => {
    try {
      await updateIpRule(rule.id, { isActive: !rule.isActive });
      toast.success(rule.isActive ? '규칙 비활성화됨' : '규칙 활성화됨');
      void load();
    } catch {
      toast.error('상태 변경 실패');
    }
  };

  // 삭제
  const handleDelete = async (id: string) => {
    try {
      await deleteIpRule(id);
      toast.success('IP 규칙이 삭제되었습니다.');
      setDeleteConfirm(null);
      void load();
    } catch {
      toast.error('삭제 실패');
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">IP 접근 제어</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            화이트리스트(허용) / 블랙리스트(차단) 규칙을 관리합니다. 캐시 주기: 30초
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setShowForm(v => !v);
              setFormError('');
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            규칙 추가
          </button>
        </div>
      </div>

      {/* 통계 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard
            label="전체 규칙"
            value={stats.total}
            color="text-slate-900 dark:text-slate-100"
          />
          <StatCard
            label="화이트리스트"
            value={stats.whitelist}
            color="text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            label="블랙리스트"
            value={stats.blacklist}
            color="text-red-600 dark:text-red-400"
          />
          <StatCard
            label="활성"
            value={stats.active}
            color="text-primary-600 dark:text-primary-400"
          />
          <StatCard
            label="비활성"
            value={stats.inactive}
            color="text-slate-400 dark:text-slate-500"
          />
        </div>
      )}

      {/* 추가 폼 */}
      {showForm && (
        <form
          onSubmit={e => {
            void handleAdd(e);
          }}
          className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            새 IP 규칙 추가
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 타입 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                규칙 유형
              </label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value as IpRuleType)}
                className="input-field w-full text-sm"
              >
                <option value="blacklist">블랙리스트 (차단)</option>
                <option value="whitelist">화이트리스트 (허용)</option>
              </select>
            </div>
            {/* IP */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                IP 주소 / CIDR
              </label>
              <input
                type="text"
                value={formIp}
                onChange={e => setFormIp(e.target.value)}
                placeholder="192.168.1.1 또는 192.168.0.0/24"
                className="input-field w-full text-sm font-mono"
              />
            </div>
            {/* 설명 */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                설명 (선택)
              </label>
              <input
                type="text"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="예: 사무실 IP, 악성 봇 등"
                className="input-field w-full text-sm"
              />
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {formError}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError('');
              }}
              className="btn-secondary text-sm"
            >
              취소
            </button>
            <button type="submit" disabled={submitting} className="btn-primary text-sm">
              {submitting ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>
      )}

      {/* 필터 */}
      <div className="flex items-center gap-2">
        {(['all', 'whitelist', 'blacklist'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterType(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              filterType === f
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {f === 'all' ? '전체' : f === 'whitelist' ? '화이트리스트' : '블랙리스트'}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse h-14 bg-slate-100 dark:bg-slate-700 rounded-xl" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">등록된 IP 규칙이 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">유형</th>
                <th className="px-4 py-3 text-left">IP / CIDR</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">설명</th>
                <th className="px-4 py-3 text-center">상태</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">등록일</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {rules.map(rule => (
                <tr
                  key={rule.id}
                  className={`transition-colors ${rule.isActive ? '' : 'opacity-50'} hover:bg-slate-50 dark:hover:bg-slate-700/30`}
                >
                  <td className="px-4 py-3">
                    <TypeBadge type={rule.type} />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200 font-medium">
                    {rule.ip}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                    {rule.description || (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => void handleToggle(rule)}
                      title={rule.isActive ? '비활성화' : '활성화'}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                    >
                      {rule.isActive ? (
                        <ToggleRight className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs hidden md:table-cell">
                    {formatDate(rule.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {deleteConfirm === rule.id ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">삭제?</span>
                        <button
                          onClick={() => void handleDelete(rule.id)}
                          className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        >
                          확인
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                        >
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 안내 */}
      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 text-xs text-amber-700 dark:text-amber-400 space-y-1">
        <p className="font-semibold">적용 규칙</p>
        <p>
          1. <strong>블랙리스트가 최우선</strong> — 차단 목록에 있으면 화이트리스트와 무관하게 즉시
          거부됩니다.
        </p>
        <p>
          2. 화이트리스트가 하나라도 있으면 <strong>목록에 없는 IP는 모두 차단</strong>됩니다.
        </p>
        <p>3. 화이트리스트가 없으면 블랙리스트만 적용되어 나머지 IP는 허용됩니다.</p>
        <p>
          4. 규칙 변경 후 <strong>최대 30초 이내</strong>에 자동 반영됩니다.
        </p>
        <p>
          5. CIDR 표기 지원:{' '}
          <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">10.0.0.0/8</code> 형태로
          서브넷 범위 지정 가능.
        </p>
      </div>
    </div>
  );
};

export default IpManagement;
