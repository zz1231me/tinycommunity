// PasswordResetRequestManagement.tsx
// 비밀번호 초기화 요청 — 인증번호 자동생성. 관리자는 본인 확인 후 인증번호를 사용자에게 전달하고 폐기.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, RotateCw, Trash2 } from 'lucide-react';
import { fetchPasswordResetRequests, dismissPasswordResetRequest } from '../../../api/admin';
import { PasswordResetRequestItem } from '../../../types/admin.types';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { formatDateTime } from '../../../utils/date';
import { toast } from '../../../utils/toast';

// 남은 만료 시간(분) — expiresAt 기준
const minsLeft = (expiresAt: string): number =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000));

// 6자리를 000 000 형태로 표시
const pretty = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

export const PasswordResetRequestManagement = () => {
  const [requests, setRequests] = useState<PasswordResetRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 만료 카운트다운을 위해 1분마다 리렌더
  const [, setTick] = useState(0);

  const loadGenRef = useRef(0);
  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    try {
      setLoading(true);
      const data = await fetchPasswordResetRequests();
      if (gen === loadGenRef.current) setRequests(data);
    } catch {
      if (gen === loadGenRef.current) toast.error('요청 목록을 불러오지 못했습니다.');
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('인증번호를 복사했습니다.');
    } catch {
      toast.error('복사에 실패했습니다. 직접 확인해 전달하세요.');
    }
  };

  const dismiss = async (req: PasswordResetRequestItem) => {
    if (busyId) return;
    setBusyId(req.id);
    try {
      await dismissPasswordResetRequest(req.id);
      setRequests(prev => prev.filter(r => r.id !== req.id));
      toast.success(`${req.userId} 요청을 정리했습니다.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '폐기에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && requests.length === 0) return <LoadingSpinner message="요청을 불러오는 중..." />;

  return (
    <div className="space-y-6">
      <AdminSection
        title={`비밀번호 초기화 요청 (${requests.length})`}
        description="사용자가 초기화를 요청하면 6자리 인증번호가 자동 생성됩니다. 본인 확인 후 인증번호를 전달하세요."
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
        {/* 본인 확인 책임 경고 */}
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            <strong>인증번호 전달은 곧 본인 확인입니다.</strong> 요청자가 실제 계정 주인인지 대면·전화
            등으로 확인한 뒤, 인증번호를 본인에게만 알려주세요. 인증번호는 30분간 유효하며 3회 오입력
            시 1시간 잠깁니다.
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            진행 중인 초기화 요청이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {requests.map(req => {
              const left = minsLeft(req.expiresAt);
              const expired = left <= 0;
              return (
                <div key={req.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {req.name ?? '-'}
                      </div>
                      <div className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                        {req.userId}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(req)}
                      disabled={busyId !== null}
                      title="요청 폐기"
                      className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 인증번호 */}
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 px-3 py-2.5">
                    <span className="flex-1 text-center font-mono text-2xl font-bold tracking-[0.2em] text-slate-900 dark:text-slate-100 tabular-nums">
                      {pretty(req.code)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCode(req.code)}
                      className="btn-primary flex-shrink-0 gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      복사
                    </button>
                  </div>

                  {/* 메타 */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                    <span className={expired ? 'text-red-500 dark:text-red-400' : ''}>
                      {expired ? '만료됨' : `${left}분 후 만료`}
                    </span>
                    <span>·</span>
                    <span>남은 시도 {req.remainingAttempts}회</span>
                    <span>·</span>
                    <span>{formatDateTime(req.createdAt)} 요청</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminSection>
    </div>
  );
};

export default PasswordResetRequestManagement;
