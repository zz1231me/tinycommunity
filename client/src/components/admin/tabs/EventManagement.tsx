import { useState, useEffect } from 'react';
import { useEventManagement } from '../../../hooks/admin/useEventManagement';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { formatDateTime } from '../../../utils/date';

// 일정 분류(category) 라벨 — 캘린더 카테고리 키와 일치
const CATEGORY_NAMES: Record<string, string> = {
  annual: '연차',
  morning_half: '오전반차',
  afternoon_half: '오후반차',
  meeting: '회의',
  dinner: '회식',
  etc: '기타',
};
const categoryLabel = (c?: string | null) => (c ? CATEGORY_NAMES[c] || c : '미분류');

const formatDate = formatDateTime;

type PeriodFilter = 'all' | 'upcoming' | 'past' | 'thisMonth';
type EventSortKey = 'start' | 'title';

export const EventManagement = () => {
  const {
    events,
    permissions: eventPermissions,
    fetchEvents,
    fetchPermissions,
    deleteEvent,
    updateEvent,
    updatePermission,
    saving: savingEvents,
    loading,
    dataLoaded,
  } = useEventManagement();

  useEffect(() => {
    fetchEvents();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 목록 관리(검색·필터·정렬·페이지네이션)
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [sortKey, setSortKey] = useState<EventSortKey>('start');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const handleDeleteEvent = async (id: number) => {
    try {
      await deleteEvent(id);
      toast.success('일정이 삭제되었습니다.');
    } catch {
      toast.error('일정 삭제에 실패했습니다.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const startEdit = (id: number, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = async (id: number) => {
    if (savingEdit) return; // 진행 중 중복 요청(Enter 연타/키 리피트) 방지
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    setSavingEdit(true);
    try {
      await updateEvent(id, { title: trimmed });
      toast.success('일정이 수정되었습니다.');
      setEditingId(null);
    } catch {
      toast.error('일정 수정에 실패했습니다.');
    } finally {
      setSavingEdit(false);
    }
  };

  // 최초 로드 시에만 전체 스피너 — 수정/삭제 후 재조회 시 목록이 깜빡이지 않도록
  if (loading && !dataLoaded) return <LoadingSpinner message="일정 목록을 불러오는 중..." />;

  // ── 목록 필터/정렬/페이지네이션 ──────────────────────────
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const nextMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();

  const categoryOptions = Array.from(new Set(events.map(e => e.category || '').filter(Boolean)));

  const filteredEvents = events.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !e.user.name.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter && (e.category || '') !== categoryFilter) return false;
    const endT = new Date(e.end).getTime();
    const startT = new Date(e.start).getTime();
    if (periodFilter === 'upcoming' && endT < now) return false;
    if (periodFilter === 'past' && endT >= now) return false;
    if (periodFilter === 'thisMonth' && (startT < monthStart || startT >= nextMonthStart)) return false;
    return true;
  });

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const av = sortKey === 'title' ? a.title.toLowerCase() : new Date(a.start).getTime();
    const bv = sortKey === 'title' ? b.title.toLowerCase() : new Date(b.start).getTime();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: EventSortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'start' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const PER_PAGE = 15;
  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagedEvents = sortedEvents.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div className="space-y-8">
      <ConfirmationModal
        open={confirmDeleteId !== null}
        title="일정을 삭제하시겠습니까?"
        message="이 작업은 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={() => confirmDeleteId !== null && handleDeleteEvent(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* 이벤트 권한 설정 */}
      <AdminSection
        title="이벤트 권한 설정"
        actions={
          <span
            className={`badge py-1 ${savingEvents ? 'badge-warning' : 'badge-success'}`}
          >
            {savingEvents ? '저장 중...' : '자동 저장됨'}
          </span>
        }
      >
        {eventPermissions.length === 0 ? (
          <p className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
            권한 설정을 불러오는 중...
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      역할
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      생성
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      조회
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      타인 수정
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      타인 삭제
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {eventPermissions.map(p => (
                    <tr key={p.roleId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-3 py-3">
                        <span className="badge badge-info">
                          {p.role?.name || p.roleId}
                        </span>
                      </td>
                      {(['canCreate', 'canRead', 'canUpdate', 'canDelete'] as const).map(key => (
                        <td key={key} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={p[key]}
                            onChange={() => updatePermission(p.roleId, key)}
                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              본인이 만든 일정은 권한 설정과 관계없이 항상 수정·삭제 가능합니다.
            </p>
          </>
        )}
      </AdminSection>

      {/* 전체 일정 목록 */}
      <AdminSection title={`전체 일정 (${sortedEvents.length}건)`}>
        {/* 필터 툴바 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="제목 / 작성자 검색..."
            className="input w-56 py-1.5"
          />
          <select
            value={periodFilter}
            onChange={e => {
              setPeriodFilter(e.target.value as PeriodFilter);
              setPage(1);
            }}
            className="input w-auto py-1.5"
          >
            <option value="all">전체 기간</option>
            <option value="upcoming">예정</option>
            <option value="past">지난</option>
            <option value="thisMonth">이번 달</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto py-1.5"
          >
            <option value="">전체 분류</option>
            {categoryOptions.map(c => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-3 py-2">
                  <button
                    onClick={() => toggleSort('title')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    제목
                    <span
                      className={`text-[10px] ${sortKey === 'title' ? 'text-primary-500' : 'text-slate-300 dark:text-slate-600'}`}
                    >
                      {sortKey === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  분류
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  작성자
                </th>
                <th className="text-left px-3 py-2">
                  <button
                    onClick={() => toggleSort('start')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    기간
                    <span
                      className={`text-[10px] ${sortKey === 'start' ? 'text-primary-500' : 'text-slate-300 dark:text-slate-600'}`}
                    >
                      {sortKey === 'start' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    {events.length === 0 ? '등록된 일정이 없습니다.' : '조건에 맞는 일정이 없습니다.'}
                  </td>
                </tr>
              ) : (
                pagedEvents.map(event => (
                  <tr key={event.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-slate-100 min-w-[160px]">
                      {editingId === event.id ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveEdit(event.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          autoFocus
                        />
                      ) : (
                        event.title
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="badge badge-gray">{categoryLabel(event.category)}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                      <div className="text-sm font-medium">{event.user.name}</div>
                      <div className="text-xs text-slate-400">
                        {event.user.roleInfo?.name || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                      <div>{formatDate(event.start)}</div>
                      <div>{formatDate(event.end)}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editingId === event.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSaveEdit(event.id)}
                            disabled={savingEdit}
                            className="btn-primary px-3 py-1.5 text-xs"
                          >
                            {savingEdit ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(event.id, event.title)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 dark:hover:bg-primary-900/20 transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(event.id)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-3 border-t border-slate-100 dark:border-slate-700/60">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              총 {sortedEvents.length}건 · {currentPage}/{totalPages} 페이지
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                이전
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </AdminSection>
    </div>
  );
};

export default EventManagement;
