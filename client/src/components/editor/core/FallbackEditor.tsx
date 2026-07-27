// client/src/components/editor/FallbackEditor.tsx
// CKEditor 5 대체용 임시 에디터

import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { sanitizeHTML } from '../../../utils/htmlSanitizer';

interface FallbackEditorProps {
  onImageUpload: (blob: Blob, callback: (url: string, alt?: string) => void) => void;
  initialContent?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
}

// Toast UI Editor와 호환되는 인터페이스
export interface FallbackEditorRef {
  getInstance: () => {
    getMarkdown: () => string;
    setMarkdown: (content: string) => void;
    getHTML: () => string;
    setHTML: (content: string) => void;
    focus: () => void;
  };
}

const FallbackEditor = forwardRef<FallbackEditorRef, FallbackEditorProps>((props, ref) => {
  const { initialContent = '', onChange, placeholder = '내용을 입력하세요...' } = props;
  const [content, setContent] = useState(initialContent);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Toast UI Editor 호환 메서드 제공
  useImperativeHandle(ref, () => ({
    getInstance: () => ({
      getMarkdown: () => content,
      setMarkdown: (markdownContent: string) => setContent(markdownContent),
      getHTML: () => markdownToHtml(content),
      getContent: () => markdownToHtml(content),
      setHTML: (htmlContent: string) => setContent(htmlToMarkdown(htmlContent)),
      focus: () => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      },
    }),
  }));

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    if (onChange) {
      onChange(newContent);
    }
  };

  // 간단한 마크다운 버튼들
  const insertMarkdown = (before: string, after: string = '') => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const newContent =
      content.substring(0, start) + before + selectedText + after + content.substring(end);

    setContent(newContent);
    if (onChange) {
      onChange(newContent);
    }

    // 커서 위치 조정
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 0);
  };

  return (
    <div className="space-y-3 w-full">
      <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">내용</label>

      {/* 마크다운 툴바 */}
      <div className="flex flex-wrap gap-2 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-t-lg">
        <button
          type="button"
          onClick={() => insertMarkdown('**', '**')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="굵게"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('*', '*')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="기울임"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('# ')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="제목 1"
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('## ')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="제목 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('- ')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="목록"
        >
          •
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('[', '](url)')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="링크"
        >
          🔗
        </button>
        <button
          type="button"
          onClick={() => insertMarkdown('`', '`')}
          className="px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-600"
          title="코드"
        >
          &lt;/&gt;
        </button>
      </div>

      {/* 텍스트 영역 */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-b-lg overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          className="w-full h-96 p-4 border-none resize-none focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          placeholder={`${placeholder}

📝 마크다운 지원:
# 제목 1
## 제목 2
**굵은 글씨**
*기울임 글씨*
- 목록
[링크](url)
\`코드\``}
        />
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p>⚠️ **임시 에디터** - CKEditor 5 로딩 실패 시 사용</p>
        <p>📝 마크다운 문법 지원 | 툴바 버튼으로 빠른 입력</p>
      </div>
    </div>
  );
});

FallbackEditor.displayName = 'FallbackEditor';

// 간단한 변환 함수들
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  // ⚠️ link 변환에서 href는 안전 스킴만 허용 — javascript:/data:/vbscript: 등 XSS 차단.
  //    최종 출력도 sanitizeHTML(DOMPurify)로 통과시켜 사용자 입력에 포함된 <script> 등 차단.
  const SAFE_URL = /^(https?:\/\/|mailto:|\/|#)/i;
  const rawHtml = markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
      const safe = SAFE_URL.test(String(href).trim()) ? String(href).trim() : '#';
      return `<a href="${safe}">${label}</a>`;
    })
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  return sanitizeHTML(rawHtml);
}

function htmlToMarkdown(html: string): string {
  if (!html) return '';

  return html
    .replace(/<h1>(.*?)<\/h1>/g, '# $1')
    .replace(/<h2>(.*?)<\/h2>/g, '## $1')
    .replace(/<h3>(.*?)<\/h3>/g, '### $1')
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
    .replace(/<li>(.*?)<\/li>/g, '- $1')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]*>/g, '');
}

export default FallbackEditor;
