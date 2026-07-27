import React, { useState } from 'react';
import { WikiPage } from '../../types/wiki.types';
import { Link, useParams } from 'react-router-dom';

interface WikiSidebarProps {
  pages: WikiPage[];
  isEditing?: boolean;
  onInterceptNav?: (slug: string | null) => void; // null = 홈
}

// Build tree from flat array
function buildTree(pages: WikiPage[]): WikiPage[] {
  const map = new Map<number, WikiPage & { children: WikiPage[] }>();
  const roots: WikiPage[] = [];

  pages.forEach(p => map.set(p.id, { ...p, children: [] }));
  pages.forEach(p => {
    if (p.parentId && map.has(p.parentId)) {
      map.get(p.parentId)!.children!.push(map.get(p.id)!);
    } else {
      roots.push(map.get(p.id)!);
    }
  });
  return roots;
}

const MAX_WIKI_DEPTH = 10;

interface WikiTreeNodeProps {
  page: WikiPage & { children?: WikiPage[] };
  currentSlug?: string;
  depth: number;
  isEditing?: boolean;
  onInterceptNav?: (slug: string | null) => void;
}

const WikiTreeNode: React.FC<WikiTreeNodeProps> = ({
  page,
  currentSlug,
  depth,
  isEditing,
  onInterceptNav,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = page.children && page.children.length > 0;
  const isActive = page.slug === currentSlug;

  if (depth > MAX_WIKI_DEPTH) return null;

  const handleLinkClick = (e: React.MouseEvent) => {
    if (isEditing && !isActive && onInterceptNav) {
      e.preventDefault();
      onInterceptNav(page.slug);
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1.5 px-2 rounded-lg transition-all duration-150 ${
          isActive
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
            : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setIsOpen(o => !o)}
            className={`w-4 h-4 flex-shrink-0 flex items-center justify-center rounded transition-colors ${
              isActive
                ? 'text-primary-500'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0 flex items-center justify-center">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            />
          </span>
        )}
        <Link
          to={`/dashboard/wiki/${page.slug}`}
          onClick={handleLinkClick}
          className={`text-sm truncate flex-1 leading-tight py-0.5 ${
            isActive ? 'font-semibold text-primary-700 dark:text-primary-300' : ''
          }`}
        >
          {page.title}
        </Link>
      </div>
      {hasChildren && isOpen && (
        <div className="relative">
          {(page.children || []).map(child => (
            <WikiTreeNode
              key={child.id}
              page={child as WikiPage & { children?: WikiPage[] }}
              currentSlug={currentSlug}
              depth={depth + 1}
              isEditing={isEditing}
              onInterceptNav={onInterceptNav}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const WikiSidebar: React.FC<WikiSidebarProps> = ({ pages, isEditing, onInterceptNav }) => {
  const { slug } = useParams<{ slug?: string }>();
  const tree = buildTree(pages);

  const handleHomeClick = (e: React.MouseEvent) => {
    if (isEditing && onInterceptNav) {
      e.preventDefault();
      onInterceptNav(null);
    }
  };

  return (
    <div className="w-60 flex-shrink-0 bg-slate-50 dark:bg-slate-800/60 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
      {/* 사이드바 헤더 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-100 dark:bg-primary-900/40 rounded-md flex items-center justify-center">
              <svg
                className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              위키
            </h2>
          </div>
          <Link
            to="/dashboard/wiki"
            onClick={handleHomeClick}
            className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            홈
          </Link>
        </div>
      </div>

      {/* 페이지 트리 */}
      <div className="flex-1 overflow-y-auto p-2">
        {tree.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-xs text-slate-400 dark:text-slate-500">페이지가 없습니다.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              새 페이지를 만들어보세요!
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map(page => (
              <WikiTreeNode
                key={page.id}
                page={page as WikiPage & { children?: WikiPage[] }}
                currentSlug={slug}
                depth={0}
                isEditing={isEditing}
                onInterceptNav={onInterceptNav}
              />
            ))}
          </div>
        )}
      </div>

      {/* 하단 페이지 수 */}
      {pages.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            총 {pages.length}개 페이지
          </p>
        </div>
      )}
    </div>
  );
};
