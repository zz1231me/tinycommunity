// 일정 단추 + 달력 팝업. 글 상세처럼 달력을 펼쳐 둘 자리가 없는 곳에서 쓴다.
// (칸반 카드 메뉴는 이미 팝업이라 그 안에 DateRangeCalendar 를 바로 넣는다 — 팝업 위에 팝업을 겹치지 않는다.)

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
import { CalendarDays } from 'lucide-react';
import { DateRangeCalendar } from './DateRangeCalendar';
import { describeDraft, draftFrom } from './dateRange';
import type { Schedule } from './taskViews';

interface Props {
  value: Schedule;
  onApply: (schedule: Schedule) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function DateRangePicker({ value, onApply, onClear, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [
      offset(6),
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
    useClick(context, { enabled: !disabled }),
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ]);

  const hasSchedule = Boolean(value.startDate || value.dueDate);
  const label = hasSchedule ? describeDraft(draftFrom(value), new Date()).range : '일정 정하기';

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        disabled={disabled}
        aria-label={hasSchedule ? `일정 ${label} 바꾸기` : '일정 정하기'}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
          hasSchedule
            ? 'border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'
            : 'border-dashed border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700'
        }`}
        {...getReferenceProps()}
      >
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              {...getFloatingProps()}
            >
              <DateRangeCalendar
                value={value}
                autoFocus
                onCancel={() => setOpen(false)}
                onApply={next => {
                  setOpen(false);
                  onApply(next);
                }}
                onClear={() => {
                  setOpen(false);
                  onClear();
                }}
              />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
