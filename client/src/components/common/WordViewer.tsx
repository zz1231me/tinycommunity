import React, { useEffect, useState } from 'react';
import * as mammoth from 'mammoth/mammoth.browser';
import DOMPurify from 'dompurify';

interface WordViewerProps {
  url: string;
  filename?: string;
}

export const WordViewer: React.FC<WordViewerProps> = ({ url, filename }) => {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(url, { credentials: 'include' });
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) {
          setHtml(DOMPurify.sanitize(result.value));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('문서를 불러올 수 없습니다.');
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="word-viewer border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
          {filename || 'Word 문서'}
        </span>
        <a
          href={url}
          download={filename}
          className="text-xs px-2 py-1 rounded bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 transition-colors"
        >
          ⬇ 다운로드
        </a>
      </div>
      <div className="overflow-auto max-h-[600px] p-6 bg-white dark:bg-slate-900">
        {loading ? (
          <div className="text-sm text-slate-400 text-center py-8">문서 변환 중...</div>
        ) : error ? (
          <div className="text-red-500 text-sm">{error}</div>
        ) : (
          <div
            className="prose prose-slate dark:prose-invert max-w-none text-sm"
            // Content is sanitized with DOMPurify before being set
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
};
