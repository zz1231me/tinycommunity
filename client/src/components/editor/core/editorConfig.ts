// client/src/components/editor/core/editorConfig.ts
// ──────────────────────────────────────────────────────────────────────────
// CKEditor 5 설정 단일 소스(Single Source of Truth).
// 게시글(post)·댓글(comment)·이벤트(event) 세 에디터가 같은 옵션·플러그인·툴바를
// 한 곳에서 공유한다. 차이는 "프리셋"으로만 표현한다.
//
// 설계 원칙
//  - 공통 옵션(link/list/heading/translations 등)은 한 번만 정의해 재사용.
//  - 동적 부분(업로드 어댑터 extraPlugins, 글자수 onUpdate, placeholder)은
//    컴포넌트가 buildEditorConfig(...)에 주입한다.
//  - 댓글 프리셋은 sanitizeCommentHTML 허용 범위(서식/목록/코드/인용/sub·sup)에
//    맞춰 경량화한다. 표·이미지·제목·폰트·정렬은 상세보기에서 어차피 제거되므로
//    에디터에서도 제공하지 않는다(에디터 ↔ 표시 정합).
// ──────────────────────────────────────────────────────────────────────────

import {
  Alignment,
  AutoImage,
  Autoformat,
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
  Fullscreen,
  Heading,
  Highlight,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsert,
  ImageInsertViaUrl,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Indent,
  IndentBlock,
  Italic,
  Link,
  LinkImage,
  List,
  ListProperties,
  MediaEmbed,
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
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  Underline,
  WordCount,
  type EditorConfig,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import koTranslations from 'ckeditor5/translations/ko.js';

export type EditorPreset = 'post' | 'comment' | 'event';

type PluginList = NonNullable<EditorConfig['plugins']>;
// extraPlugins는 문자열 이름을 허용하지 않는 별도 타입(PluginConstructor[] 등)
type ExtraPluginList = NonNullable<EditorConfig['extraPlugins']>;

/* ── 공통 서브 설정 ─────────────────────────────────────────── */

const LINK_CONFIG: EditorConfig['link'] = {
  defaultProtocol: 'https://',
  addTargetToExternalLinks: true,
  decorators: {
    isExternal: {
      mode: 'automatic',
      callback: (url: string | null) => url !== null && /^(https?:)?\/\//.test(url),
      attributes: { target: '_blank', rel: 'noopener noreferrer' },
    },
  },
};

const LIST_CONFIG: EditorConfig['list'] = {
  properties: { styles: true, startIndex: true, reversed: true },
};

const HEADING_FULL: EditorConfig['heading'] = {
  options: [
    { model: 'paragraph', title: '본문', class: 'ck-heading_paragraph' },
    { model: 'heading1', view: 'h1', title: '제목 1', class: 'ck-heading_heading1' },
    { model: 'heading2', view: 'h2', title: '제목 2', class: 'ck-heading_heading2' },
    { model: 'heading3', view: 'h3', title: '제목 3', class: 'ck-heading_heading3' },
    { model: 'heading4', view: 'h4', title: '제목 4', class: 'ck-heading_heading4' },
    { model: 'heading5', view: 'h5', title: '제목 5', class: 'ck-heading_heading5' },
  ],
};

// 이벤트: h2/h3만 사용(상세 영역이 좁아 큰 제목은 부적합) — 표시 라벨만 1/2로
const HEADING_EVENT: EditorConfig['heading'] = {
  options: [
    { model: 'paragraph', title: '본문', class: 'ck-heading_paragraph' },
    { model: 'heading2', view: 'h2', title: '제목 1', class: 'ck-heading_heading2' },
    { model: 'heading3', view: 'h3', title: '제목 2', class: 'ck-heading_heading3' },
  ],
};

const TABLE_CONFIG: EditorConfig['table'] = {
  contentToolbar: [
    'tableColumn',
    'tableRow',
    'mergeTableCells',
    'toggleTableCaption',
    'tableProperties',
    'tableCellProperties',
  ],
};

// 글자색/배경색 — 한글 라벨 팔레트 + 최근 사용색(documentColors).
// 출력은 인라인 style="color:#hex" → sanitizer 통과·CKContentView.css에서 정상 표시.
const FONT_COLOR_CONFIG: EditorConfig['fontColor'] = {
  colors: [
    { color: '#000000', label: '검정' },
    { color: '#434343', label: '진회색' },
    { color: '#808080', label: '회색' },
    { color: '#e74c3c', label: '빨강' },
    { color: '#e67e22', label: '주황' },
    { color: '#f1c40f', label: '노랑' },
    { color: '#2ecc71', label: '초록' },
    { color: '#3498db', label: '파랑' },
    { color: '#9b59b6', label: '보라' },
    { color: '#ffffff', label: '흰색', hasBorder: true },
  ],
  columns: 5,
  documentColors: 6,
};

const FONT_BG_COLOR_CONFIG: EditorConfig['fontBackgroundColor'] = {
  colors: [
    { color: '#fde047', label: '노랑' },
    { color: '#bbf7d0', label: '연초록' },
    { color: '#bfdbfe', label: '연파랑' },
    { color: '#fbcfe8', label: '분홍' },
    { color: '#fed7aa', label: '주황' },
    { color: '#e9d5ff', label: '연보라' },
    { color: '#e5e7eb', label: '연회색' },
    { color: '#ffffff', label: '흰색', hasBorder: true },
  ],
  columns: 5,
  documentColors: 6,
};

const FONT_FAMILY_CONFIG: EditorConfig['fontFamily'] = {
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
};

const FONT_SIZE_CONFIG: EditorConfig['fontSize'] = {
  options: [9, 10, 11, 12, 14, 'default', 18, 20, 22, 24, 28, 32, 36, 48],
  supportAllValues: false,
};

const HIGHLIGHT_CONFIG: EditorConfig['highlight'] = {
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
};

const CODEBLOCK_CONFIG: EditorConfig['codeBlock'] = {
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
};

// 동영상 임베드: 저장 데이터에 미리보기(iframe)를 포함(previewsInData) →
// 상세보기 sanitizer가 신뢰 호스트(YouTube/Vimeo)만 통과시킨다.
// 신뢰 allowlist 외 제공자는 표시 단계에서 어차피 제거되므로 입력 자체를 막는다.
const MEDIA_EMBED_CONFIG: EditorConfig['mediaEmbed'] = {
  previewsInData: true,
  removeProviders: [
    'dailymotion',
    'spotify',
    'instagram',
    'twitter',
    'googleMaps',
    'flickr',
    'facebook',
  ],
};

const POST_IMAGE_CONFIG: EditorConfig['image'] = {
  toolbar: [
    'imageStyle:inline',
    'imageStyle:wrapText',
    'imageStyle:breakText',
    '|',
    'toggleImageCaption',
    'imageTextAlternative',
    '|',
    'linkImage',
    '|',
    'resizeImage',
  ],
};

const EVENT_IMAGE_CONFIG: EditorConfig['image'] = {
  toolbar: ['imageStyle:inline', 'imageStyle:block', '|', 'imageTextAlternative'],
  styles: { options: ['inline', 'block', 'side'] },
};

/* ── 이미지 플러그인 묶음 (업로드/자동임베드/링크이미지 포함) ── */
// FileRepository는 ImageUpload 의존성으로 자동 포함 — 명시 추가 금지
const POST_IMAGE_PLUGINS: PluginList = [
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  ImageInsert, // 'insertImage' 드롭다운(업로드 + URL삽입 통합 UI)
  ImageInsertViaUrl, // 외부 이미지 URL 직접 삽입
  AutoImage, // 이미지 URL 붙여넣기 → 자동 <img> 임베드
  LinkImage, // 이미지에 링크(<a><img>) — sanitizer 허용 태그라 표시 안전
];

const EVENT_IMAGE_PLUGINS: PluginList = [
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
];

/* ── 프리셋별 플러그인 ─────────────────────────────────────── */

const POST_PLUGINS: PluginList = [
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
  List,
  ListProperties,
  BlockQuote,
  CodeBlock,
  HorizontalLine,
  Link,
  AutoLink,
  ...POST_IMAGE_PLUGINS,
  MediaEmbed,
  PageBreak,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Table,
  TableCaption,
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
  Autoformat, // 마크다운 단축 입력(**굵게**, # 제목, - 목록 등) — 출력은 기존 태그
  Fullscreen, // 전체화면 편집 토글
  WordCount,
];

// 댓글: sanitizeCommentHTML 허용 범위에 정합 — 서식/목록/코드/인용/sub·sup만.
// 표·이미지·제목·폰트·정렬·hr은 표시 단계에서 제거되므로 에디터에서도 제외.
const COMMENT_PLUGINS: PluginList = [
  Essentials,
  Paragraph,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Subscript,
  Superscript,
  Link,
  AutoLink,
  List,
  ListProperties,
  BlockQuote,
  CodeBlock,
  RemoveFormat,
  PasteFromOffice,
];

const EVENT_PLUGINS: PluginList = [
  Essentials,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  FontColor,
  Alignment,
  Link,
  AutoLink,
  ...EVENT_IMAGE_PLUGINS,
  List,
  ListProperties,
  Indent,
  IndentBlock,
  BlockQuote,
  PasteFromOffice,
  RemoveFormat,
];

/* ── 프리셋별 툴바 ─────────────────────────────────────────── */

const POST_TOOLBAR: string[] = [
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
  'insertImage',
  'insertTable',
  'mediaEmbed',
  '|',
  'specialCharacters',
  'horizontalLine',
  'pageBreak',
  '|',
  'removeFormat',
  'findAndReplace',
  '|',
  'fullscreen',
];

// 댓글: 본문에서 실제로 렌더되는 서식만 노출(경량)
const COMMENT_TOOLBAR: string[] = [
  'undo',
  'redo',
  '|',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  '|',
  'subscript',
  'superscript',
  '|',
  'bulletedList',
  'numberedList',
  '|',
  'link',
  'blockQuote',
  'codeBlock',
  '|',
  'removeFormat',
];

const EVENT_TOOLBAR: string[] = [
  'undo',
  'redo',
  '|',
  'heading',
  '|',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  '|',
  'fontColor',
  'alignment',
  '|',
  'bulletedList',
  'numberedList',
  'outdent',
  'indent',
  '|',
  'link',
  'insertImage',
  'blockQuote',
  '|',
  'removeFormat',
];

interface PresetParts {
  plugins: PluginList;
  toolbar: string[];
  heading?: EditorConfig['heading'];
  image?: EditorConfig['image'];
  table?: EditorConfig['table'];
  fontFamily?: EditorConfig['fontFamily'];
  fontSize?: EditorConfig['fontSize'];
  fontColor?: EditorConfig['fontColor'];
  fontBackgroundColor?: EditorConfig['fontBackgroundColor'];
  highlight?: EditorConfig['highlight'];
  codeBlock?: EditorConfig['codeBlock'];
  mediaEmbed?: EditorConfig['mediaEmbed'];
  list?: EditorConfig['list'];
}

const PRESETS: Record<EditorPreset, PresetParts> = {
  post: {
    plugins: POST_PLUGINS,
    toolbar: POST_TOOLBAR,
    heading: HEADING_FULL,
    image: POST_IMAGE_CONFIG,
    table: TABLE_CONFIG,
    fontFamily: FONT_FAMILY_CONFIG,
    fontSize: FONT_SIZE_CONFIG,
    fontColor: FONT_COLOR_CONFIG,
    fontBackgroundColor: FONT_BG_COLOR_CONFIG,
    highlight: HIGHLIGHT_CONFIG,
    codeBlock: CODEBLOCK_CONFIG,
    mediaEmbed: MEDIA_EMBED_CONFIG,
    list: LIST_CONFIG,
  },
  comment: {
    plugins: COMMENT_PLUGINS,
    toolbar: COMMENT_TOOLBAR,
    list: LIST_CONFIG,
  },
  event: {
    plugins: EVENT_PLUGINS,
    toolbar: EVENT_TOOLBAR,
    heading: HEADING_EVENT,
    image: EVENT_IMAGE_CONFIG,
    list: LIST_CONFIG,
  },
};

export interface BuildEditorConfigOptions {
  /** placeholder 문구 */
  placeholder?: string;
  /** 업로드 어댑터 등 컴포넌트가 주입하는 추가 플러그인 */
  extraPlugins?: ExtraPluginList;
  /** 글자수 갱신 콜백(게시글 전용) */
  onWordCount?: (characters: number) => void;
}

/**
 * 프리셋 + 동적 옵션으로 완성된 CKEditor 설정을 만든다.
 * 컴포넌트는 useMemo로 감싸 placeholder가 바뀔 때만 재생성하면 된다.
 */
export function buildEditorConfig(
  preset: EditorPreset,
  opts: BuildEditorConfigOptions = {}
): EditorConfig {
  const parts = PRESETS[preset];
  const { placeholder, extraPlugins, onWordCount } = opts;

  const config: EditorConfig = {
    licenseKey: 'GPL',
    translations: [koTranslations],
    plugins: parts.plugins,
    toolbar: { items: parts.toolbar, shouldNotGroupWhenFull: true },
    link: LINK_CONFIG,
  };

  if (extraPlugins) config.extraPlugins = extraPlugins;
  if (placeholder !== undefined) config.placeholder = placeholder;
  if (parts.heading) config.heading = parts.heading;
  if (parts.image) config.image = parts.image;
  if (parts.table) config.table = parts.table;
  if (parts.fontFamily) config.fontFamily = parts.fontFamily;
  if (parts.fontSize) config.fontSize = parts.fontSize;
  if (parts.fontColor) config.fontColor = parts.fontColor;
  if (parts.fontBackgroundColor) config.fontBackgroundColor = parts.fontBackgroundColor;
  if (parts.highlight) config.highlight = parts.highlight;
  if (parts.codeBlock) config.codeBlock = parts.codeBlock;
  if (parts.mediaEmbed) config.mediaEmbed = parts.mediaEmbed;
  if (parts.list) config.list = parts.list;
  if (onWordCount) {
    config.wordCount = {
      onUpdate: (stats: { characters: number; words: number }) => onWordCount(stats.characters),
    };
  }

  return config;
}
