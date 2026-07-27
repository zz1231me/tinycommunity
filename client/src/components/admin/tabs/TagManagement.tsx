import React, { useState, useEffect, useCallback } from 'react';
import { Tag } from '../../../types/board.types';
import { getTags, createTag, updateTag, deleteTag } from '../../../api/tags';
import { getAllBoardsWithManagers } from '../../../api/boardManagers';
import { BoardWithManagers } from '../../../types/boardManager.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';

const TagManagement = () => {
  const [boards, setBoards] = useState<BoardWithManagers[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingTags, setLoadingTags] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#3b82f6', description: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: number; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getAllBoardsWithManagers()
      .then(setBoards)
      .catch(() => toast.error('게시판 목록을 불러오는데 실패했습니다.'))
      .finally(() => setLoadingBoards(false));
  }, []);

  const fetchTags = useCallback(async (boardId: string | null) => {
    setLoadingTags(true);
    setEditingTag(null);
    setIsCreating(false);
    try {
      const data = await getTags(boardId);
      setTags(data);
    } catch {
      toast.error('태그 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const handleSelectBoard = useCallback(
    (boardId: string) => {
      setSelectedBoardId(boardId);
      fetchTags(boardId);
    },
    [fetchTags]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !selectedBoardId) return;
    setIsSaving(true);
    try {
      if (editingTag) {
        const updated = await updateTag(editingTag.id, form);
        setTags(prev => prev.map(t => (t.id === updated.id ? updated : t)));
        toast.success('태그가 수정되었습니다.');
      } else {
        const created = await createTag({ ...form, boardId: selectedBoardId });
        setTags(prev => [...prev, created]);
        toast.success('태그가 생성되었습니다.');
      }
      setEditingTag(null);
      setIsCreating(false);
      setForm({ name: '', color: '#3b82f6', description: '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTag(id);
      setTags(prev => prev.filter(t => t.id !== id));
      toast.success('태그가 삭제되었습니다.');
    } catch {
      toast.error('삭제에 실패했습니다.');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingTag(tag);
    setIsCreating(false);
    setForm({ name: tag.name, color: tag.color, description: tag.description || '' });
  };

  const startCreate = () => {
    setEditingTag(null);
    setIsCreating(true);
    setForm({ name: '', color: '#3b82f6', description: '' });
  };

  const cancelForm = () => {
    setEditingTag(null);
    setIsCreating(false);
  };

  if (loadingBoards) return <LoadingSpinner message="게시판 목록 로딩 중..." />;

  const selectedBoard = boards.find(b => b.id === selectedBoardId);

  return (
    <div className="space-y-6">
      <ConfirmationModal
        open={!!confirmDeleteId}
        title="태그를 삭제하시겠습니까?"
        message={
          confirmDeleteId ? `#${confirmDeleteId.name} 태그가 게시글에서도 제거됩니다.` : undefined
        }
        confirmLabel="삭제"
        variant="danger"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId.id)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <AdminSection
        title="태그 관리"
        description="게시판별로 태그를 독립적으로 관리합니다. 게시글 작성 시 해당 게시판의 태그만 선택됩니다."
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
                  onClick={() => handleSelectBoard(board.id)}
                  style={{ outline: 'none', border: 'none' }}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                    selectedBoardId === board.id
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{board.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 태그 관리 패널 */}
          <div className="lg:col-span-2">
            {!selectedBoard ? (
              <div className="flex items-center justify-center h-48 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  좌측에서 게시판을 선택해주세요
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span className="text-primary-600 dark:text-primary-400">
                      {selectedBoard.name}
                    </span>{' '}
                    태그
                  </h3>
                  {!isCreating && !editingTag && (
                    <button
                      onClick={startCreate}
                      style={{ outline: 'none', border: 'none' }}
                      className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      + 새 태그
                    </button>
                  )}
                </div>

                {/* 태그 추가/수정 폼 */}
                {(isCreating || editingTag) && (
                  <form
                    onSubmit={handleSave}
                    className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl flex flex-wrap gap-4 items-end border border-slate-200 dark:border-slate-600"
                  >
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        태그명 *
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        required
                        placeholder="태그 이름"
                        className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        색상
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.color}
                          onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                          className="w-8 h-8 rounded cursor-pointer border border-slate-300 dark:border-slate-600"
                        />
                        <input
                          type="text"
                          value={form.color}
                          onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                          className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-mono w-24 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        설명
                      </label>
                      <input
                        type="text"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="선택사항"
                        className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isSaving}
                        style={{ outline: 'none', border: 'none' }}
                        className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-60 transition-colors"
                      >
                        {isSaving ? '저장 중...' : editingTag ? '수정' : '추가'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelForm}
                        style={{ outline: 'none', border: 'none' }}
                        className="px-4 py-1.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                )}

                {/* 태그 목록 */}
                {loadingTags ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : tags.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">
                    이 게시판에 등록된 태그가 없습니다
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {tags.map(tag => (
                      <div
                        key={tag.id}
                        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          #{tag.name}
                        </span>
                        {tag.description && (
                          <span className="text-xs text-slate-400">{tag.description}</span>
                        )}
                        <button
                          onClick={() => startEdit(tag)}
                          style={{ outline: 'none', border: 'none' }}
                          className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 transition-colors"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId({ id: tag.id, name: tag.name })}
                          style={{ outline: 'none', border: 'none' }}
                          className="text-xs text-red-500 hover:text-red-600 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AdminSection>
    </div>
  );
};

export default TagManagement;
