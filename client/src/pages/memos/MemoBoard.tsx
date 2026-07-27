import { useState, useEffect, useCallback, useRef } from 'react';
import { Memo, MemoColor } from '../../types/memo.types';
import { getMemos, createMemo, updateMemo, deleteMemo } from '../../api/memos';
import { MemoCard } from './MemoCard';
import { MemoEditor } from './MemoEditor';
import { PageHeader } from '../../components/common/PageHeader';
import { PageContainer } from '../../components/common/PageContainer';
import { LoadingSpinner } from '../../components/admin/common/LoadingSpinner';

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
        <button
          onClick={handleNewMemo}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-sm"
        >
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
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
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
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
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

      {/* Delete confirm modal */}
      {deleteTargetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">메모 삭제</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              이 메모를 삭제하시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default MemoBoard;
