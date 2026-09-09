// client/src/components/discovery/TagCloud.tsx
// 태그를 "쓰인 만큼" 크게 보여준다 — 어떤 주제가 살아 있는지 한눈에 보이게 하는 것이
// 태그 클라우드의 목적이고, 크기 차이가 없으면 그냥 태그 목록이다.

import { DEFAULT_TAG_COLOR } from '../../constants/colors';
import type { CloudTag } from '../../api/discovery';

interface Props {
  tags: CloudTag[];
  selectedId: number | null;
  onSelect: (tagId: number | null) => void;
}

const isSafeColor = (color: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(color) ||
  /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color) ||
  /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/.test(color);

/** 글 수를 4단계 글씨 크기로 — 최다 태그만 튀지 않도록 최댓값 기준 상대 비율로 나눈다 */
function sizeClass(count: number, max: number): string {
  if (max <= 0) return 'text-xs';
  const ratio = count / max;
  if (ratio > 0.75) return 'text-lg';
  if (ratio > 0.5) return 'text-base';
  if (ratio > 0.25) return 'text-sm';
  return 'text-xs';
}

export function TagCloud({ tags, selectedId, onSelect }: Props) {
  if (tags.length === 0) {
    return (
      <p className="px-1 py-4 text-sm text-slate-500 dark:text-slate-400">
        아직 글에 붙은 태그가 없습니다.
      </p>
    );
  }

  const max = Math.max(...tags.map(t => t.postCount));

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      {tags.map(tag => {
        const color = isSafeColor(tag.color) ? tag.color : DEFAULT_TAG_COLOR;
        const selected = selectedId === tag.id;
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : tag.id)}
            className={`rounded-full px-3 py-1 font-medium transition-all hover:brightness-95 ${sizeClass(
              tag.postCount,
              max
            )}`}
            style={{
              backgroundColor: selected ? color : `${color}20`,
              color: selected ? '#fff' : color,
              border: `1px solid ${color}${selected ? '' : '40'}`,
            }}
          >
            #{tag.name}
            <span className="ml-1.5 text-[0.75em] opacity-70">{tag.postCount}</span>
          </button>
        );
      })}
    </div>
  );
}
