// 위키·게시글 수정 이력의 두 버전을 비교해 보여준다.
// diff2html 출력은 라이브러리가 만든 HTML 이라 dangerouslySetInnerHTML 을 쓴다.
import React, { useMemo } from 'react';
import * as Diff from 'diff';
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import './ContentDiffViewer.css';

// 에디터 HTML 은 대개 한 줄이라 그대로 line-diff 하면 전체 변경으로 보인다.
// 블록 요소를 줄바꿈으로 바꾸고 태그를 제거한 뒤 diff 한다.
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

interface ContentDiffViewerProps {
  /** 이전 버전 본문(HTML) */
  contentA: string;
  /** 비교 대상 본문(HTML) */
  contentB: string;
  labelA?: string;
  labelB?: string;
}

export const ContentDiffViewer: React.FC<ContentDiffViewerProps> = ({
  contentA,
  contentB,
  labelA = '이전 버전',
  labelB = '현재 버전',
}) => {
  const diffHtml = useMemo(() => {
    // 원문 HTML 대신 읽히는 텍스트로 변환해 diff 한다
    const textA = htmlToReadableText(contentA);
    const textB = htmlToReadableText(contentB);
    const patch = Diff.createPatch('content', textA, textB, labelA, labelB);
    return diff2html(patch, {
      drawFileList: false,
      outputFormat: 'side-by-side',
      matching: 'words',
    });
  }, [contentA, contentB, labelA, labelB]);

  return (
    <div className="content-diff-viewer text-sm max-h-[70vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
      {/* diff2html 이 만든 HTML 이며 사용자 입력이 아니다 */}
      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
    </div>
  );
};
