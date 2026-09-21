import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Tag } from '../../types/board.types';
import { getTags, createTag, updateTag, deleteTag } from '../../api/tags';
import { updateBoardInfo } from '../../api/boards';
import { toast } from '../../utils/toast';
import { DEFAULT_TAG_COLOR, TAG_COLOR_PALETTE, suggestTagColor } from '../../constants/colors';
import { ConfirmationModal } from '../admin/common/ConfirmationModal';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAuth } from '../../store/auth';
import { fetchAdminUsers } from '../../api/admin';
import { getBoardManagers, addBoardManager, removeBoardManager } from '../../api/boardManagers';
import { BoardManagerRecord } from '../../types/boardManager.types';
import { User as AdminUserItem } from '../../types/admin.types';

interface BoardManagePanelProps {
  boardType: string;
  initialName: string;
  initialDescription: string;
  initialTaskEnabled: boolean;
  onClose: () => void;
  onBoardUpdated: (info: { name: string; description: string; taskEnabled: boolean }) => void;
}

const DEFAULT_COLOR = DEFAULT_TAG_COLOR;

/** 색상 빠른 선택 — 추천 팔레트 스와치 + 직접 선택 */
function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isPreset = TAG_COLOR_PALETTE.some(c => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TAG_COLOR_PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`색상 ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
            value.toLowerCase() === c.toLowerCase()
              ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110'
              : ''
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        title="직접 선택"
        className={`relative w-6 h-6 rounded-full cursor-pointer overflow-hidden border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center ${
          !isPreset ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900' : ''
        }`}
        style={!isPreset ? { backgroundColor: value } : undefined}
      >
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label="태그 색상 직접 선택"
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        {isPreset && <span className="text-xs text-slate-400 leading-none">+</span>}
      </label>
    </div>
  );
}

/** 게시판 내 관리 패널 — 담당자/관리자가 이 게시판의 기본정보와 태그를 관리 */
export function BoardManagePanel({
  boardType,
  initialName,
  initialDescription,
  initialTaskEnabled,
  onClose,
  onBoardUpdated,
}: BoardManagePanelProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [taskEnabled, setTaskEnabled] = useState(initialTaskEnabled);
  const [savingInfo, setSavingInfo] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [newTag, setNewTag] = useState({ name: '', color: suggestTagColor([]) });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', color: DEFAULT_COLOR });
  const [busyTagId, setBusyTagId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // 담당자 (관리자에게만 보이는 구역)
  const isAdmin = useAuth(s => s.isAdmin);
  const canAssignManagers = isAdmin();
  const [managers, setManagers] = useState<BoardManagerRecord[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [candidates, setCandidates] = useState<AdminUserItem[]>([]);
  const [managerSearch, setManagerSearch] = useState('');
  const [addingManagerId, setAddingManagerId] = useState<string | null>(null);
  const [removeManagerTarget, setRemoveManagerTarget] = useState<BoardManagerRecord | null>(null);
  // 상태가 아니라 ref 다. 상태로 두면 effect 의존성이 되어 방금 보낸 요청의 응답을 스스로 버린다.
  const candidatesLoadedRef = useRef(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ESC 닫기 + 첫 포커스 + Tab 가두기. 맨 아래 확인 대화상자는 오버레이 밖이라 따로 가둔다.
  useFocusTrap(panelRef, onClose, true, closeBtnRef);

  useEffect(() => {
    let mounted = true;
    getTags(boardType)
      .then(data => {
        if (mounted) {
          setTags(data);
          // 기존 태그가 안 쓴 색을 새 태그 기본색으로 자동 추천 → 매번 고를 필요 없음
          setNewTag(p => ({
            ...p,
            color: suggestTagColor(data.map(t => t.color || DEFAULT_COLOR)),
          }));
        }
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
      await updateBoardInfo(boardType, { name: name.trim(), description, taskEnabled });
      toast.success('게시판 정보가 저장되었습니다.');
      onBoardUpdated({ name: name.trim(), description, taskEnabled });
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
      const nextTags = [...tags, tag];
      setTags(nextTags);
      // 다음 태그 색도 자동 추천(직전 색과 겹치지 않게)
      setNewTag({ name: '', color: suggestTagColor(nextTags.map(t => t.color || DEFAULT_COLOR)) });
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

  // 삭제는 스타일된 ConfirmationModal로 확인(네이티브 window.confirm 대체)
  const confirmDeleteTag = async () => {
    const id = deleteTargetId;
    if (id === null) return;
    setDeleteTargetId(null);
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

  // 담당자 추가·삭제는 서버가 admin 전용이라 화면에서도 관리자에게만 보인다.
  useEffect(() => {
    if (!canAssignManagers) return;
    let mounted = true;
    setLoadingManagers(true);
    getBoardManagers(boardType)
      .then(list => {
        if (mounted) setManagers(list);
      })
      .catch(() => {
        if (mounted) toast.error('담당자 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (mounted) setLoadingManagers(false);
      });
    return () => {
      mounted = false;
    };
  }, [boardType, canAssignManagers]);

  // 후보(전체 사용자)는 검색을 시작할 때 한 번만 받는다.
  // effect 가 아니라 입력 시점에 부른다. effect 로 두면 키 입력마다 재실행되며 응답이 버려진다.
  const ensureCandidates = () => {
    if (candidatesLoadedRef.current) return;
    candidatesLoadedRef.current = true;
    fetchAdminUsers()
      .then(setCandidates)
      .catch(() => {
        candidatesLoadedRef.current = false;
        toast.error('사용자 목록을 불러오지 못했습니다.');
      });
  };

  const reloadManagers = async () => {
    try {
      setManagers(await getBoardManagers(boardType));
    } catch {
      toast.error('담당자 목록을 새로 불러오지 못했습니다.');
    }
  };

  const handleAddManager = async (userId: string) => {
    if (addingManagerId) return;
    setAddingManagerId(userId);
    try {
      await addBoardManager(boardType, userId);
      setManagerSearch('');
      await reloadManagers();
      toast.success('담당자가 추가되었습니다.');
    } catch {
      toast.error('담당자 추가에 실패했습니다.');
    } finally {
      setAddingManagerId(null);
    }
  };

  const confirmRemoveManager = async () => {
    const target = removeManagerTarget;
    if (!target) return;
    setRemoveManagerTarget(null);
    try {
      await removeBoardManager(target.id);
      await reloadManagers();
      toast.success('담당자에서 제외했습니다.');
    } catch {
      toast.error('담당자 제외에 실패했습니다.');
    }
  };

  // 검색어를 넣었을 때만 후보를 보여 준다. 이미 담당자인 사람은 뺀다.
  const managerUserIds = new Set(managers.map(m => m.userId));
  const managerQuery = managerSearch.trim().toLowerCase();
  const managerCandidates = managerQuery
    ? candidates
        .filter(u => !managerUserIds.has(u.id))
        .filter(
          u =>
            (u.name ?? '').toLowerCase().includes(managerQuery) ||
            u.id.toLowerCase().includes(managerQuery)
        )
        .slice(0, 5)
    : [];

  const inputCls = 'input';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-scrim"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="게시판 관리"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="card-title">게시판 관리</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">기본 정보</h3>
            <div>
              <label className="form-label" htmlFor="board-name">
                게시판 이름
              </label>
              <input
                id="board-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={100}
                className={inputCls}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="board-desc">
                설명
              </label>
              <textarea
                id="board-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="checkbox"
                checked={taskEnabled}
                onChange={e => setTaskEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                  업무용 게시판
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  글마다 담당자와 진행 상태(할 일·진행 중·완료)를 붙입니다. 끄면 상태 줄과 담당자
                  칼럼이 사라지고, 이미 지정된 담당은 &lsquo;내 업무&rsquo;에서도 빠집니다. 값은
                  지워지지 않으니 다시 켜면 그대로 돌아옵니다.
                </span>
              </span>
            </label>

            <div className="flex justify-end">
              <button onClick={handleSaveInfo} disabled={savingInfo} className="btn-primary">
                {savingInfo ? '저장 중...' : '정보 저장'}
              </button>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              태그 관리
              <span className="ml-1.5 text-xs font-normal text-slate-400">이 게시판 전용</span>
            </h3>

            <div className="space-y-2">
              <ColorSwatches
                value={newTag.color}
                onChange={c => setNewTag(p => ({ ...p, color: c }))}
              />
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 flex-shrink-0 rounded-full border border-black/5 dark:border-white/10"
                  style={{ backgroundColor: newTag.color }}
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={newTag.name}
                  onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => {
                    if (e.nativeEvent.isComposing) return;
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
            </div>

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
                      <div className="w-full space-y-2">
                        <ColorSwatches
                          value={editForm.color}
                          onChange={c => setEditForm(p => ({ ...p, color: c }))}
                        />
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 flex-shrink-0 rounded-full border border-black/5 dark:border-white/10"
                            style={{ backgroundColor: editForm.color }}
                            aria-hidden="true"
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
                            className="btn-primary px-3 py-1 text-xs"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                          >
                            취소
                          </button>
                        </div>
                      </div>
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
                          onClick={() => setDeleteTargetId(tag.id)}
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

          {canAssignManagers && (
            <>
              <hr className="border-slate-200 dark:border-slate-700" />

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  게시판 담당자
                  <span className="ml-1.5 text-xs font-normal text-slate-400">관리자만 지정</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  담당자는 이 게시판의 글을 고정하고 이 화면으로 태그·기본 정보를 관리할 수
                  있습니다.
                </p>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={managerSearch}
                    onChange={e => {
                      setManagerSearch(e.target.value);
                      if (e.target.value.trim()) ensureCandidates();
                    }}
                    placeholder="이름 또는 아이디로 사용자 검색"
                    className={inputCls}
                  />
                  {managerQuery && managerCandidates.length === 0 && (
                    <p className="py-1 text-sm text-slate-400">추가할 수 있는 사용자가 없습니다.</p>
                  )}
                  {managerCandidates.length > 0 && (
                    <ul className="space-y-1">
                      {managerCandidates.map(u => (
                        <li key={u.id}>
                          <button
                            onClick={() => handleAddManager(u.id)}
                            disabled={addingManagerId !== null}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                          >
                            <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">
                              {u.name}
                              <span className="ml-1.5 text-xs text-slate-400">@{u.id}</span>
                            </span>
                            <span className="flex-shrink-0 text-xs text-primary-600 dark:text-primary-400">
                              {addingManagerId === u.id ? '추가 중...' : '담당자로 지정'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {loadingManagers ? (
                  <p className="py-2 text-sm text-slate-400">담당자를 불러오는 중...</p>
                ) : managers.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400">지정된 담당자가 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {managers.map(m => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                          {m.user?.name ?? m.userId}
                          <span className="ml-1.5 text-xs text-slate-400">@{m.userId}</span>
                        </span>
                        <button
                          onClick={() => setRemoveManagerTarget(m)}
                          // 화면에는 '제외' 한 글자만 두되, 읽어 주는 쪽에는 누구를 제외하는지 밝힌다
                          aria-label={`${m.user?.name ?? m.userId}님을 담당자에서 제외`}
                          className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          제외
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </motion.div>

      <ConfirmationModal
        open={deleteTargetId !== null}
        title="태그 삭제"
        message="이 태그를 삭제하시겠습니까? 게시글에서도 제거됩니다."
        confirmLabel="삭제"
        variant="danger"
        onConfirm={confirmDeleteTag}
        onCancel={() => setDeleteTargetId(null)}
      />

      <ConfirmationModal
        open={removeManagerTarget !== null}
        title="담당자 제외"
        message={`${removeManagerTarget?.user?.name ?? '이 사용자'}님을 이 게시판의 담당자에서 제외하시겠습니까?`}
        confirmLabel="제외"
        variant="danger"
        onConfirm={confirmRemoveManager}
        onCancel={() => setRemoveManagerTarget(null)}
      />
    </div>
  );
}
