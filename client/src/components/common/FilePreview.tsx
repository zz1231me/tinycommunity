import React, { useState, Suspense } from 'react';
import { lazyWithRetry as lazy } from '../../utils/lazyWithRetry';

// 무거운 미리보기 뷰어(react-pdf/pdf.js, mammoth)는 '미리보기' 클릭 시에만 로드한다.
// 정적 import 시 게시글 조회 페이지 번들에 ~900KB가 항상 포함되므로 lazy로 코드 분할.
const PdfViewer = lazy(() => import('./PdfViewer').then(m => ({ default: m.PdfViewer })));
const WordViewer = lazy(() => import('./WordViewer').then(m => ({ default: m.WordViewer })));

interface AttachmentInfo {
  url: string;
  originalName: string;
  storedName: string;
  size?: number;
  mimeType?: string;
}

interface FilePreviewProps {
  attachment: AttachmentInfo;
}

function canPreview(
  mimeType: string | undefined,
  filename: string
): 'pdf' | 'word' | 'image' | 'none' {
  if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    filename.toLowerCase().endsWith('.docx') ||
    filename.toLowerCase().endsWith('.doc')
  )
    return 'word';
  if (mimeType?.startsWith('image/')) return 'image';
  return 'none';
}

export const FilePreview: React.FC<FilePreviewProps> = ({ attachment }) => {
  const [expanded, setExpanded] = useState(false);
  // 썸네일이 없는 첨부(이미지가 아니거나 손상)에는 서버가 404를 주므로 원본으로 폴백한다.
  const [thumbFailed, setThumbFailed] = useState(false);
  const previewType = canPreview(attachment.mimeType, attachment.originalName);
  const downloadUrl = attachment.url;
  const thumbUrl = `/api/uploads/thumb/${encodeURIComponent(attachment.storedName)}`;

  return (
    <div>
      {previewType !== 'none' && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors ml-2"
        >
          {expanded ? '접기' : '미리보기'}
        </button>
      )}

      {expanded && (
        <div className="mt-2 border-t border-slate-200 dark:border-slate-700">
          <Suspense fallback={<div className="p-4 text-sm text-slate-500">미리보기 로딩 중…</div>}>
            {previewType === 'pdf' && (
              <PdfViewer url={downloadUrl} filename={attachment.originalName} />
            )}
            {previewType === 'word' && (
              <WordViewer url={downloadUrl} filename={attachment.originalName} />
            )}
          </Suspense>
          {previewType === 'image' && (
            <div className="p-4 bg-slate-900 flex justify-center">
              {/* 미리보기는 축소된 썸네일이면 충분하다 — 원본(수 MB)을 받지 않는다.
                  원본은 이미지를 클릭해 뷰어를 열 때만 로드된다. */}
              <img
                src={thumbFailed ? downloadUrl : thumbUrl}
                onError={() => setThumbFailed(true)}
                alt={attachment.originalName}
                loading="lazy"
                className="max-h-[500px] max-w-full object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
