// 칸반 카드의 ⋯ 메뉴. 끌지 않고도 상태와 일정을 바꾼다.
// 휴대폰·키보드로는 끌기가 어려워 같은 일을 할 다른 길이 필요하다.

import { useState } from 'react';
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { MoreHorizontal } from 'lucide-react';
import type { MyTask } from '../../api/tasks';
import { KANBAN_COLUMNS, type KanbanStatus, type Schedule } from './taskViews';
import { DateRangeCalendar } from './DateRangeCalendar';
import { useStatusLabel } from './useStatusLabel';

interface Props {
  task: MyTask;
  onMove: (task: MyTask, to: KanbanStatus) => void;
  onSchedule: (task: MyTask, schedule: Schedule) => void;
  onClearSchedule: (task: MyTask) => void;
}

/**
 * 카드 끌기로 번지지 않게 막는 이벤트. 메뉴는 포털로 그려도 React 이벤트는 카드까지 올라가,
 * 날짜 칸을 누른 채 조금 움직이면 카드가 끌려 나갔다. (키보드 끌기는 dnd-kit 이 카드 자신에서
 * 눌린 키만 받으므로 막을 필요가 없다.)
 */
const stopDrag = {
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
};

export function TaskCardMenu({ task, onMove, onSchedule, onClearSchedule }: Props) {
  const [open, setOpen] = useState(false);
  const statusLabel = useStatusLabel();
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [
      offset(4),
      flip(),
      shift({ padding: 8 }),
      // 달력이 들어 있어 키가 크다. 화면 아래로 잘리면 '적용' 단추가 보이지 않으므로 안에서 스크롤한다.
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(240, availableHeight)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={`'${task.title}' 상태·일정 바꾸기`}
        className="-my-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        {...getReferenceProps(stopDrag)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              aria-label={`'${task.title}' 상태·일정`}
              className="z-50 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              {...getFloatingProps(stopDrag)}
            >
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  상태
                </legend>
                <div className="flex gap-1">
                  {KANBAN_COLUMNS.map(status => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={task.workStatus === status}
                      onClick={() => {
                        if (task.workStatus !== status) onMove(task, status);
                        setOpen(false);
                      }}
                      className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        task.workStatus === status
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      {statusLabel(status)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  일정
                </legend>
                <DateRangeCalendar
                  value={task}
                  onCancel={() => setOpen(false)}
                  onApply={schedule => {
                    setOpen(false);
                    onSchedule(task, schedule);
                  }}
                  onClear={() => {
                    setOpen(false);
                    onClearSchedule(task);
                  }}
                />
              </fieldset>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
