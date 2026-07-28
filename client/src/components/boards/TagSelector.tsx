import React, { useState, useEffect } from 'react';
import { Tag } from '../../types/board.types';
import { getTags } from '../../api/tags';
import { DEFAULT_TAG_COLOR } from '../../constants/colors';

interface TagSelectorProps {
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
  boardId?: string;
}

const dotColor = (c?: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c! : DEFAULT_TAG_COLOR);

export const TagSelector: React.FC<TagSelectorProps> = ({ selectedTags, onChange, boardId }) => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    getTags(boardId ?? null, controller.signal)
      .then(setAllTags)
      .catch(err => {
        if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') {
          setLoadError(true);
        }
      });
    return () => controller.abort();
  }, [boardId]);

  const isSelected = (id: number) => selectedTags.some(t => t.id === id);

  const toggle = (tag: Tag) => {
    if (isSelected(tag.id)) {
      onChange(selectedTags.filter(t => t.id !== tag.id));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  const shown = search
    ? allTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : allTags;

  if (loadError) {
    return (
      <div className="px-3 py-2 text-xs text-red-500 dark:text-red-400 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700">
        태그를 불러오지 못했습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 태그가 많을 때만 검색 */}
      {allTags.length > 12 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="태그 검색..."
          className="input py-1.5 text-sm"
        />
      )}

      {allTags.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-1">등록된 태그가 없습니다.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-1">검색 결과가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map(tag => {
            const active = isSelected(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all active:scale-[0.97] ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: dotColor(tag.color) }}
                />
                {tag.name}
                {active && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedTags.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">{selectedTags.length}개 선택됨</p>
      )}
    </div>
  );
};
