import { useState, useEffect } from 'react';
import { Board } from '../../../types/admin.types';
import { useBoardManagement } from '../../../hooks/admin/useBoardManagement';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { AdminFormField, adminInputCls } from '../common/AdminFormField';
import { toast } from '../../../utils/toast';

export const BoardManagement = () => {
  const { boards, fetchBoards, addBoard, updateBoard, deleteBoard, loading, dataLoaded } =
    useBoardManagement();

  useEffect(() => {
    fetchBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [boardForm, setBoardForm] = useState({ id: '', name: '', description: '', order: 0 });
  const [editingBoard, setEditingBoard] = useState<string | null>(null);
  const [editBoardData, setEditBoardData] = useState<Partial<Board>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [togglingBoardId, setTogglingBoardId] = useState<string | null>(null);

  const handleAddBoard = async () => {
    try {
      await addBoard(boardForm);
      setBoardForm({ id: '', name: '', description: '', order: 0 });
      toast.success('게시판이 추가되었습니다.');
    } catch (err: unknown) {
      // 서버 검증 메시지(ID 형식 등)를 그대로 노출해 사용자가 원인을 알 수 있게 함
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? '게시판 추가에 실패했습니다.');
    }
  };

  const handleToggleActive = async (board: Board) => {
    if (togglingBoardId === board.id) return; // 연속 클릭으로 인한 중복 PUT 방지
    setTogglingBoardId(board.id);
    try {
      await updateBoard(board.id, { isActive: !board.isActive });
      toast.success(`게시판이 ${!board.isActive ? '활성화' : '비활성화'}되었습니다.`);
    } catch {
      toast.error('상태 변경에 실패했습니다.');
    } finally {
      setTogglingBoardId(null);
    }
  };

  const handleDeleteBoard = async (id: string) => {
    try {
      await deleteBoard(id);
      toast.success('게시판이 삭제되었습니다.');
    } catch {
      toast.error('게시판 삭제에 실패했습니다.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const startEdit = (board: Board) => {
    setEditingBoard(board.id);
    setEditBoardData({ name: board.name, description: board.description, order: board.order });
  };

  const cancelEdit = () => {
    setEditingBoard(null);
    setEditBoardData({});
  };

  const saveEdit = async (boardId: string) => {
    try {
      await updateBoard(boardId, editBoardData);
      cancelEdit();
      toast.success('게시판이 수정되었습니다.');
    } catch {
      toast.error('게시판 수정에 실패했습니다.');
    }
  };

  // 최초 로드 시에만 전체 스피너 — 수정/삭제 후 재조회 시 목록이 깜빡이지 않도록
  if (loading && !dataLoaded) return <LoadingSpinner message="게시판 목록을 불러오는 중..." />;

  return (
    <div className="space-y-8">
      <ConfirmationModal
        open={!!confirmDeleteId}
        title="게시판을 삭제하시겠습니까?"
        message="게시판을 삭제하면 해당 게시판의 모든 게시글, 댓글, 첨부파일 및 권한 설정이 영구적으로 삭제됩니다."
        confirmLabel="삭제"
        onConfirm={() => confirmDeleteId && handleDeleteBoard(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* 게시판 추가 */}
      <AdminSection title="게시판 추가">
        <div className="flex flex-wrap gap-3 items-end">
          <AdminFormField label="게시판 ID" labelNote="(영문/숫자)">
            <input
              type="text"
              value={boardForm.id}
              onChange={e => setBoardForm({ ...boardForm, id: e.target.value })}
              className={adminInputCls('w-36')}
              placeholder="예: qna"
            />
          </AdminFormField>
          <AdminFormField label="게시판 이름">
            <input
              type="text"
              value={boardForm.name}
              onChange={e => setBoardForm({ ...boardForm, name: e.target.value })}
              className={adminInputCls()}
              placeholder="예: Q&A 게시판"
            />
          </AdminFormField>
          <AdminFormField label="설명">
            <input
              type="text"
              value={boardForm.description}
              onChange={e => setBoardForm({ ...boardForm, description: e.target.value })}
              className={adminInputCls('w-48')}
              placeholder="게시판 설명"
            />
          </AdminFormField>
          <AdminFormField label="표시 순서">
            <input
              type="number"
              value={boardForm.order}
              onChange={e => setBoardForm({ ...boardForm, order: parseInt(e.target.value) || 0 })}
              className={adminInputCls('w-20') + ' text-center'}
            />
          </AdminFormField>
          <button
            onClick={handleAddBoard}
            disabled={!boardForm.id || !boardForm.name}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors"
          >
            게시판 추가
          </button>
        </div>
      </AdminSection>

      {/* 게시판 목록 */}
      <AdminSection title={`게시판 목록 (${boards.length}개)`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">
                  ID
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  이름
                </th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  설명
                </th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">
                  순서
                </th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20">
                  상태
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {boards.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    등록된 게시판이 없습니다.
                  </td>
                </tr>
              ) : (
                boards.map(board => (
                  <tr key={board.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-3 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {board.id}
                    </td>
                    <td className="px-3 py-3">
                      {editingBoard === board.id ? (
                        <input
                          type="text"
                          value={editBoardData.name || ''}
                          onChange={e =>
                            setEditBoardData({ ...editBoardData, name: e.target.value })
                          }
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {board.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {editingBoard === board.id ? (
                        <input
                          type="text"
                          value={editBoardData.description || ''}
                          onChange={e =>
                            setEditBoardData({ ...editBoardData, description: e.target.value })
                          }
                          className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">
                          {board.description || '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {editingBoard === board.id ? (
                        <input
                          type="number"
                          value={editBoardData.order ?? 0}
                          onChange={e =>
                            setEditBoardData({
                              ...editBoardData,
                              order: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-14 px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      ) : (
                        <span className="text-slate-600 dark:text-slate-400">{board.order}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(board)}
                        disabled={togglingBoardId === board.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          board.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                        }`}
                        title={board.isActive ? '클릭하여 비활성화' : '클릭하여 활성화'}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${board.isActive ? 'bg-green-500' : 'bg-slate-400'}`}
                        ></span>
                        {board.isActive ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editingBoard === board.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => saveEdit(board.id)}
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
                            onClick={() => startEdit(board)}
                            className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 dark:hover:bg-primary-900/20 transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(board.id)}
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

export default BoardManagement;
