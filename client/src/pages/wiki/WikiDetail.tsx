import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WikiPage } from '../../types/wiki.types';
import { sanitizeHTML } from '../../utils/htmlSanitizer';
import { formatDate } from '../../utils/date';
import { useContentImageHandler } from '../../hooks/useContentImageHandler';
import ImageViewer from '../../components/ImageViewer';
import { WikiHistory } from '../../components/wiki/WikiHistory';
import '../../styles/CKContentView.css';
import '../../styles/ContentImageStyles.css';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/atom-one-dark.min.css';

interface WikiDetailProps {
  page: WikiPage;
  allPages: WikiPage[];
  canEdit: boolean;
  onEdit: () => void;
  /** 특정 리비전 내용으로 현재 페이지를 복원 */
  onRestore?: (content: string) => void;
}

// WikiDetail renders sanitized HTML content from the wiki page.
// Content is processed through DOMPurify via sanitizeHTML before rendering.
export const WikiDetail: React.FC<WikiDetailProps> = ({
  page,
  allPages,
  canEdit,
  onEdit,
  onRestore,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const { imageViewer, closeImageViewer } = useContentImageHandler();
  const [showHistory, setShowHistory] = useState(false);

  // 페이지 이동 시 이력 패널 초기화 (버그 2 수정)
  useEffect(() => {
    setShowHistory(false);
  }, [page.slug]);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.querySelectorAll<HTMLElement>('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block);
    });
  }, [page.content]);

  // Build breadcrumb (visited set prevents infinite loop on circular parentId)
  const breadcrumb: WikiPage[] = [];
  const visited = new Set<number>();
  let current: WikiPage | undefined = page;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumb.unshift(current);
    current = allPages.find(p => p.id === current!.parentId);
  }

  // Child pages (하위 페이지)
  const childPages = allPages.filter(p => p.parentId === page.id);

  return (
    <>
      <ImageViewer
        isOpen={imageViewer.isOpen}
        onClose={closeImageViewer}
        imageUrl={imageViewer.imageUrl}
        altText={imageViewer.altText}
      />
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900">
        <div className="max-w-[var(--content-width-reading)] mx-auto px-6 py-8">
          {/* 브레드크럼 */}
          <nav className="flex items-center gap-1.5 text-sm mb-6 flex-wrap">
            {breadcrumb.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && (
                  <svg
                    className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
                <span
                  className={
                    i === breadcrumb.length - 1
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {p.title}
                </span>
              </React.Fragment>
            ))}
          </nav>

          {/* 제목 + 편집 버튼 */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white leading-tight">
              {page.title}
            </h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canEdit && (
                <button
                  onClick={() => setShowHistory(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors font-medium ${
                    showHistory
                      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  이력
                </button>
              )}
              {canEdit && (
                <button
                  onClick={onEdit}
                  className="btn-primary gap-1.5 px-4 py-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  편집
                </button>
              )}
            </div>
          </div>

          {/* 메타 정보 */}
          <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              마지막 수정: {formatDate(page.updatedAt, 'yyyy년 MM월 dd일')}
            </span>
            {!page.isPublished && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-medium">
                비공개
              </span>
            )}
          </div>

          {/* 본문 */}
          {page.content ? (
            <WikiContentRenderer content={page.content} contentRef={contentRef} />
          ) : (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">✏️</div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">내용이 없습니다.</p>
              {canEdit && (
                <button
                  onClick={onEdit}
                  className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  편집 버튼을 눌러 내용을 추가하세요
                </button>
              )}
            </div>
          )}

          {/* 편집 이력 */}
          {showHistory && canEdit && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              {/* key=updatedAt: 복원/편집으로 페이지가 바뀌면 이력 목록을 새로 불러온다 */}
              <WikiHistory
                key={page.updatedAt}
                slug={page.slug}
                currentContent={page.content}
                onRestore={onRestore}
              />
            </div>
          )}

          {/* 하위 페이지 */}
          {childPages.length > 0 && (
            <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
                하위 페이지
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {childPages.map(child => (
                  <Link
                    key={child.id}
                    to={`/dashboard/wiki/${child.slug}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all group"
                  >
                    <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-primary-600 dark:text-primary-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                      {child.title}
                    </span>
                    <svg
                      className="w-4 h-4 text-slate-400 ml-auto opacity-0 group-hover:opacity-100 transition-all"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Separate component for sanitized CKEditor HTML rendering
function WikiContentRenderer({
  content,
  contentRef,
}: {
  content: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const sanitized = sanitizeHTML(content);
  return (
    <div
      ref={contentRef}
      className="ck-content-view"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
