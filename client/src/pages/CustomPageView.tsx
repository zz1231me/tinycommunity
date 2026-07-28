// client/src/pages/CustomPageView.tsx
// 관리자 커스텀 HTML 페이지 렌더. ★sandbox iframe으로 앱과 완전 격리.
// allow-same-origin을 주지 않으므로 iframe 안 스크립트는 앱의 쿠키/localStorage/DOM에 접근 불가.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPageBySlug, type CustomPage } from '../api/customPages';
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
      <iframe
        title={page.title}
        srcDoc={page.html}
        // ★allow-same-origin 제외 = 앱과 격리(쿠키/DOM 접근 불가). 스크립트·폼·팝업은 허용.
        sandbox="allow-scripts allow-popups allow-forms allow-modals allow-downloads"
        className="h-full w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
