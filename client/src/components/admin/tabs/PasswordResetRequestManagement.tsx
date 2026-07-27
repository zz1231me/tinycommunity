// PasswordResetRequestManagement.tsx - 비밀번호 초기화 요청 (사용자 요청 → 관리자 승인)
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, X, Copy, RotateCw } from 'lucide-react';
import {
  fetchPasswordResetRequests,
  approvePasswordResetRequest,
  rejectPasswordResetRequest,
} from '../../../api/admin';
import { PasswordResetRequestItem } from '../../../types/admin.types';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { formatDateTime } from '../../../utils/date';
import { toast } from '../../../utils/toast';

type StatusFilter = 'pending' | 'approved' | 'rejected';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인됨' },
  { key: 'rejected', label: '거절됨' },
];

const EMPTY_TEXT: Record<StatusFilter, string> = {
  pending: '대기 중인 초기화 요청이 없습니다.',
  approved: '승인된 요청 이력이 없습니다.',
  rejected: '거절된 요청 이력이 없습니다.',
};

interface ApprovalResult {
  loginId: string;
  link: string;
}

// 이력(승인됨/거절됨) 상태 배지
const StatusBadge = ({ status }: { status: 'approved' | 'rejected' }) =>
  status === 'approved' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
      <Check className="h-3 w-3" />
      승인됨
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      <X className="h-3 w-3" />
      거절됨
    </span>
  );

export const PasswordResetRequestManagement = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<PasswordResetRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  // 필터를 빠르게 바꾸면 여러 load가 경쟁한다. 세대(gen) 카운터로 최신 요청 결과만 반영해
  // 느린 이전 응답이 새 결과를 덮어쓰지 않도록 한다.
  const loadGenRef = useRef(0);
  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    try {
      setLoading(true);
      const data = await fetchPasswordResetRequests(statusFilter);
      if (gen === loadGenRef.current) setRequests(data);
    } catch {
      if (gen === loadGenRef.current) toast.error('요청 목록을 불러오지 못했습니다.');
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 결과 모달이 열려 있을 때 Esc로 닫기
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setResult(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result]);

  const handleApprove = async (req: PasswordResetRequestItem) => {
    if (busyId) return;
    setBusyId(req.id);
    try {
      const { token, loginId } = await approvePasswordResetRequest(req.id);
      // 링크는 관리자의 현재 origin 기준으로 구성 — 어떤 환경에서도 동작하는 절대 URL
      const link = `${window.location.origin}/reset-password?token=${token}`;
      setResult({ loginId, link });
      setRequests(prev => prev.filter(r => r.id !== req.id));
      toast.success(`${loginId} 요청을 수락했습니다.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '요청 수락에 실패했습니다.';
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: PasswordResetRequestItem) => {
    if (busyId) return;
    setBusyId(req.id);
    try {
      await rejectPasswordResetRequest(req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      toast.success(`${req.userId} 요청을 거절했습니다.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '요청 거절에 실패했습니다.';
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      toast.success('링크가 복사되었습니다.');
    } catch {
      toast.error('복사에 실패했습니다. 직접 선택해 복사하세요.');
    }
  };

  const isPending = statusFilter === 'pending';

  // 행 단위 작업/이력 셀 (테이블·카드 공용)
  const renderAction = (req: PasswordResetRequestItem) =>
    isPending ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleApprove(req)}
          disabled={busyId !== null}
          className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          수락
        </button>
        <button
          type="button"
          onClick={() => handleReject(req)}
          disabled={busyId !== null}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
        >
          <X className="h-3.5 w-3.5" />
          거절
        </button>
      </div>
    ) : (
      <div className="flex flex-col gap-0.5">
        <StatusBadge status={statusFilter} />
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {req.resolvedBy ?? '-'}
          {req.resolvedAt ? ` · ${formatDateTime(req.resolvedAt)}` : ''}
        </span>
      </div>
    );

  if (loading && requests.length === 0) return <LoadingSpinner message="요청을 불러오는 중..." />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="비밀번호 초기화 요청"
        actions={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
          >
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        }
      >
        {/* 상태 필터 */}
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === t.key
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 신원 검증 책임 경고 (대기 목록에서만) */}
        {isPending && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>수락은 곧 본인 확인입니다.</strong> 요청자가 실제 계정 주인인지 대면·전화
              등으로 확인한 뒤 수락하세요. 수락하면 일회용 재설정 링크가 생성되며, 이 링크를
              본인에게 직접 전달해야 합니다.
            </span>
          </div>
        )}

        {requests.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            {EMPTY_TEXT[statusFilter]}
          </div>
        ) : (
          <>
            {/* 데스크탑: 테이블 */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      아이디
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      이름
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      요청 시각
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {isPending ? '작업' : '처리'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {requests.map(req => (
                    <tr key={req.id} className="bg-white dark:bg-slate-800">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {req.userId}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {req.name ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatDateTime(req.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">{renderAction(req)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 (작업 버튼이 가로 스크롤 없이 바로 보이도록) */}
            <div className="space-y-3 md:hidden">
              {requests.map(req => (
                <div
                  key={req.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {req.userId}
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {req.name ?? '-'}
                      </div>
                    </div>
                    {!isPending && <StatusBadge status={statusFilter} />}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    요청: {formatDateTime(req.createdAt)}
                  </div>
                  {isPending ? (
                    <div className="mt-3">{renderAction(req)}</div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      처리: {req.resolvedBy ?? '-'}
                      {req.resolvedAt ? ` · ${formatDateTime(req.resolvedAt)}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </AdminSection>

      {/* 승인 결과 — 재설정 링크 표시 모달 */}
      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setResult(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prr-result-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <h3
              id="prr-result-title"
              className="mb-1 text-lg font-bold text-slate-900 dark:text-white"
            >
              재설정 링크 생성됨
            </h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              <strong className="text-slate-700 dark:text-slate-200">{result.loginId}</strong> 님께
              아래 링크를 직접 전달하세요. 링크로 새 비밀번호를 설정할 수 있으며, 일정 시간 후
              만료됩니다.
            </p>
            <div className="mb-4 flex items-center gap-2">
              <input
                readOnly
                value={result.link}
                onFocus={e => e.target.select()}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              />
              <button
                type="button"
                autoFocus
                onClick={copyLink}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                <Copy className="h-4 w-4" />
                복사
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordResetRequestManagement;
