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
      </div>
      {/* 번들 페이지는 URL 서빙(상대경로 자산 로드), 단일 HTML은 srcDoc.
          ★두 경우 모두 allow-same-origin 제외 = 앱과 격리(쿠키/DOM 접근 불가). */}
      {page.isBundle && slug ? (
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
