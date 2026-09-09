import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker via CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  filename?: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ url, filename }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="pdf-viewer border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
          {filename || 'PDF 문서'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            title="축소"
          >
            －
          </button>
          <span className="text-xs text-slate-500 w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale(s => Math.min(2.5, s + 0.25))}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            title="확대"
          >
            ＋
          </button>
          <span className="text-xs text-slate-500 mx-2">|</span>
          <button
            type="button"
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-600 dark:text-slate-300"
          >
            ◀
          </button>
          <span className="text-xs text-slate-500">
            {pageNumber} / {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-600 dark:text-slate-300"
          >
            ▶
          </button>
          <a
            href={url}
            download={filename}
            className="ml-2 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs"
          >
            ⬇
          </a>
        </div>
      </div>

      {/* PDF content */}
      <div className="overflow-auto max-h-[600px] bg-slate-100 dark:bg-slate-900 flex justify-center p-4">
        {error ? (
          <div className="text-red-500 text-sm p-4">{error}</div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setLoading(false);
            }}
            onLoadError={() => {
              setError('PDF를 불러올 수 없습니다.');
              setLoading(false);
            }}
            loading={<div className="text-sm text-slate-400 py-8">PDF 로딩 중...</div>}
          >
            {!loading && <Page pageNumber={pageNumber} scale={scale} />}
          </Document>
        )}
      </div>
    </div>
  );
};
