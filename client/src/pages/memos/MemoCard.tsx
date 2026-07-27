import React from 'react';
import { Memo } from '../../types/memo.types';
import { formatDate } from '../../utils/date';

const COLOR_STYLES: Record<string, string> = {
  yellow: 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700',
  green: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700',
  blue: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700',
  pink: 'bg-pink-100 dark:bg-pink-900/40 border-pink-300 dark:border-pink-700',
  purple: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700',
};

interface MemoCardProps {
  memo: Memo;
  onEdit: (memo: Memo) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number, isPinned: boolean) => void;
  isPinning?: boolean;
}

export const MemoCard: React.FC<MemoCardProps> = ({
  memo,
  onEdit,
  onDelete,
  onTogglePin,
  isPinning = false,
}) => {
  const colorClass = COLOR_STYLES[memo.color] || COLOR_STYLES.yellow;

  return (
    <div
      className={`relative p-4 rounded-lg border-2 shadow-sm cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-md ${colorClass}`}
      onClick={() => onEdit(memo)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(memo);
        }
      }}
      aria-label="메모 편집"
    >
      {/* Pin button */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onTogglePin(memo.id, !memo.isPinned);
        }}
        disabled={isPinning}
        className={`absolute top-2 right-2 text-lg transition-opacity disabled:cursor-not-allowed ${memo.isPinned ? 'opacity-100' : 'opacity-30 hover:opacity-70'} ${isPinning ? 'animate-pulse' : ''}`}
        title={memo.isPinned ? '고정 해제' : '고정'}
        aria-label={memo.isPinned ? '고정 해제' : '고정'}
      >
        📌
      </button>

      {/* Title */}
      {memo.title && (
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-2 pr-6 line-clamp-1">
          {memo.title}
        </h3>
      )}

      {/* Content */}
      <p className="text-slate-700 dark:text-slate-200 text-xs whitespace-pre-wrap line-clamp-4 min-h-[2rem]">
        {memo.content || <span className="italic opacity-50">내용 없음</span>}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/10 dark:border-white/10">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatDate(memo.updatedAt, 'MM월 dd일')}
        </span>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onDelete(memo.id);
          }}
          className="text-xs text-red-400 hover:text-red-600 transition-colors opacity-60 hover:opacity-100"
          aria-label="메모 삭제"
        >
          삭제
        </button>
      </div>
    </div>
  );
};
