// WikiDiffViewer: renders diff2html output, which is library-generated HTML from text diffs.
// diff2html output is trusted (not user-supplied HTML), so dangerouslySetInnerHTML is safe here.
import React, { useMemo } from 'react';
import * as Diff from 'diff';
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';

interface WikiVersion {
  content: string;
  editedBy: string | null;
  editedAt: string;
}

// 위키 콘텐츠는 에디터가 만든 (대개 한 줄짜리) HTML이라, 그대로 line-diff하면 "한 줄 전체 변경"으로만 보인다.
// 블록 요소를 줄바꿈으로 바꾸고 태그를 제거해 '읽히는 텍스트'로 변환한 뒤 diff하면 실제 변경 지점이 드러난다.
function htmlToReadableText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre|table|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '') // 나머지 태그 제거
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface WikiDiffViewerProps {
  versionA: WikiVersion;
  versionB: WikiVersion;
  labelA?: string;
  labelB?: string;
}

export const WikiDiffViewer: React.FC<WikiDiffViewerProps> = ({
  versionA,
  versionB,
  labelA = '이전 버전',
  labelB = '현재 버전',
}) => {
  const diffHtml = useMemo(() => {
    // 원문 HTML 대신 '읽히는 텍스트'로 변환해 diff → 실제 변경된 문장/줄이 드러난다.
    const textA = htmlToReadableText(versionA.content);
    const textB = htmlToReadableText(versionB.content);
    const patch = Diff.createPatch('wiki-page', textA, textB, labelA, labelB);
    return diff2html(patch, {
      drawFileList: false,
      outputFormat: 'side-by-side',
      matching: 'words',
    });
  }, [versionA.content, versionB.content, labelA, labelB]);

  return (
    <div className="wiki-diff-viewer text-sm max-h-[70vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
      {/* diff2html generates library-controlled HTML, not user input */}
      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
    </div>
  );
};
