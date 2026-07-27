import { useState, useEffect } from 'react';
import { useEventManagement } from '../../../hooks/admin/useEventManagement';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { formatDateTime } from '../../../utils/date';

const CALENDAR_NAMES: Record<string, string> = {
  vacation: '휴가',
  meeting: '회의',
  deadline: '마감',
  out: '외근',
  etc: '기타',
};

const formatDate = formatDateTime;

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
            className={`text-xs px-2 py-1 rounded-full font-medium ${savingEvents ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}
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
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      역할
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      생성
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      조회
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      타인 수정
                    </th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      타인 삭제
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {eventPermissions.map(p => (
                    <tr key={p.roleId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
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
      <AdminSection title={`전체 일정 (${events.length}건)`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  제목
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  분류
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  작성자
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  기간
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    등록된 일정이 없습니다.
                  </td>
                </tr>
              ) : (
                events.map(event => (
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
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {CALENDAR_NAMES[event.calendarId] || event.calendarId}
                      </span>
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
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingEdit ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(event.id, event.title)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 dark:hover:bg-primary-900/20 transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(event.id)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
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
      </AdminSection>
    </div>
  );
};

export default EventManagement;
