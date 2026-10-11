// 마우스를 올리거나 키보드로 포커스하면 뜨는 설명 상자. title 속성은 늦게 뜨고
// 줄바꿈·꾸밈을 못 하며 키보드로는 보이지 않아 Floating UI 로 그린다.

import { useState } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';

interface Props {
  content: React.ReactNode;
  children: React.ReactNode;
  /** 감싸는 요소의 class. 감싼 대상의 배치를 그대로 두려면 맞춰 준다. */
  className?: string;
}

export function Tooltip({ content, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: { open: 300, close: 0 }, move: false }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ]);

  return (
    <>
      <div ref={refs.setReference} className={className} {...getReferenceProps()}>
        {children}
      </div>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 max-w-xs rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-slate-700"
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
