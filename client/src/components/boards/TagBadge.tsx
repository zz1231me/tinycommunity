import React from 'react';
import { Tag } from '../../types/board.types';

interface TagBadgeProps {
  tag: Tag;
  onClick?: (tag: Tag) => void;
  onRemove?: (tagId: number) => void;
  size?: 'sm' | 'md';
}

// 유효한 CSS hex 색상값인지 검증 (3자리 또는 6자리 hex만 허용)
const isSafeColor = (color: string): boolean =>
  /^#[0-9a-fA-F]{3}$/.test(color) || /^#[0-9a-fA-F]{6}$/.test(color);

// 3자리 hex(#rgb)를 6자리(#rrggbb)로 정규화
const normalizeHex = (hex: string): string => {
  if (hex.length === 4) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
};

export const TagBadge: React.FC<TagBadgeProps> = ({ tag, onClick, onRemove, size = 'sm' }) => {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  const baseColor = isSafeColor(tag.color) ? normalizeHex(tag.color) : '#6366f1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass} cursor-default select-none`}
      style={{
        backgroundColor: baseColor + '20',
        color: baseColor,
        border: `1px solid ${baseColor}40`,
      }}
      onClick={
        onClick
          ? e => {
              e.stopPropagation();
              onClick(tag);
            }
          : undefined
      }
    >
      #{tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onRemove(tag.id);
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          aria-label={`${tag.name} 태그 제거`}
        >
          ×
        </button>
      )}
    </span>
  );
};
