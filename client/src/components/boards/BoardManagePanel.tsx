import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Tag } from '../../types/board.types';
import { getTags, createTag, updateTag, deleteTag } from '../../api/tags';
import { updateBoardInfo } from '../../api/boards';
import { toast } from '../../utils/toast';

interface BoardManagePanelProps {
  boardType: string;
  initialName: string;
  initialDescription: string;
  onClose: () => void;
  onBoardUpdated: (info: { name: string; description: string }) => void;
}

const DEFAULT_COLOR = '#3b82f6';

/** 게시판 내 관리 패널 — 담당자/관리자가 이 게시판의 기본정보와 태그를 관리 */
export function BoardManagePanel({
  boardType,
  initialName,
  initialDescription,
  onClose,
  onBoardUpdated,
}: BoardManagePanelProps) {
  // 게시판 정보
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [savingInfo, setSavingInfo] = useState(false);

  // 태그
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [newTag, setNewTag] = useState({ name: '', color: DEFAULT_COLOR });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', color: DEFAULT_COLOR });
  const [busyTagId, setBusyTagId] = useState<number | null>(null);

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // 접근성: ESC 닫기 + 첫 포커스
  useEffect(() => {
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    getTags(boardType)
      .then(data => {
        if (mounted) setTags(data);
      })
      .catch(() => {
        if (mounted) toast.error('태그를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (mounted) setLoadingTags(false);
      });
    return () => {
      mounted = false;
    };
  }, [boardType]);

  const handleSaveInfo = async () => {
    if (!name.trim()) {
      toast.error('게시판 이름을 입력해주세요.');
      return;
    }
    setSavingInfo(true);
    try {
      await updateBoardInfo(boardType, { name: name.trim(), description });
      toast.success('게시판 정보가 저장되었습니다.');
      onBoardUpdated({ name: name.trim(), description });
    } catch {
      toast.error('게시판 정보 저장에 실패했습니다.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTag.name.trim()) {
      toast.error('태그 이름을 입력해주세요.');
      return;
    }
    setCreating(true);
    try {
      const tag = await createTag({
        name: newTag.name.trim(),
        color: newTag.color,
        boardId: boardType,
      });
      setTags(prev => [...prev, tag]);
      setNewTag({ name: '', color: DEFAULT_COLOR });
      toast.success('태그가 추가되었습니다.');
    } catch {
      toast.error('태그 추가에 실패했습니다. (이름 중복 여부 확인)');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditForm({ name: tag.name, color: tag.color || DEFAULT_COLOR });
  };

  const handleSaveEdit = async (id: number) => {
    if (!editForm.name.trim()) {
      toast.error('태그 이름을 입력해주세요.');
      return;
    }
    setBusyTagId(id);
    try {
      const updated = await updateTag(id, { name: editForm.name.trim(), color: editForm.color });
      setTags(prev => prev.map(t => (t.id === id ? updated : t)));
      setEditingId(null);
      toast.success('태그가 수정되었습니다.');
    } catch {
      toast.error('태그 수정에 실패했습니다.');
    } finally {
      setBusyTagId(null);
    }
  };

  const handleDeleteTag = async (id: number) => {
    if (!window.confirm('이 태그를 삭제하시겠습니까? 게시글에서도 제거됩니다.')) return;
    setBusyTagId(id);
    try {
      await deleteTag(id);
      setTags(prev => prev.filter(t => t.id !== id));
      toast.success('태그가 삭제되었습니다.');
    } catch {
      toast.error('태그 삭제에 실패했습니다.');
    } finally {
      setBusyTagId(null);
    }
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="게시판 관리"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            게시판 관리
          </h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* 게시판 기본정보 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">기본 정보</h3>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                게시판 이름
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={100}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                설명
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveInfo} disabled={savingInfo} className="btn-primary">
                {savingInfo ? '저장 중...' : '정보 저장'}
              </button>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* 태그 관리 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              태그 관리
              <span className="ml-1.5 text-xs font-normal text-slate-400">이 게시판 전용</span>
            </h3>

            {/* 새 태그 추가 */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newTag.color}
                onChange={e => setNewTag(p => ({ ...p, color: e.target.value }))}
                aria-label="새 태그 색상"
                className="w-9 h-9 flex-shrink-0 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={newTag.name}
                onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTag();
                }}
                placeholder="새 태그 이름"
                maxLength={50}
                className={inputCls}
              />
              <button
                onClick={handleCreateTag}
                disabled={creating}
                className="btn-primary flex-shrink-0"
              >
                추가
              </button>
            </div>

            {/* 태그 목록 */}
            {loadingTags ? (
              <p className="text-sm text-slate-400 py-2">태그를 불러오는 중...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">등록된 태그가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {tags.map(tag => (
                  <li
                    key={tag.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    {editingId === tag.id ? (
                      <>
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                          aria-label="태그 색상"
                          className="w-8 h-8 flex-shrink-0 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                          maxLength={50}
                          className={`${inputCls} py-1`}
                        />
                        <button
                          onClick={() => handleSaveEdit(tag.id)}
                          disabled={busyTagId === tag.id}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className="flex-1 inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 min-w-0"
                          title={tag.name}
                        >
                          <span
                            className="w-3 h-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color || DEFAULT_COLOR }}
                          />
                          <span className="truncate">#{tag.name}</span>
                        </span>
                        <button
                          onClick={() => startEdit(tag)}
                          className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          disabled={busyTagId === tag.id}
                          className="px-2 py-1 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
}
