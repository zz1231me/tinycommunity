import { useState, useEffect, useCallback, useRef } from 'react';
import { Memo, MemoColor } from '../../types/memo.types';
import { getMemos, createMemo, updateMemo, deleteMemo } from '../../api/memos';
import { MemoCard } from './MemoCard';
import { MemoEditor } from './MemoEditor';
import { PageHeader } from '../../components/common/PageHeader';
import { PageContainer } from '../../components/common/PageContainer';
import { LoadingSpinner } from '../../components/admin/common/LoadingSpinner';
import { ConfirmationModal } from '../../components/admin/common/ConfirmationModal';

// editorState: null = 에디터 닫힘, Memo = 기존 메모 편집, 'new' = 새 메모 작성
type EditorState = Memo | 'new' | null;

const MemoBoard = () => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorState, setEditorState] = useState<EditorState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);
  const pinningRef = useRef(false);

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMemos();
      setMemos(data);
    } catch {
      setError('메모를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  const handleNewMemo = () => setEditorState('new');

  const handleSave = async (data: { title: string; content: string; color: MemoColor }) => {
    if (isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      if (editorState && editorState !== 'new') {
        const updated = await updateMemo(editorState.id, data);
        setMemos(prev => prev.map(m => (m.id === updated.id ? updated : m)));
      } else {
        const created = await createMemo(data);
        setMemos(prev => [created, ...prev]);
      }
      setEditorState(null);
    } catch {
      setError('메모 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (deleteTargetId === null) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      await deleteMemo(id);
      setMemos(prev => prev.filter(m => m.id !== id));
    } catch {
      setError('메모 삭제에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleTogglePin = async (id: number, isPinned: boolean) => {
    if (pinningRef.current) return;
    pinningRef.current = true;
    setPinningId(id);
    try {
      const updated = await updateMemo(id, { isPinned });
      setMemos(prev => {
        const newMemos = prev.map(m => (m.id === updated.id ? updated : m));
        return [...newMemos].sort((a, b) => {
          if (a.isPinned === b.isPinned) return a.order - b.order;
          return a.isPinned ? -1 : 1;
        });
      });
    } catch {
      setError('핀 설정에 실패했습니다. 다시 시도해주세요.');
    } finally {
      pinningRef.current = false;
      setPinningId(null);
    }
  };

  const pinnedMemos = memos.filter(m => m.isPinned);
  const unpinnedMemos = memos.filter(m => !m.isPinned);

  return (
    <PageContainer>
      <PageHeader
        title="메모"
        description="포스트잇 스타일의 개인 메모 공간"
        icon={<span className="text-3xl">📝</span>}
      />

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-300 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* New memo button */}
      <div className="mb-6">
        <button onClick={handleNewMemo} className="btn-primary px-4 py-2">
          <span className="text-lg">+</span>새 메모 작성
        </button>
      </div>

      {loading ? (
        <LoadingSpinner message="메모 불러오는 중..." />
      ) : memos.length === 0 ? (
        <div className="text-center py-20 text-slate-400 dark:text-slate-500">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-lg">메모가 없습니다.</p>
          <p className="text-sm mt-1">위의 버튼으로 첫 메모를 작성해보세요!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned memos */}
          {pinnedMemos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 tracking-wide mb-3 flex items-center gap-2">
                📌 고정된 메모
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {pinnedMemos.map(memo => (
                  <MemoCard
                    key={memo.id}
                    memo={memo}
                    onEdit={m => setEditorState(m)}
                    onDelete={handleDelete}
                    onTogglePin={handleTogglePin}
                    isPinning={pinningId === memo.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other memos */}
          {unpinnedMemos.length > 0 && (
            <div>
              {pinnedMemos.length > 0 && (
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 tracking-wide mb-3">
                  기타 메모
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {unpinnedMemos.map(memo => (
                  <MemoCard
                    key={memo.id}
                    memo={memo}
                    onEdit={m => setEditorState(m)}
                    onDelete={handleDelete}
                    onTogglePin={handleTogglePin}
                    isPinning={pinningId === memo.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor modal */}
      {editorState !== null && (
        <MemoEditor
          memo={editorState === 'new' ? null : editorState}
          onSave={handleSave}
          onClose={() => setEditorState(null)}
          isSaving={isSaving}
        />
      )}

      {/* Delete confirm modal — 전 앱 공통 ConfirmationModal(ESC·백드롭클릭·focus-trap) */}
      <ConfirmationModal
        open={deleteTargetId !== null}
        title="메모 삭제"
        message="이 메모를 삭제하시겠습니까?"
        confirmLabel="삭제"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </PageContainer>
  );
};

export default MemoBoard;
