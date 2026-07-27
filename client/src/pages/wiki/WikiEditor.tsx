import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  ClassicEditor,
  Alignment,
  AutoLink,
  BlockQuote,
  Bold,
  Code,
  CodeBlock,
  Essentials,
  FindAndReplace,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  Heading,
  Highlight,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  List,
  ListProperties,
  PageBreak,
  Paragraph,
  PasteFromOffice,
  RemoveFormat,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  Underline,
  WordCount,
  type EditorConfig,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import '../../components/editor/core/CKEditorOverride.css';
import koTranslations from 'ckeditor5/translations/ko.js';
import { WikiPage } from '../../types/wiki.types';

// Module-level ref for upload function (avoids stale closure in CKEditor plugin)
type WikiUploadFn = (
  blob: Blob,
  callback: (url: string, alt?: string) => void,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (e: { loaded: number; total: number }) => void;
  }
) => Promise<void> | void;

const wikiUploadFnRef = {
  current: null as WikiUploadFn | null,
};

class WikiUploadAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loader: any;
  private controller = new AbortController();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(loader: any) {
    this.loader = loader;
  }
  upload(): Promise<{ default: string }> {
    return this.loader.file.then(
      (file: File) =>
        new Promise<{ default: string }>((resolve, reject) => {
          const fn = wikiUploadFnRef.current;
          if (!fn) {
            reject(new Error('이미지 업로드 핸들러가 설정되지 않았습니다.'));
            return;
          }
          let settled = false;
          const result = fn(
            file,
            (url: string) => {
              settled = true;
              resolve({ default: url });
            },
            {
              signal: this.controller.signal,
              onProgress: ({ loaded, total }) => {
                this.loader.uploadTotal = total;
                this.loader.uploaded = loaded;
              },
            }
          );
          if (result && typeof (result as Promise<void>).catch === 'function') {
            (result as Promise<void>).catch(err => {
              if (!settled) reject(err);
            });
          }
        })
    );
  }
  abort() {
    this.controller.abort();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WikiUploadAdapterPlugin(editor: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.plugins.get('FileRepository').createUploadAdapter = (loader: any) =>
    new WikiUploadAdapter(loader);
}

// Module-level constants to prevent recreation on every render
// FileRepository is auto-included as a dependency of ImageUpload — do NOT add explicitly
const WIKI_PLUGINS = [
  Essentials,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Subscript,
  Superscript,
  Alignment,
  Highlight,
  Link,
  AutoLink,
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  List,
  ListProperties,
  BlockQuote,
  CodeBlock,
  HorizontalLine,
  PageBreak,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Table,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  FontColor,
  FontBackgroundColor,
  FontSize,
  FontFamily,
  PasteFromOffice,
  FindAndReplace,
  Indent,
  IndentBlock,
  RemoveFormat,
  WordCount,
];

const WIKI_TOOLBAR_ITEMS = [
  'undo',
  'redo',
  '|',
  'heading',
  '|',
  'fontFamily',
  'fontSize',
  '|',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  '|',
  'fontColor',
  'fontBackgroundColor',
  'highlight',
  '|',
  'subscript',
  'superscript',
  '|',
  'alignment',
  '|',
  'bulletedList',
  'numberedList',
  '|',
  'outdent',
  'indent',
  '|',
  'blockQuote',
  'codeBlock',
  '|',
  'link',
  'uploadImage',
  'insertTable',
  '|',
  'specialCharacters',
  'horizontalLine',
  'pageBreak',
  '|',
  'removeFormat',
  'findAndReplace',
];

const WIKI_LINK_CONFIG = {
  defaultProtocol: 'https://',
  addTargetToExternalLinks: true,
  decorators: {
    isExternal: {
      mode: 'automatic' as const,
      callback: (url: string | null) => url !== null && /^(https?:)?\/\//.test(url),
      attributes: { target: '_blank', rel: 'noopener noreferrer' },
    },
  },
};

interface WikiEditorProps {
  page?: WikiPage | null;
  allPages: WikiPage[];
  onSave: (data: {
    slug: string;
    title: string;
    content: string;
    parentId: number | null;
    isPublished: boolean;
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
  onImageUpload?: WikiUploadFn;
}

export const WikiEditor: React.FC<WikiEditorProps> = ({
  page,
  allPages,
  onSave,
  onCancel,
  isSaving = false,
  onImageUpload,
}) => {
  const [title, setTitle] = useState(page?.title || '');
  const [slug, setSlug] = useState(page?.slug || '');
  const [content, setContent] = useState(page?.content || '');
  const [parentId, setParentId] = useState<number | null>(page?.parentId ?? null);
  const [isPublished, setIsPublished] = useState(page?.isPublished !== false);
  const [slugManual, setSlugManual] = useState(!!page);
  const [charCount, setCharCount] = useState(0);

  const handleWordCount = useCallback((stats: { characters: number; words: number }) => {
    setCharCount(stats.characters);
  }, []);

  // Keep module-level ref current for the upload adapter
  useEffect(() => {
    wikiUploadFnRef.current = onImageUpload ?? null;
  }, [onImageUpload]);

  const slugError = useMemo(() => {
    if (!slug) return '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return '슬러그는 소문자 영문, 숫자, 하이픈(-)만 사용 가능하며 하이픈으로 시작하거나 끝날 수 없습니다.';
    }
    return '';
  }, [slug]);

  useEffect(() => {
    if (!slugManual && title) {
      // 한국어 포함 비영숫자 문자는 모두 하이픈으로 치환 (슬러그는 [a-z0-9-]만 허용)
      const generated = title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(generated || `page-${Date.now()}`);
    }
  }, [title, slugManual]);

  const editorConfig = useMemo<EditorConfig>(
    () => ({
      licenseKey: 'GPL',
      translations: [koTranslations],
      plugins: WIKI_PLUGINS,
      extraPlugins: [WikiUploadAdapterPlugin],
      toolbar: {
        items: WIKI_TOOLBAR_ITEMS,
        shouldNotGroupWhenFull: true,
      },
      image: {
        toolbar: [
          'imageStyle:inline',
          'imageStyle:wrapText',
          'imageStyle:breakText',
          '|',
          'toggleImageCaption',
          'imageTextAlternative',
          '|',
          'resizeImage',
        ],
      },
      heading: {
        options: [
          { model: 'paragraph', title: '본문', class: 'ck-heading_paragraph' },
          { model: 'heading1', view: 'h1', title: '제목 1', class: 'ck-heading_heading1' },
          { model: 'heading2', view: 'h2', title: '제목 2', class: 'ck-heading_heading2' },
          { model: 'heading3', view: 'h3', title: '제목 3', class: 'ck-heading_heading3' },
          { model: 'heading4', view: 'h4', title: '제목 4', class: 'ck-heading_heading4' },
          { model: 'heading5', view: 'h5', title: '제목 5', class: 'ck-heading_heading5' },
        ],
      },
      table: {
        contentToolbar: [
          'tableColumn',
          'tableRow',
          'mergeTableCells',
          'tableProperties',
          'tableCellProperties',
        ],
      },
      fontFamily: {
        options: [
          'default',
          'Pretendard Variable, Pretendard, sans-serif',
          '맑은 고딕, Malgun Gothic, sans-serif',
          '나눔고딕, NanumGothic, sans-serif',
          '나눔명조, NanumMyeongjo, serif',
          'Arial, sans-serif',
          'Georgia, serif',
          'Courier New, monospace',
          'Times New Roman, serif',
          'Verdana, sans-serif',
        ],
        supportAllValues: false,
      },
      fontSize: {
        options: [9, 10, 11, 12, 14, 'default', 18, 20, 22, 24, 28, 32, 36, 48],
        supportAllValues: false,
      },
      highlight: {
        options: [
          {
            model: 'yellowMarker',
            class: 'marker-yellow',
            title: '노랑',
            color: 'var(--ck-highlight-marker-yellow)',
            type: 'marker',
          },
          {
            model: 'greenMarker',
            class: 'marker-green',
            title: '초록',
            color: 'var(--ck-highlight-marker-green)',
            type: 'marker',
          },
          {
            model: 'pinkMarker',
            class: 'marker-pink',
            title: '분홍',
            color: 'var(--ck-highlight-marker-pink)',
            type: 'marker',
          },
          {
            model: 'blueMarker',
            class: 'marker-blue',
            title: '파랑',
            color: 'var(--ck-highlight-marker-blue)',
            type: 'marker',
          },
          {
            model: 'redPen',
            class: 'pen-red',
            title: '빨강',
            color: 'var(--ck-highlight-pen-red)',
            type: 'pen',
          },
          {
            model: 'greenPen',
            class: 'pen-green',
            title: '초록펜',
            color: 'var(--ck-highlight-pen-green)',
            type: 'pen',
          },
        ],
      },
      codeBlock: {
        languages: [
          { language: 'plaintext', label: '텍스트' },
          { language: 'javascript', label: 'JavaScript' },
          { language: 'typescript', label: 'TypeScript' },
          { language: 'html', label: 'HTML' },
          { language: 'css', label: 'CSS' },
          { language: 'python', label: 'Python' },
          { language: 'java', label: 'Java' },
          { language: 'csharp', label: 'C#' },
          { language: 'cpp', label: 'C++' },
          { language: 'php', label: 'PHP' },
          { language: 'sql', label: 'SQL' },
          { language: 'json', label: 'JSON' },
          { language: 'bash', label: 'Bash' },
          { language: 'xml', label: 'XML' },
          { language: 'markdown', label: 'Markdown' },
        ],
      },
      list: {
        properties: { styles: true, startIndex: true, reversed: true },
      },
      link: WIKI_LINK_CONFIG,
      placeholder: '위키 내용을 입력하세요...',
      wordCount: {
        onUpdate: handleWordCount,
      },
    }),
    [handleWordCount]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim() || slugError) return;
    onSave({ title: title.trim(), slug: slug.trim(), content, parentId, isPublished });
  };

  const parentOptions = allPages.filter(p => p.id !== page?.id);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 편집기 헤더 */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {page ? '페이지 편집' : '새 페이지 만들기'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {page ? `슬러그: /${page.slug}` : '새로운 위키 페이지를 작성합니다'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5 max-w-5xl">
        {/* 제목 + 슬러그 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-all"
              placeholder="페이지 제목을 입력하세요"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              슬러그 (URL) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono">
                /
              </span>
              <input
                type="text"
                value={slug}
                onChange={e => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                className={`w-full pl-6 pr-3 py-2.5 border rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm transition-all ${
                  slugError
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-slate-300 dark:border-slate-600'
                } ${page ? 'opacity-60 cursor-not-allowed' : ''}`}
                required
                disabled={!!page}
                placeholder="page-slug"
              />
            </div>
            {slugError && <p className="text-xs text-red-500 mt-1">{slugError}</p>}
            {!slugError && slug && !page && (
              <p className="text-xs text-slate-400 mt-1">자동 생성됨. 직접 수정 가능합니다.</p>
            )}
          </div>
        </div>

        {/* 상위 페이지 + 공개 여부 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              상위 페이지
            </label>
            <select
              value={parentId ?? ''}
              onChange={e => {
                const val = parseInt(e.target.value);
                setParentId(!isNaN(val) ? val : null);
              }}
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 text-sm transition-all"
            >
              <option value="">최상위 페이지</option>
              {parentOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 w-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <div className="relative">
                <input
                  type="checkbox"
                  id="isPublished"
                  checked={isPublished}
                  onChange={e => setIsPublished(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-10 h-6 rounded-full transition-colors ${isPublished ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow-sm absolute top-1 transition-transform ${isPublished ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  공개 페이지
                </p>
                <p className="text-xs text-slate-400">
                  {isPublished ? '모든 사용자에게 공개됩니다' : '비공개 상태입니다'}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* CKEditor 내용 */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            내용
          </label>
          <div className="wiki-ck-editor-wrapper border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
            <CKEditor
              editor={ClassicEditor}
              config={editorConfig}
              data={content}
              onChange={(_, editor) => {
                setContent(editor.getData());
              }}
            />
          </div>
          {charCount > 0 && (
            <p className="mt-1 text-right text-xs text-slate-400 dark:text-slate-500 select-none">
              {charCount.toLocaleString()} 자
            </p>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
          <button
            type="submit"
            disabled={!title.trim() || !slug.trim() || !!slugError || isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-sm"
          >
            {isSaving && (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {isSaving ? '저장 중...' : page ? '저장' : '페이지 생성'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
};
