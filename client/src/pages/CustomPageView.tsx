// client/src/pages/CustomPageView.tsx
// 관리자 커스텀 HTML 페이지 렌더. ★sandbox iframe으로 앱과 완전 격리.
// allow-same-origin을 주지 않으므로 iframe 안 스크립트는 앱의 쿠키/localStorage/DOM에 접근 불가.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPageBySlug, bundleEntryUrl, type CustomPage } from '../api/customPages';
import { LoadingSpinner } from '../components/common/LoadingStates';

export default function CustomPageView() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CustomPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchPageBySlug(slug)
      .then(p => {
        if (alive) setPage(p);
      })
      .catch(() => {
        if (alive) setError('페이지를 찾을 수 없습니다.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="md" message="불러오는 중..." />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
        <p className="text-lg font-semibold">{error || '페이지를 찾을 수 없습니다.'}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900">
      {/* 제목바 */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white/80 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <svg
          className="h-5 w-5 text-slate-400"
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
        <h1 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
          {page.title}
        </h1>
        {/* 외부 URL 페이지 — 임베드가 차단(X-Frame-Options)될 수 있어 새 탭 열기 폴백 제공 */}
        {page.externalUrl && (
          <a
            href={page.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-secondary-600 hover:bg-secondary-50 dark:text-secondary-400 dark:hover:bg-secondary-900/20"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            새 탭에서 열기
          </a>
        )}
      </div>
      {/* 렌더 우선순위: 외부 URL > 번들 > 단일 HTML.
          - 외부 URL: 크로스오리진 iframe이라 브라우저 동일출처정책이 앱과 자동 격리(외부 사이트는 자기
            오리진에서 실행 → 앱 쿠키/DOM 접근 불가). allow-same-origin은 "그 사이트 자신" 기준이라 안전.
          - 번들/HTML: allow-same-origin 제외로 앱과 격리. */}
      {page.externalUrl ? (
        <iframe
          title={page.title}
          src={page.externalUrl}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
          referrerPolicy="no-referrer"
          className="w-full flex-1 border-0 bg-white"
        />
      ) : page.isBundle && slug ? (
        <iframe
          title={page.title}
          src={bundleEntryUrl(slug, page.entryFile)}
          sandbox="allow-scripts allow-popups allow-forms allow-modals allow-downloads"
          className="w-full flex-1 border-0 bg-white"
        />
      ) : (
        <iframe
          title={page.title}
          srcDoc={page.html}
          sandbox="allow-scripts allow-popups allow-forms allow-modals allow-downloads"
          className="w-full flex-1 border-0 bg-white"
        />
      )}
    </div>
  );
}
