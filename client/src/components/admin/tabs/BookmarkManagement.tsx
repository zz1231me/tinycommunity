import { useState, useEffect } from 'react';
import {
  fetchAllBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
  type Bookmark,
} from '../../../api/bookmarks';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';

export function BookmarkManagement() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', url: '' });
  const [editFormData, setEditFormData] = useState<Bookmark | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      setLoading(true);
      setBookmarks(await fetchAllBookmarks());
    } catch {
      toast.error('북마크를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.url) {
      toast.error('이름과 URL은 필수입니다.');
      return;
    }
    try {
      await createBookmark(formData);
      toast.success('북마크가 추가되었습니다.');
      setFormData({ name: '', url: '' });
      loadBookmarks();
    } catch {
      toast.error('북마크 추가에 실패했습니다.');
    }
  };

  const startEdit = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditFormData({ ...bookmark });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormData(null);
  };

  const handleUpdate = async (id: string) => {
    if (!editFormData) return;
    try {
      await updateBookmark(id, editFormData);
      toast.success('북마크가 수정되었습니다.');
      cancelEdit();
      loadBookmarks();
    } catch {
      toast.error('북마크 수정에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBookmark(id);
      toast.success('북마크가 삭제되었습니다.');
      loadBookmarks();
    } catch {
      toast.error('북마크 삭제에 실패했습니다.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleToggleActive = async (id: string) => {
    const bookmark = bookmarks.find(b => b.id === id);
    if (!bookmark) return;
    try {
      await updateBookmark(id, { isActive: !bookmark.isActive });
      loadBookmarks();
    } catch {
      toast.error('상태 변경에 실패했습니다.');
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= bookmarks.length) return;
    const prev = bookmarks;
    const reordered = [...bookmarks];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    // 낙관적 업데이트: 연속 클릭이 갱신된 순서를 기준으로 계산되도록 await 이전에 반영
    setBookmarks(reordered);
    try {
      await reorderBookmarks(reordered.map((b, i) => ({ id: b.id, order: i })));
    } catch {
      setBookmarks(prev); // 실패 시 롤백
      toast.error('순서 변경에 실패했습니다.');
    }
  };

  // 최초 로드 시에만 전체 스피너 — 추가/수정/삭제 후 재조회 시 목록이 깜빡이지 않도록
  if (loading && !dataLoaded) return <LoadingSpinner message="북마크를 불러오는 중..." />;

  return (
    <div className="space-y-8">
      <ConfirmationModal
        open={!!confirmDeleteId}
        title="북마크를 삭제하시겠습니까?"
        confirmLabel="삭제"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* 북마크 추가 */}
      <AdminSection title="북마크 추가">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              이름
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-44 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="예: Google"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              URL
            </label>
            <input
              type="text"
              value={formData.url}
              onChange={e => setFormData({ ...formData, url: e.target.value })}
              className="w-64 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="https://google.com"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!formData.name || !formData.url}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors"
          >
            추가
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          아이콘 URL을 비워두면 도메인의 파비콘이 자동으로 설정됩니다.
        </p>
      </AdminSection>

      {/* 북마크 목록 */}
      <AdminSection title={`북마크 목록 (${bookmarks.length}개)`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-center px-2 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">
                  순서
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  이름
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  URL
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
              {bookmarks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    등록된 북마크가 없습니다.
                  </td>
                </tr>
              ) : (
                bookmarks.map((bookmark, index) => (
                  <tr
                    key={bookmark.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${!bookmark.isActive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-2 py-2 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label="위로 이동"
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        >
                          <svg
                            className="w-3 h-3 text-slate-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 15l7-7 7 7"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => move(index, 1)}
                          disabled={index === bookmarks.length - 1}
                          aria-label="아래로 이동"
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                        >
                          <svg
                            className="w-3 h-3 text-slate-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {editingId === bookmark.id ? (
                        <input
                          type="text"
                          value={editFormData?.name || ''}
                          onChange={e =>
                            setEditFormData(
                              editFormData ? { ...editFormData, name: e.target.value } : null
                            )
                          }
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {bookmark.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editingId === bookmark.id ? (
                        <input
                          type="text"
                          value={editFormData?.url || ''}
                          onChange={e =>
                            setEditFormData(
                              editFormData ? { ...editFormData, url: e.target.value } : null
                            )
                          }
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate block max-w-xs">
                          {bookmark.url}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(bookmark.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-colors ${bookmark.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${bookmark.isActive ? 'bg-green-500' : 'bg-slate-400'}`}
                        />
                        {bookmark.isActive ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editingId === bookmark.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleUpdate(bookmark.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                          >
                            저장
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(bookmark)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 dark:hover:bg-primary-900/20 transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(bookmark.id)}
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
}

export default BookmarkManagement;
