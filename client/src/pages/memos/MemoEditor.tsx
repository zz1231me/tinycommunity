import React, { useState, useEffect, useRef } from 'react';
import { Memo, MemoColor } from '../../types/memo.types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const COLORS: { value: MemoColor; label: string; class: string }[] = [
  { value: 'yellow', label: '노랑', class: 'bg-yellow-300' },
  { value: 'green', label: '초록', class: 'bg-green-300' },
  { value: 'blue', label: '파랑', class: 'bg-blue-300' },
  { value: 'pink', label: '분홍', class: 'bg-pink-300' },
  { value: 'purple', label: '보라', class: 'bg-purple-300' },
];

interface MemoEditorProps {
  memo: Memo | null;
  onSave: (data: { title: string; content: string; color: MemoColor }) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export const MemoEditor: React.FC<MemoEditorProps> = ({
  memo,
  onSave,
  onClose,
  isSaving = false,
}) => {
  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [color, setColor] = useState<MemoColor>(memo?.color || 'yellow');

  useEffect(() => {
    setTitle(memo?.title || '');
    setContent(memo?.content || '');
    setColor(memo?.color || 'yellow');
  }, [memo]);

  // ESC 로 닫고, 열려 있는 동안 포커스를 안에 가둔다. 부모가 열 때만 그리므로 항상 켠다.
  // 첫 포커스는 제목 칸으로 준다 — 안쪽 첫 요소는 색상 단추라, 그냥 두면 글을 쓰러
  // 연 사람이 색상 단추에서 시작하게 된다.
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useFocusTrap(panelRef, onClose, true, titleRef);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, content, color });
  };

  return (
    <div
      className="fixed inset-0 modal-scrim flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={memo ? '메모 수정' : '새 메모'}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <form
          onSubmit={handleSubmit}
          onKeyDown={e => {
            // 단일 라인 input(제목)에서 Enter로 메모가 조기 저장되는 것 방지
            // (본문 textarea의 줄바꿈과 명시적 저장 버튼은 그대로 동작)
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault();
            }
          }}
          className="p-6 space-y-4"
        >
          <h2 className="card-title">{memo ? '메모 수정' : '새 메모'}</h2>

          {/* Color selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400 mr-1">색상:</span>
            {COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`w-7 h-7 rounded-full ${c.class} transition-transform ${color === c.value ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'}`}
                title={c.label}
                aria-label={c.label}
              />
            ))}
          </div>

          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목 (선택사항)"
            className="input"
            maxLength={200}
          />

          {/* Content */}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용을 입력하세요..."
            className="input resize-none"
            rows={6}
            maxLength={10000}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              취소
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary">
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
