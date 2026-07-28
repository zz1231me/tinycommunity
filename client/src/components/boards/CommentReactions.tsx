import React, { useState, useRef, useEffect } from 'react';
import { EmojiPicker } from 'frimousse';
import { SmilePlus } from 'lucide-react';
import type { Comment } from '../../hooks/useCommentOperations';

interface CommentReactionsProps {
  comment: Comment;
  canReact: boolean;
  onToggle: (comment: Comment, emoji: string) => void;
}

// 자주 쓰는 빠른 리액션 — 외부 이모지 데이터 없이도 즉시 반응할 수 있게 항상 제공
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👏', '🙏'];

export const CommentReactions: React.FC<CommentReactionsProps> = ({
  comment,
  canReact,
  onToggle,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const reactions = comment.reactions ?? [];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {reactions.map(r => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(comment, r.emoji)}
          disabled={!canReact}
          aria-pressed={r.reactedByMe}
          title={canReact ? (r.reactedByMe ? '반응 취소' : '나도 반응') : '로그인이 필요합니다'}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors disabled:cursor-not-allowed ${
            r.reactedByMe
              ? 'bg-secondary-50 border-secondary-300 text-secondary-700 dark:bg-secondary-900/30 dark:border-secondary-700 dark:text-secondary-300'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
          }`}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}

      {canReact && (
        <div className="relative" ref={wrapRef}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label="이모지 반응 추가"
            title="이모지 반응 추가"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-slate-600 hover:border-slate-300 dark:hover:text-slate-200 dark:hover:border-slate-500 transition-colors"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>

          {open && (
            <div className="absolute z-30 mt-1 left-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl overflow-hidden">
              {/* 빠른 리액션 바 — 오프라인에서도 동작 */}
              <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-100 dark:border-slate-700">
                {QUICK_EMOJIS.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onToggle(comment, e);
                      setOpen(false);
                    }}
                    className="w-7 h-7 rounded-lg text-base leading-none hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
              {/* 전체 이모지 검색 (frimousse) */}
              <EmojiPicker.Root
                onEmojiSelect={({ emoji }) => {
                  onToggle(comment, emoji);
                  setOpen(false);
                }}
                className="frimousse-picker"
              >
                <EmojiPicker.Search className="frimousse-search" placeholder="이모지 검색..." />
                <EmojiPicker.Viewport className="frimousse-viewport">
                  <EmojiPicker.Loading className="frimousse-hint">불러오는 중…</EmojiPicker.Loading>
                  <EmojiPicker.Empty className="frimousse-hint">결과가 없습니다.</EmojiPicker.Empty>
                  <EmojiPicker.List className="frimousse-list" />
                </EmojiPicker.Viewport>
              </EmojiPicker.Root>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
