// AnnouncementManagement.tsx — 공지사항 CRUD (게시 기간·상태 표시).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKeys } from '../../../api/queryKeys';
import { Plus, Trash2, Save, X, Pin } from 'lucide-react';
import {
  fetchAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type Announcement,
  type AnnouncementInput,
} from '../../../api/announcements';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { getApiErrorMessage } from '../../../api/utils';
import { ListState, ListError } from '../../common/ListState';
import { toLocalDateInput } from '../../../utils/date';

interface FormState {
  title: string;
  content: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD ('' = 무기한)
  isActive: boolean;
  isPinned: boolean;
}

// 오늘 날짜는 보는 사람의 달력 기준이다. toISOString() 은 UTC 라 한국에서는 09시 이전에
// '어제' 가 채워졌다 — 그대로 저장하면 어제 시작한 공지가 된다.
const todayStr = () => toLocalDateInput(new Date());
const EMPTY: FormState = {
  title: '',
  content: '',
  startDate: todayStr(),
  endDate: '',
  isActive: true,
  isPinned: false,
};

const toInput = (f: FormState): AnnouncementInput => ({
  title: f.title,
  content: f.content,
  startAt: new Date(f.startDate + 'T00:00:00').toISOString(),
  endAt: f.endDate ? new Date(f.endDate + 'T23:59:59').toISOString() : null,
  isActive: f.isActive,
  isPinned: f.isPinned,
});

const DAY = 86_400_000;
// 게시 상태 + 며칠 남았는지
function statusOf(a: Announcement): { label: string; tone: string; detail: string } {
  const now = Date.now();
  const start = new Date(a.startAt).getTime();
  const end = a.endAt ? new Date(a.endAt).getTime() : null;
  if (!a.isActive)
    return {
      label: '비활성',
      tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      detail: '',
    };
  if (now < start) {
    const d = Math.ceil((start - now) / DAY);
    return {
      label: '예정',
      tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      detail: `${d}일 후 시작`,
    };
  }
  if (end !== null && now > end)
    return {
      label: '종료',
      tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      detail: '',
    };
  if (end === null)
    return {
      label: '게시중',
      tone: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300',
      detail: '무기한',
    };
  const d = Math.ceil((end - now) / DAY);
  return {
    label: '게시중',
    tone: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300',
    detail: `${d}일 남음`,
  };
}

// 목록 표시도 같은 기준으로 — 편집 화면과 다른 날짜가 보이면 어느 쪽이 맞는지 알 수 없다
const fmt = (iso: string | null) => (iso ? toLocalDateInput(iso) : '무기한');

export const AnnouncementManagement = () => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  const {
    data: items = [],
    isPending: loading,
    isError,
  } = useQuery<Announcement[]>({
    queryKey: adminKeys.announcements.all,
    queryFn: fetchAllAnnouncements,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminKeys.announcements.all });

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId === 'new'
        ? createAnnouncement(toInput(form))
        : updateAnnouncement(editingId as string, toInput(form)),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: invalidate,
  });
  const saving = saveMutation.isPending;

  const startNew = () => {
    setForm(EMPTY);
    setEditingId('new');
  };
  const startEdit = (a: Announcement) => {
    setForm({
      title: a.title,
      content: a.content,
      startDate: toLocalDateInput(a.startAt),
      endDate: toLocalDateInput(a.endAt),
      isActive: a.isActive,
      isPinned: a.isPinned,
    });
    setEditingId(a.id);
  };
  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const save = async () => {
    if (saving) return;
    if (!form.title.trim()) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    try {
      await saveMutation.mutateAsync();
      toast.success('저장했습니다.');
      cancel();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '저장에 실패했습니다.'));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const a = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteMutation.mutateAsync(a.id);
      toast.success('삭제했습니다.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, '삭제에 실패했습니다.'));
    }
  };

  // ── 편집 폼 ──
  if (editingId) {
    return (
      <AdminSection
        title={editingId === 'new' ? '공지 등록' : '공지 수정'}
        description="게시 기간(시작~종료) 동안 사용자에게 배너로 표시됩니다. 종료일을 비우면 무기한입니다."
        actions={
          <button type="button" onClick={cancel} className="btn-secondary">
            <X className="h-4 w-4" />
            취소
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="form-label" htmlFor="ann-title">
              제목 *
            </label>
            <input
              id="ann-title"
              className="input"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="예: 시스템 점검 안내"
            />
          </div>

          <div>
            <label className="form-label" htmlFor="ann-content">
              내용
            </label>
            <textarea
              id="ann-content"
              className="input min-h-[120px] leading-relaxed"
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="공지 내용을 입력하세요."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="ann-start">
                게시 시작일
              </label>
              <input
                id="ann-start"
                type="date"
                className="input"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="ann-end">
                게시 종료일 <span className="font-normal text-slate-400">(비우면 무기한)</span>
              </label>
              <input
                id="ann-end"
                type="date"
                className="input"
                min={form.startDate}
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-secondary-600 focus:ring-secondary-500"
              />
              활성
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-secondary-600 focus:ring-secondary-500"
              />
              상단 고정
            </label>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              <Save className="h-4 w-4" />
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </AdminSection>
    );
  }

  // ── 목록 ──
  if (loading && items.length === 0) return <LoadingSpinner message="불러오는 중..." />;

  return (
    <>
      <AdminSection
        title={`공지사항 (${items.length})`}
        description="게시 기간과 상태를 관리합니다."
        actions={
          <button type="button" onClick={startNew} className="btn-primary">
            <Plus className="h-4 w-4" />새 공지
          </button>
        }
      >
        {isError ? (
          // 못 불러온 것을 '없다' 로 보여 주면, 있는 공지가 사라진 것으로 읽힌다
          <ListError what="공지" />
        ) : items.length === 0 ? (
          <ListState size="roomy">등록된 공지가 없습니다.</ListState>
        ) : (
          <div className="space-y-2">
            {items.map(a => {
              const st = statusOf(a);
              return (
                <div key={a.id} className="card flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {a.isPinned && (
                        <Pin className="h-3.5 w-3.5 flex-shrink-0 text-secondary-600" />
                      )}
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                        {a.title}
                      </span>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}
                      >
                        {st.label}
                      </span>
                      {st.detail && (
                        <span className="flex-shrink-0 text-xs text-slate-400">{st.detail}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {fmt(a.startAt)} ~ {fmt(a.endAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="btn-secondary btn-sm"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(a)}
                    title="삭제"
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </AdminSection>

      <ConfirmationModal
        open={confirmDelete !== null}
        title="공지 삭제"
        message={`"${confirmDelete?.title ?? ''}" 공지를 삭제할까요?`}
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
};

export default AnnouncementManagement;
