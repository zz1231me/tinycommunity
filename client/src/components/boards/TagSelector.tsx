import React, { useState, useEffect } from 'react';
import { Tag } from '../../types/board.types';
import { TagBadge } from './TagBadge';
import { getTags } from '../../api/tags';

interface TagSelectorProps {
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
  boardId?: string;
}

export const TagSelector: React.FC<TagSelectorProps> = ({ selectedTags, onChange, boardId }) => {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
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

  const filteredTags = allTags.filter(
    t =>
      t.name.toLowerCase().includes(search.toLowerCase()) && !selectedTags.find(s => s.id === t.id)
  );

  const addTag = (tag: Tag) => {
    onChange([...selectedTags, tag]);
    setSearch('');
  };

  const removeTag = (tagId: number) => {
    onChange(selectedTags.filter(t => t.id !== tagId));
  };

  if (loadError) {
    return (
      <div className="px-3 py-2 text-xs text-red-500 dark:text-red-400 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700">
        태그를 불러오지 못했습니다.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 min-h-[42px] cursor-text"
        onClick={() => setIsOpen(true)}
      >
        {selectedTags.map(tag => (
          <TagBadge key={tag.id} tag={tag} onRemove={removeTag} />
        ))}
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder={selectedTags.length === 0 ? '태그 선택...' : ''}
          className="flex-1 min-w-24 text-sm bg-transparent border-none outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400"
        />
      </div>
      {isOpen && filteredTags.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredTags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={() => addTag(tag)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <TagBadge tag={tag} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
