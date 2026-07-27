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
    const patch = Diff.createPatch('wiki-page', versionA.content, versionB.content, labelA, labelB);
    return diff2html(patch, {
      drawFileList: false,
      outputFormat: 'side-by-side',
      matching: 'lines',
    });
  }, [versionA.content, versionB.content, labelA, labelB]);

  return (
    <div className="wiki-diff-viewer text-sm overflow-auto">
      {/* diff2html generates library-controlled HTML, not user input */}
      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
    </div>
  );
};
