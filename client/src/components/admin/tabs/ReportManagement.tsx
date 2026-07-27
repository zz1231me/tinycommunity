// client/src/components/admin/tabs/ReportManagement.tsx - 신고 관리 탭
import React, { useState, useEffect, useCallback } from 'react';
import {
  getReports,
  getReportStats,
  reviewReport,
  Report,
  ReportStatus,
  ReportTargetType,
  REASON_LABELS,
  STATUS_LABELS,
} from '../../../api/reports';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { toast } from '../../../utils/toast';
import { formatDateShort } from '../../../utils/date';

const STATUS_BADGE: Record<ReportStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  dismissed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  action_taken: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

export const ReportManagement = React.memo(() => {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<{
    counts: {
      pending: number;
      reviewed: number;
      dismissed: number;
      action_taken: number;
      total: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('pending');
  const [typeFilter, setTypeFilter] = useState<ReportTargetType | ''>('');
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewTarget, setReviewTarget] = useState<Report | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'reviewed' | 'dismissed' | 'action_taken'>(
    'reviewed'
  );

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getReports({
        status: statusFilter || undefined,
        targetType: typeFilter || undefined,
        page,
        limit: 20,
      });
      setReports(result.items);
      setTotalPages(result.totalPages);
    } catch {
      toast.error('신고 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, page]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getReportStats();
      setStats(s);
    } catch {
      // 통계 오류는 조용히 무시
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewing(reviewTarget.id);
    try {
      await reviewReport(reviewTarget.id, {
        status: reviewStatus,
        reviewNote: reviewNote.trim() || undefined,
      });
      toast.success('신고가 처리되었습니다.');
      setReviewTarget(null);
      setReviewNote('');
      // 현재 페이지의 마지막 항목을 처리했고 1페이지가 아니면 이전 페이지로 이동(빈 페이지 stale 방지).
      // setPage가 page 의존 useEffect로 refetch를 트리거하므로 여기선 명시 refetch 생략.
      if (reports.length === 1 && page > 1) {
        setPage(p => p - 1);
      } else {
        await fetchReports();
      }
      await fetchStats();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? '처리 중 오류가 발생했습니다.');
    } finally {
      setReviewing(null);
    }
  };

  return (
    <AdminSection title="신고 관리" description="사용자 신고를 검토하고 처리합니다.">
      {/* 통계 요약 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(
            [
              { key: 'pending', label: '대기', color: 'text-yellow-600' },
              { key: 'reviewed', label: '검토 완료', color: 'text-blue-600' },
              { key: 'dismissed', label: '기각', color: 'text-slate-500' },
              { key: 'action_taken', label: '조치 완료', color: 'text-green-600' },
            ] as const
          ).map(({ key, label, color }) => (
            <div key={key} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{stats.counts[key]}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value as ReportStatus | '');
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <option value="">전체 상태</option>
          <option value="pending">처리 대기</option>
          <option value="reviewed">검토 완료</option>
          <option value="dismissed">기각</option>
          <option value="action_taken">조치 완료</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => {
            setTypeFilter(e.target.value as ReportTargetType | '');
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <option value="">전체 유형</option>
          <option value="post">게시글</option>
          <option value="comment">댓글</option>
        </select>
        <button
          onClick={() => void fetchReports()}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          새로고침
        </button>
      </div>

      {/* 목록 */}
      {loading ? (
        <LoadingSpinner message="신고 목록 불러오는 중..." />
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <svg
            className="w-12 h-12 mx-auto mb-3 opacity-40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
            />
          </svg>
          <p className="text-sm">신고 내역이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                      {report.targetType === 'post' ? '게시글' : '댓글'} #{report.targetId}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_BADGE[report.status]}`}
                    >
                      {STATUS_LABELS[report.status]}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                      {REASON_LABELS[report.reason]}
                    </span>
                  </div>

                  {report.targetInfo && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate mb-1">
                      <span className="text-slate-400 mr-1">대상:</span>
                      {report.targetInfo.title || report.targetInfo.content || '(내용 없음)'}
                    </p>
                  )}

                  {report.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                      <span className="text-slate-400 mr-1">설명:</span>
                      {report.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                    <span>신고자: {report.reporter?.name ?? '알 수 없음'}</span>
                    <span>·</span>
                    <span>{formatDateShort(report.createdAt)}</span>
                    {report.reviewedBy && (
                      <>
                        <span>·</span>
                        <span>처리자: {report.reviewedByName || report.reviewedBy}</span>
                      </>
                    )}
                  </div>
                </div>

                {report.status === 'pending' && (
                  <button
                    onClick={() => {
                      setReviewTarget(report);
                      setReviewStatus('reviewed');
                      setReviewNote('');
                    }}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    처리
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            다음
          </button>
        </div>
      )}

      {/* 처리 모달 */}
      {reviewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setReviewTarget(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-report-title"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3
              id="review-report-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4"
            >
              신고 처리
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                처리 결과
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'reviewed', label: '검토 완료' },
                    { value: 'dismissed', label: '기각' },
                    { value: 'action_taken', label: '조치 완료' },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setReviewStatus(opt.value)}
                    className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                      reviewStatus === opt.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                처리 메모 <span className="text-slate-400 font-normal">(선택)</span>
              </label>
              <textarea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="처리 사유 또는 조치 내용을 입력하세요..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReviewTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void handleReview()}
                disabled={reviewing === reviewTarget.id}
                className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {reviewing === reviewTarget.id && (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                처리 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminSection>
  );
});

ReportManagement.displayName = 'ReportManagement';

export default ReportManagement;
