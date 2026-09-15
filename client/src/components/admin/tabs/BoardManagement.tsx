import { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Board } from '../../../types/admin.types';
import { useBoardManagement } from '../../../hooks/admin/useBoardManagement';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { AdminFormField, adminInputCls } from '../common/AdminFormField';
import { toast } from '../../../utils/toast';
import { useFeature } from '../../../store/features';
import { useSiteSettings } from '../../../store/siteSettings';
import { updateSiteSettings } from '../../../api/siteSettings';
import { wikiInsertIndex } from '../../../utils/sidebarOrder';
import { ListState } from '../../common/ListState';

interface BoardRowProps {
  board: Board;
  editing: boolean;
  dragDisabled: boolean;
  editBoardData: Partial<Board>;
  togglingBoardId: string | null;
  onEditData: (data: Partial<Board>) => void;
  onStartEdit: (board: Board) => void;
  onCancelEdit: () => void;
  onSaveEdit: (boardId: string) => void;
  onToggleActive: (board: Board) => void;
  onDelete: (boardId: string) => void;
}

/** 정렬 목록에서 위키 행을 가리키는 id — 게시판 id 와 겹치지 않게 */
const WIKI_ROW_ID = '__wiki__';

/**
 * 위키 행. 사이드바에서 게시판과 한 목록에 늘어서므로 여기서 함께 끌어 옮긴다.
 * 게시판이 아니라 이름·설명·상태를 고칠 것이 없어 자리만 차지한다.
 */
function SortableWikiRow({ dragDisabled, order }: { dragDisabled: boolean; order: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: WIKI_ROW_ID,
    disabled: dragDisabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`bg-secondary-50/40 dark:bg-secondary-900/10 ${isDragging ? 'opacity-50' : ''}`}
    >
      <td className="admin-td w-8">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={dragDisabled}
          title={dragDisabled ? '편집 완료 후 순서 변경 가능' : '드래그하여 순서 변경'}
          className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing disabled:opacity-40 disabled:cursor-not-allowed touch-none"
          aria-label="순서 변경 핸들"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="admin-td font-mono text-slate-400">wiki</td>
      <td className="admin-td font-medium">위키</td>
      <td className="admin-td text-slate-500 dark:text-slate-400">
        게시판이 아니라 도구입니다. 사이드바에서 보일 자리만 정합니다.
      </td>
      <td className="admin-td text-center text-slate-600 dark:text-slate-400">{order}</td>
      <td className="admin-td text-center text-slate-400">—</td>
      <td className="admin-td text-center text-slate-400">—</td>
      <td className="admin-td text-right text-slate-400">—</td>
    </tr>
  );
}

// 드래그로 순서를 바꿀 수 있는 게시판 행. 편집 중(=dragDisabled)에는 드래그를 막아
// 입력 도중 행이 튀지 않게 한다.
function SortableBoardRow({
  board,
  editing,
  dragDisabled,
  editBoardData,
  togglingBoardId,
  onEditData,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onDelete,
}: BoardRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: board.id,
    disabled: dragDisabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isDragging ? 'bg-slate-50 dark:bg-slate-700/50' : ''}`}
    >
      <td className="admin-td w-8">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={dragDisabled}
          title={dragDisabled ? '편집 완료 후 순서 변경 가능' : '드래그하여 순서 변경'}
          className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing disabled:opacity-40 disabled:cursor-not-allowed touch-none"
          aria-label="순서 변경 핸들"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="admin-td font-mono">{board.id}</td>
      <td className="admin-td">
        {editing ? (
          <input
            type="text"
            value={editBoardData.name || ''}
            onChange={e => onEditData({ ...editBoardData, name: e.target.value })}
            className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoFocus
          />
        ) : (
          <span className="font-medium text-slate-900 dark:text-slate-100">{board.name}</span>
        )}
      </td>
      <td className="admin-td">
        {editing ? (
          <input
            type="text"
            value={editBoardData.description || ''}
            onChange={e => onEditData({ ...editBoardData, description: e.target.value })}
            className="w-full px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{board.description || '-'}</span>
        )}
      </td>
      <td className="admin-td text-center">
        {editing ? (
          <input
            type="number"
            value={editBoardData.order ?? 0}
            onChange={e => onEditData({ ...editBoardData, order: parseInt(e.target.value) || 0 })}
            className="w-14 px-2 py-1 text-sm rounded border border-primary-400 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        ) : (
          <span className="text-slate-600 dark:text-slate-400">{board.order}</span>
        )}
      </td>
      <td className="admin-td text-center">
        {editing ? (
          <input
            type="checkbox"
            checked={!!editBoardData.taskEnabled}
            onChange={e => onEditData({ ...editBoardData, taskEnabled: e.target.checked })}
            aria-label="업무용 게시판"
            className="h-4 w-4 rounded border-slate-300 text-primary-600"
          />
        ) : board.taskEnabled ? (
          <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            업무용
          </span>
        ) : (
          <span className="text-xs text-slate-400">일반</span>
        )}
      </td>
      <td className="admin-td text-center">
        <button
          onClick={() => onToggleActive(board)}
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
      <td className="admin-td text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={() => onSaveEdit(board.id)} className="btn-primary btn-sm">
              저장
            </button>
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => onStartEdit(board)}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-600 dark:hover:bg-primary-900/20 transition-colors"
            >
              수정
            </button>
            <button
              onClick={() => onDelete(board.id)}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
            >
              삭제
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export const BoardManagement = () => {
  const { boards, addBoard, updateBoard, reorderBoards, deleteBoard, loading, dataLoaded } =
    useBoardManagement();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [boardForm, setBoardForm] = useState({
    id: '',
    name: '',
    description: '',
    order: 0,
    taskEnabled: false,
  });
  const [editingBoard, setEditingBoard] = useState<string | null>(null);
  const [editBoardData, setEditBoardData] = useState<Partial<Board>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [togglingBoardId, setTogglingBoardId] = useState<string | null>(null);

  const handleAddBoard = async () => {
    try {
      await addBoard(boardForm);
      setBoardForm({ id: '', name: '', description: '', order: 0, taskEnabled: false });
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
    setEditBoardData({
      name: board.name,
      description: board.description,
      order: board.order,
      taskEnabled: !!board.taskEnabled,
    });
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

  // 위키도 사이드바에서 같은 목록에 늘어서므로 여기서 함께 순서를 정한다
  const wikiEnabled = useFeature('tools.wiki');
  const wikiOrderSetting = useSiteSettings(st => st.settings.wikiOrder);
  const applySettings = useSiteSettings(st => st.updateSettings);

  const saveWikiOrder = async (order: number) => {
    const saved = await updateSiteSettings({ wikiOrder: order });
    applySettings(saved);
  };

  // 정렬 목록 = 게시판 + 위키. 사이드바와 같은 규칙으로 자리를 잡는다.
  const rowIds = useMemo<string[]>(() => {
    const ids = boards.map(b => b.id);
    if (!wikiEnabled) return ids;
    const at = wikiInsertIndex(
      boards.map(b => b.order ?? 0),
      wikiOrderSetting
    );
    return [...ids.slice(0, at), WIKI_ROW_ID, ...ids.slice(at)];
  }, [boards, wikiEnabled, wikiOrderSetting]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rowIds.indexOf(String(active.id));
    const newIndex = rowIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(rowIds, oldIndex, newIndex);
    const orderedIds = next.filter(id => id !== WIKI_ROW_ID);
    const wikiAt = next.indexOf(WIKI_ROW_ID);

    try {
      await reorderBoards(orderedIds);
      // 게시판 order 는 방금 0,1,2… 로 다시 매겨졌으므로 자리 번호가 곧 order 값이다
      if (wikiAt !== -1) await saveWikiOrder(wikiAt);
      toast.success('순서가 저장되었습니다.');
    } catch {
      toast.error('순서 저장에 실패했습니다.');
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
          <AdminFormField label="용도">
            <label
              className="flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-600"
              title="글마다 담당자와 진행 상태를 붙입니다. 나중에 바꿀 수 있습니다."
            >
              <input
                type="checkbox"
                checked={boardForm.taskEnabled}
                onChange={e => setBoardForm({ ...boardForm, taskEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              <span className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                업무용
              </span>
            </label>
          </AdminFormField>
          <button
            onClick={handleAddBoard}
            disabled={!boardForm.id || !boardForm.name}
            className="btn-primary"
          >
            게시판 추가
          </button>
        </div>
      </AdminSection>

      {/* 게시판 목록 */}
      <AdminSection title={`게시판 목록 (${boards.length}개)`}>
        <p className="text-xs text-slate-400 mb-2">
          왼쪽 손잡이를 드래그해 표시 순서를 바꿀 수 있습니다.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="admin-th w-8"></th>
                  <th className="admin-th w-28">ID</th>
                  <th className="admin-th">이름</th>
                  <th className="admin-th">설명</th>
                  <th className="admin-th text-center w-16">순서</th>
                  <th className="admin-th text-center w-20">용도</th>
                  <th className="admin-th text-center w-20">상태</th>
                  <th className="admin-th text-right w-40">작업</th>
                </tr>
              </thead>
              {boards.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={8}>
                      <ListState>등록된 게시판이 없습니다.</ListState>
                    </td>
                  </tr>
                </tbody>
              ) : (
                <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {rowIds.map((rowId, index) => {
                      if (rowId === WIKI_ROW_ID) {
                        return (
                          <SortableWikiRow
                            key={rowId}
                            dragDisabled={editingBoard !== null}
                            order={index}
                          />
                        );
                      }
                      const board = boards.find(b => b.id === rowId);
                      if (!board) return null;
                      return (
                        <SortableBoardRow
                          key={board.id}
                          board={board}
                          editing={editingBoard === board.id}
                          dragDisabled={editingBoard !== null}
                          editBoardData={editBoardData}
                          togglingBoardId={togglingBoardId}
                          onEditData={setEditBoardData}
                          onStartEdit={startEdit}
                          onCancelEdit={cancelEdit}
                          onSaveEdit={saveEdit}
                          onToggleActive={handleToggleActive}
                          onDelete={setConfirmDeleteId}
                        />
                      );
                    })}
                  </tbody>
                </SortableContext>
              )}
            </table>
          </div>
        </DndContext>
      </AdminSection>
    </div>
  );
};

export default BoardManagement;
