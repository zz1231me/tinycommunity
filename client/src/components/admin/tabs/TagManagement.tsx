import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag } from '../../../types/board.types';
import { getTags, createTag, updateTag, deleteTag } from '../../../api/tags';
import { getAllBoardsWithManagers } from '../../../api/boardManagers';
import { adminKeys } from '../../../api/queryKeys';
import { BoardWithManagers } from '../../../types/boardManager.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { toast } from '../../../utils/toast';
import { ListState } from '../../common/ListState';

// 태그 색 팔레트 — 새 태그마다 여기서 랜덤 기본색을 뽑고, 원클릭 스와치로도 제공.
// (임의 RGB 대신 큐레이션 팔레트로 대비·톤을 보장)
// 원색(Tailwind-500 레인보우) 대신 살짝 차분한(muted) 톤 — 촌스럽지 않고 서로 조화롭게.
const TAG_PALETTE = [
  '#64748b', // slate
  '#4d908e', // muted teal
  '#4a7ba6', // muted azure
  '#5e6ba8', // muted indigo
  '#8a6fa8', // muted violet
  '#a87f9e', // dusty mauve
  '#b56576', // dusty rose
  '#c9836b', // muted coral
  '#c9a15e', // muted gold
  '#8a9a5b', // olive
  '#5c9a72', // muted green
  '#7d8597', // slate gray
];
const randomTagColor = () => TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];

const TagManagement = () => {
  const queryClient = useQueryClient();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', color: randomTagColor(), description: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: number; name: string } | null>(null);

  const { data: boards = [], isPending: loadingBoards } = useQuery<BoardWithManagers[]>({
    queryKey: adminKeys.boardManagers.all,
    queryFn: getAllBoardsWithManagers,
  });

  // 선택된 게시판이 없으면 조회하지 않는다(enabled).
  const {
    data: tags = [],
    isFetching: loadingTags,
    // 조회가 실패해도 목록은 빈 배열이다. 그대로 두면 '태그가 없습니다' 가 떠서
    // 관리자가 이미 있는 태그를 다시 만들게 된다.
    isError: tagsFailed,
  } = useQuery({
    queryKey: adminKeys.tags.byBoard(selectedBoardId),
    queryFn: () => getTags(selectedBoardId),
    enabled: selectedBoardId !== null,
  });

  const invalidateTags = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.tags.byBoard(selectedBoardId) });

  const saveMutation = useMutation({
    mutationFn: () =>
      editingTag
        ? updateTag(editingTag.id, form)
        : createTag({ ...form, boardId: selectedBoardId as string }),
    onSuccess: invalidateTags,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: invalidateTags,
  });

  const isSaving = saveMutation.isPending;

  const handleSelectBoard = (boardId: string) => {
    setSelectedBoardId(boardId);
    setEditingTag(null);
    setIsCreating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !selectedBoardId) return;
    try {
      await saveMutation.mutateAsync();
      toast.success(editingTag ? '태그가 수정되었습니다.' : '태그가 생성되었습니다.');
      setEditingTag(null);
      setIsCreating(false);
      setForm({ name: '', color: randomTagColor(), description: '' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
      toast.error(message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
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
    setForm({ name: '', color: randomTagColor(), description: '' });
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
                <p className="text-sm text-slate-400">좌측에서 게시판을 선택해주세요</p>
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
                      className="btn-primary px-3 py-1.5"
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
                      <label className="form-label">태그명 *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        required
                        placeholder="태그 이름"
                        className="input input-sm w-auto"
                      />
                    </div>
                    <div>
                      <label className="form-label">색상</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.color}
                          onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                          className="w-8 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-600"
                        />
                        <input
                          type="text"
                          value={form.color}
                          onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                          className="input input-sm w-24 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, color: randomTagColor() }))}
                          title="랜덤 색상"
                          className="btn-secondary btn-sm"
                        >
                          🎲
                        </button>
                      </div>
                      {/* 팔레트 원클릭 스와치 */}
                      <div className="flex flex-wrap gap-1 mt-2 max-w-[240px]">
                        {TAG_PALETTE.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, color: c }))}
                            title={c}
                            aria-label={`색상 ${c}`}
                            className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                              form.color.toLowerCase() === c.toLowerCase()
                                ? 'ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-800'
                                : ''
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="form-label">설명</label>
                      <input
                        type="text"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="선택사항"
                        className="input input-sm w-auto"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isSaving}
                        style={{ outline: 'none', border: 'none' }}
                        className="btn-primary btn-sm"
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
                ) : tagsFailed ? (
                  <ListState>태그를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
                ) : tags.length === 0 ? (
                  <ListState>이 게시판에 등록된 태그가 없습니다</ListState>
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
