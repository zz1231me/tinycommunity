// client/src/api/reports.ts - 신고 API
import axios from './axios';

export type ReportTargetType = 'post' | 'comment';
export type ReportReason = 'spam' | 'abuse' | 'illegal' | 'privacy' | 'misinformation' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken';

export interface Report {
  id: number;
  targetType: ReportTargetType;
  targetId: number;
  reporterId: string | null;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  reporter?: { id: string; name: string };
  targetInfo?: { title?: string; content?: string };
}

export const REASON_LABELS: Record<ReportReason, string> = {
  spam: '스팸/광고',
  abuse: '욕설/비방',
  illegal: '불법 콘텐츠',
  privacy: '개인정보 침해',
  misinformation: '허위 정보',
  other: '기타',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '처리 대기',
  reviewed: '검토 완료',
  dismissed: '기각',
  action_taken: '조치 완료',
};

export const createReport = async (data: {
  targetType: ReportTargetType;
  targetId: number;
  reason: ReportReason;
  description?: string;
}) => {
  const res = await axios.post('/reports', data);
  return res.data.data as { id: number };
};

export const getReports = async (params?: {
  status?: ReportStatus;
  targetType?: ReportTargetType;
  page?: number;
  limit?: number;
}) => {
  const res = await axios.get('/reports', { params });
  return res.data.data as {
    items: Report[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export const getReportStats = async () => {
  const res = await axios.get('/reports/stats');
  return res.data.data as {
    counts: {
      pending: number;
      reviewed: number;
      dismissed: number;
      action_taken: number;
      total: number;
    };
    recentPending: Report[];
  };
};

export const reviewReport = async (
  reportId: number,
  data: {
    status: 'reviewed' | 'dismissed' | 'action_taken';
    reviewNote?: string;
  }
) => {
  const res = await axios.patch(`/reports/${reportId}/review`, data);
  return res.data.data as Report;
};
