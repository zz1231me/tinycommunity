import { useState, useEffect, useCallback } from 'react';
import {
  getAllBoardsWithManagers,
  addBoardManager,
  removeBoardManager,
} from '../../../api/boardManagers';
import { BoardWithManagers, BoardManagerRecord } from '../../../types/boardManager.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import api from '../../../api/axios';
import { unwrap } from '../../../api/utils';

interface UserOption {
  id: string;
  name: string;
  email?: string;
}

const BoardManagerManagement = () => {
  const [boards, setBoards] = useState<BoardWithManagers[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
    boardName: string;
  } | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllBoardsWithManagers();
      setBoards(data);
    } catch {
      toast.error('게시판 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/users');
        const data = unwrap<UserOption[]>(res);
        setUsers(data);
      } catch {
        toast.error('사용자 목록을 불러오지 못했습니다.');
      }
    };
    void load();
  }, []);

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return (u.name ?? '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
  });

  const selectedBoard = boards.find(b => b.id === selectedBoardId);

  const handleAdd = async () => {
    if (!selectedBoardId || !selectedUserId || isAdding) return;
    setIsAdding(true);
    try {
      await addBoardManager(selectedBoardId, selectedUserId);
      toast.success('담당자가 추가되었습니다.');
      setSelectedUserId('');
      setUserSearch('');
      await fetchBoards();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '추가에 실패했습니다.';
      toast.error(message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (record: BoardManagerRecord, boardName: string) => {
    setConfirmDelete({
      id: record.id,
      name: record.user?.name ?? '사용자',
      boardName,
    });
  };

  const confirmRemove = async () => {
    if (!confirmDelete) return;
    try {
      await removeBoardManager(confirmDelete.id);
      toast.success('담당자가 삭제되었습니다.');
      await fetchBoards();
    } catch {
      toast.error('삭제에 실패했습니다.');
    } finally {
      setConfirmDelete(null);
    }
  };

  if (loading) return <LoadingSpinner message="게시판 담당자 정보 로딩 중..." />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="게시판 담당자 관리"
        description="게시판별로 담당자를 지정합니다. 담당자는 해당 게시판의 게시글을 고정할 수 있습니다."
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 게시판 목록 */}
          <div className="lg:col-span-1">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              게시판 선택
            </h3>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {boards.map(board => (
                <button
                  key={board.id}
                  onClick={() => {
                    setSelectedBoardId(board.id);
                    setSelectedUserId('');
                    setUserSearch('');
                  }}
                  style={{ outline: 'none', border: 'none' }}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                    selectedBoardId === board.id
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{board.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                        selectedBoardId === board.id
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {board.boardManagers?.length ?? 0}명
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 담당자 관리 패널 */}
          <div className="lg:col-span-2">
            {!selectedBoard ? (
              <div className="flex items-center justify-center h-48 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  좌측에서 게시판을 선택해주세요
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span className="text-primary-600 dark:text-primary-400">
                    {selectedBoard.name}
                  </span>{' '}
                  담당자
                </h3>

                {/* 담당자 목록 */}
                <div className="space-y-2">
                  {!selectedBoard.boardManagers?.length ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                      지정된 담당자가 없습니다
                    </p>
                  ) : (
                    selectedBoard.boardManagers.map(record => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-[2px] bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-sm">
                            {record.user?.name?.[0] ?? '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                              {record.user?.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {record.user?.email}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemove(record, selectedBoard.name)}
                          style={{ outline: 'none', border: 'none' }}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* 담당자 추가 */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                    담당자 추가
                  </h4>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="이름 또는 아이디로 검색"
                        value={userSearch}
                        onChange={e => {
                          setUserSearch(e.target.value);
                          setSelectedUserId('');
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      {userSearch && !selectedUserId && filteredUsers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                          {filteredUsers.map(u => (
                            <button
                              key={u.id}
                              onClick={() => {
                                setSelectedUserId(u.id);
                                setUserSearch(`${u.name} (${u.id})`);
                              }}
                              style={{ outline: 'none', border: 'none' }}
                              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {u.name}
                              </p>
                              <p className="text-xs text-slate-500">{u.id}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleAdd}
                      disabled={!selectedUserId || isAdding}
                      style={{ outline: 'none', border: 'none' }}
                      className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors flex-shrink-0"
                    >
                      {isAdding ? '추가 중...' : '추가'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AdminSection>

      <ConfirmationModal
        open={confirmDelete !== null}
        title="담당자 삭제"
        message={
          confirmDelete
            ? `${confirmDelete.boardName} 게시판에서 ${confirmDelete.name}님을 담당자에서 삭제하시겠습니까?`
            : ''
        }
        onConfirm={() => {
          confirmRemove().catch(() => {});
        }}
        onCancel={() => setConfirmDelete(null)}
        confirmLabel="삭제"
        variant="danger"
      />
    </div>
  );
};

export default BoardManagerManagement;
