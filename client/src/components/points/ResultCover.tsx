// client/src/components/points/ResultCover.tsx
// 결과를 덮어 두었다가 한 번의 확인으로 여는 판.
//
// 결과는 아래(children)에 이미 그려져 있고 이 판이 그 위를 덮는다. 덮개일 뿐이므로
// 화면 낭독기는 결과를 바로 읽는다. 서버가 정한 결과를 바꾸지 않는다 —
// 여기서 하는 일은 보여 주는 시점을 늦추는 것뿐이다.

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye } from 'lucide-react';

interface ResultCoverProps {
  /** 덮개 아래에 놓일 결과 */
  children: React.ReactNode;
  /** 덮개가 걷혔을 때 */
  onRevealed?: () => void;
  /** 덮개에 적을 문구 */
  label?: string;
}

export function ResultCover({ children, onRevealed, label = '결과 확인' }: ResultCoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => {
              setOpen(true);
              onRevealed?.();
            }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-100/95 text-sm font-semibold text-slate-600 backdrop-blur-[2px] transition-colors hover:bg-slate-200/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-300 dark:hover:bg-slate-700/95"
          >
            <Eye className="h-4 w-4" />
            {label}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
