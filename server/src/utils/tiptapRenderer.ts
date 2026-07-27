// server/src/utils/tiptapRenderer.ts
// ✅ Tiptap JSON을 HTML로 변환하는 유틸리티 (서버사이드) - 개선 버전
import sanitizeHtml from 'sanitize-html';
import { logInfo } from './logger';

// CKEditor 등에서 들어온 raw HTML 문자열을 서버 측에서 살균.
// 클라이언트 DOMPurify에만 의존하면 OG 미리보기/검색 미리보기 등 비 DOMPurify 경로에서 XSS가 노출됨.
//
// ⚠️ 허용 태그/속성/CSS는 client/src/utils/htmlSanitizer.ts의 DOMPurify 설정과 동기화한다.
//    서버 측 규칙이 더 엄격하면 정상 콘텐츠(밑줄/표/색상 등)가 잘려 사용자에게 깨져 보임.

// client SAFE_CSS_PROPS와 동일 — CKEditor가 출력하는 스타일을 보존하되 javascript:/expression()만 차단
const SAFE_CSS_PROPS = new Set<string>([
  'color',
  'background-color',
  'font-size',
  'font-family',
  'text-align',
  'text-decoration',
  'width',
  'height',
  'border',
  'border-collapse',
  'border-spacing',
  'border-color',
  'border-width',
  'border-style',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'vertical-align',
  'float',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'font-weight',
  'font-style',
  'text-indent',
  'white-space',
  // 렌더러가 생성하는 추가 속성 (renderNode의 list/blockquote/codeBlock/image 등)
  'list-style-type',
  'border-radius',
  'box-shadow',
  'display',
  'overflow-x',
  // 동영상 임베드 반응형 래퍼(figure.media)용 — position은 값 가드로 fixed/sticky 차단
  'position',
  'top',
  'right',
  'bottom',
  'left',
]);

const DANGEROUS_CSS_VALUE = /javascript:|expression\s*\(|url\s*\(/i;

function sanitizeStyleString(style: string): string {
  return style
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const colonIdx = s.indexOf(':');
      if (colonIdx === -1) return false;
      const prop = s.slice(0, colonIdx).trim().toLowerCase();
      const value = s.slice(colonIdx + 1).trim();
      if (!SAFE_CSS_PROPS.has(prop)) return false;
      if (DANGEROUS_CSS_VALUE.test(value)) return false;
      // position: fixed/sticky는 뷰포트 고정 오버레이(클릭재킹) 가능 → relative/absolute/static만 허용
      if (prop === 'position' && !/^(static|relative|absolute)$/.test(value.toLowerCase())) {
        return false;
      }
      return true;
    })
    .join('; ');
}

// 신뢰 동영상 임베드 호스트 — client htmlSanitizer.ts와 동기화(호스트 → 허용 경로 prefix)
const ALLOWED_EMBED_HOSTS: Record<string, string> = {
  'www.youtube.com': '/embed/',
  'youtube.com': '/embed/',
  'www.youtube-nocookie.com': '/embed/',
  'youtube-nocookie.com': '/embed/',
  'player.vimeo.com': '/video/',
};

/** iframe src가 신뢰 동영상 임베드(https + 허용 호스트 + 허용 경로)인지 검증 */
function isAllowedEmbedSrc(src: string): boolean {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const prefix = ALLOWED_EMBED_HOSTS[u.hostname.toLowerCase()];
  return !!prefix && u.pathname.startsWith(prefix);
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  // client ALLOWED_TAGS와 일치
  allowedTags: [
    'p',
    'br',
    'hr',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'a',
    'img',
    'mark',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'colgroup',
    'col',
    'span',
    'div',
    'figure',
    'figcaption',
    'iframe', // 동영상 임베드 — src는 신뢰 호스트만(allowedIframeHostnames + exclusiveFilter)
  ],
  // client ALLOWED_ATTR과 일치 (style은 transformTags에서 직접 sanitize)
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title', 'class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'class', 'style'],
    th: ['colspan', 'rowspan', 'class', 'style'],
    td: ['colspan', 'rowspan', 'class', 'style'],
    code: ['class'],
    pre: ['class'],
    figure: ['class', 'data-figure-type', 'style'],
    table: ['class', 'style'],
    col: ['style'],
    colgroup: ['style', 'span'],
    iframe: [
      'src',
      'width',
      'height',
      'frameborder',
      'allow',
      'allowfullscreen',
      'referrerpolicy',
      'loading',
      'style',
    ],
    '*': ['class', 'style'],
  },
  // javascript:/vbscript:/data: 스킴 차단 (image는 http/https/data:image 허용 — CKEditor가 임베드 가능)
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // iframe: 신뢰 동영상 호스트만(상대/프로토콜상대 URL 거부)
  allowedIframeHostnames: [
    'www.youtube.com',
    'youtube.com',
    'www.youtube-nocookie.com',
    'youtube-nocookie.com',
    'player.vimeo.com',
  ],
  allowIframeRelativeUrls: false,
  // 호스트가 맞아도 경로(/embed/, /video/)·https까지 맞지 않으면 iframe 통째로 제거
  exclusiveFilter: frame => frame.tag === 'iframe' && !isAllowedEmbedSrc(frame.attribs?.src || ''),
  // onclick 등 모든 이벤트 핸들러 속성 차단
  disallowedTagsMode: 'discard',
  // style 속성은 prop 화이트리스트 + dangerous 값 차단 (transformTags['*']에서 처리)
  transformTags: {
    '*': (tagName, attribs) => {
      if (attribs.style) {
        const safe = sanitizeStyleString(attribs.style);
        if (safe) attribs.style = safe;
        else delete attribs.style;
      }
      // on*= 이벤트 핸들러 속성 제거 (allowedAttributes 화이트리스트로 이미 차단되지만 방어적 추가)
      for (const key of Object.keys(attribs)) {
        if (key.toLowerCase().startsWith('on')) delete attribs[key];
      }
      return { tagName, attribs };
    },
    iframe: (tagName, attribs) => {
      if (attribs.style) {
        const safe = sanitizeStyleString(attribs.style);
        if (safe) attribs.style = safe;
        else delete attribs.style;
      }
      for (const key of Object.keys(attribs)) {
        if (key.toLowerCase().startsWith('on') || key.toLowerCase() === 'srcdoc') {
          delete attribs[key];
        }
      }
      // 살아남은(신뢰 호스트) iframe에 보수적 속성 강제 — client와 동기화
      return {
        tagName,
        attribs: {
          ...attribs,
          referrerpolicy: 'strict-origin-when-cross-origin',
          loading: 'lazy',
        },
      };
    },
    a: (tagName, attribs) => {
      // 링크는 항상 새 탭 + noopener (target=_self는 명시적으로 유지)
      if (attribs.style) {
        const safe = sanitizeStyleString(attribs.style);
        if (safe) attribs.style = safe;
        else delete attribs.style;
      }
      return {
        tagName,
        attribs: {
          ...attribs,
          target: attribs.target === '_self' ? '_self' : '_blank',
          rel: 'noopener noreferrer',
        },
      };
    },
  },
};

export function sanitizeHtmlContent(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  marks?: Array<{
    type: string;
    attrs?: Record<string, any>;
  }>;
  text?: string;
}

export interface TiptapDocument {
  type: 'doc';
  content?: TiptapNode[];
}

// ✅ 콘텐츠를 HTML로 변환 — Tiptap JSON 및 CKEditor HTML 모두 지원.
//   모든 반환 HTML은 sanitize-html을 통과해 서버 측에서 XSS를 1차 차단한다.
export function renderTiptapToHTML(json: string | TiptapDocument): string {
  try {
    // If it's already an HTML string (CKEditor), sanitize and return
    if (typeof json === 'string') {
      const trimmed = json.trimStart();
      if (trimmed.startsWith('<') || trimmed === '') {
        return sanitizeHtmlContent(json);
      }
      // Try to parse as Tiptap JSON
      const doc = JSON.parse(json) as TiptapDocument;
      if (!doc || doc.type !== 'doc') {
        return sanitizeHtmlContent(json); // Unknown format — sanitize raw input
      }
      return sanitizeHtmlContent(renderNodes(doc.content || []));
    }
    // TiptapDocument object
    const doc = json as TiptapDocument;
    if (!doc || doc.type !== 'doc') {
      return '<p>잘못된 문서 형식입니다.</p>';
    }
    return sanitizeHtmlContent(renderNodes(doc.content || []));
  } catch {
    // JSON parse failed — content is likely HTML; sanitize before returning
    return typeof json === 'string'
      ? sanitizeHtmlContent(json)
      : '<p>문서를 렌더링할 수 없습니다.</p>';
  }
}

// ✅ 노드 배열을 HTML로 변환
function renderNodes(nodes: TiptapNode[]): string {
  return nodes.map(node => renderNode(node)).join('');
}

// ✅ 개별 노드를 HTML로 변환 (스타일링 개선)
function renderNode(node: TiptapNode): string {
  const { type, attrs = {}, content = [], marks = [], text } = node;

  switch (type) {
    case 'paragraph': {
      const allowedAligns = ['left', 'center', 'right', 'justify'];
      const safeAlign =
        attrs.textAlign && allowedAligns.includes(attrs.textAlign) ? attrs.textAlign : null;
      const pAttrs = safeAlign ? ` style="text-align: ${safeAlign}"` : '';
      const pContent = renderNodes(content);
      // 빈 단락 처리
      return `<p${pAttrs}>${pContent || ''}</p>`;
    }

    case 'heading': {
      const allowedAligns = ['left', 'center', 'right', 'justify'];
      const safeAlign =
        attrs.textAlign && allowedAligns.includes(attrs.textAlign) ? attrs.textAlign : null;
      const level = Math.min(6, Math.max(1, attrs.level || 1));
      const hAttrs = safeAlign ? ` style="text-align: ${safeAlign}"` : '';
      return `<h${level}${hAttrs}>${renderNodes(content)}</h${level}>`;
    }

    case 'text':
      if (!text) return '';

      // 마크 적용 (중첩 순서 중요)
      let result = escapeHtml(text);
      marks.forEach(mark => {
        switch (mark.type) {
          case 'bold':
            result = `<strong>${result}</strong>`;
            break;
          case 'italic':
            result = `<em>${result}</em>`;
            break;
          case 'strike':
            result = `<s>${result}</s>`;
            break;
          case 'code':
            // 인라인 코드 스타일링 개선
            result = `<code class="inline-code">${result}</code>`;
            break;
          case 'link': {
            const rawHref = mark.attrs?.href || '#';
            // javascript:/vbscript:/data: URI XSS 차단 — 안전한 스킴만 허용
            const safeHref = /^(https?:|mailto:|\/|#)/i.test(String(rawHref))
              ? String(rawHref)
              : '#';
            const rawTarget = mark.attrs?.target || '_blank';
            const safeTarget = rawTarget === '_self' ? '_self' : '_blank';
            result = `<a href="${escapeHtml(safeHref)}" target="${safeTarget}" rel="noopener noreferrer">${result}</a>`;
            break;
          }
          case 'highlight': {
            // CSS 인젝션 방지 — 허용된 색상 포맷만 통과
            const rawColor = mark.attrs?.color;
            const isSafeColor =
              rawColor &&
              /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)|hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)|[a-zA-Z]{2,20})$/.test(
                String(rawColor)
              );
            const bgColor = isSafeColor ? String(rawColor) : '#ffff00';
            result = `<mark style="background-color: ${bgColor}; padding: 2px 4px; border-radius: 2px;">${result}</mark>`;
            break;
          }
          case 'superscript':
            result = `<sup>${result}</sup>`;
            break;
          case 'subscript':
            result = `<sub>${result}</sub>`;
            break;
        }
      });
      return result;

    case 'hardBreak':
      return '<br>';

    case 'bulletList':
      return `<ul style="list-style-type: disc; margin-left: 20px; margin-bottom: 16px;">${renderNodes(content)}</ul>`;

    case 'orderedList': {
      const rawStart = parseInt(String(attrs.start ?? ''), 10);
      const safeStart = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : null;
      const startAttr = safeStart !== null ? ` start="${safeStart}"` : '';
      return `<ol${startAttr} style="list-style-type: decimal; margin-left: 20px; margin-bottom: 16px;">${renderNodes(content)}</ol>`;
    }

    case 'listItem':
      return `<li style="margin-bottom: 4px;">${renderNodes(content)}</li>`;

    case 'blockquote':
      return `<blockquote style="border-left: 4px solid #3B82F6; background-color: rgba(59, 130, 246, 0.1); padding: 12px 16px; margin: 16px 0; font-style: italic;">${renderNodes(content)}</blockquote>`;

    case 'codeBlock':
      const language = attrs.language || '';
      const langClass = language ? ` class="language-${escapeHtml(language)}"` : '';
      const codeContent = renderNodes(content);
      return `<pre style="background-color: #1f2937; color: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 16px 0; border: 1px solid #374151;"><code${langClass}>${codeContent}</code></pre>`;

    case 'horizontalRule':
      return '<hr style="border: 0; border-top: 1px solid #d1d5db; margin: 24px 0;">';

    case 'image': {
      const rawSrc = attrs.src || '';
      // javascript:/vbscript:/data: URI 차단 — link 처리와 일관 (data:image는 SVG 위험 때문에 허용 안 함)
      const safeSrc = /^(https?:|\/)/i.test(String(rawSrc)) ? String(rawSrc) : '';
      const alt = attrs.alt || '';
      const title = attrs.title || '';
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}"${titleAttr} style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); margin: 16px auto; display: block; border: 1px solid #e5e7eb;">`;
    }

    default:
      // 알 수 없는 노드 타입의 경우 콘텐츠만 렌더링
      logInfo(`알 수 없는 노드 타입: ${type}`);
      return renderNodes(content);
  }
}

// ✅ HTML 이스케이프 함수
function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';

  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, match => htmlEscapes[match] || match);
}

// ✅ 텍스트 요약 생성 (검색 결과용) — Tiptap JSON 및 CKEditor HTML 모두 지원
export function extractTextFromTiptap(
  json: string | TiptapDocument,
  maxLength: number = 200
): string {
  try {
    let doc: TiptapDocument | null = null;

    if (typeof json === 'string') {
      try {
        const parsed = JSON.parse(json);
        if (parsed && parsed.type === 'doc') {
          doc = parsed;
        }
      } catch {
        // Not JSON — treat as HTML below
      }
    } else if (json && (json as TiptapDocument).type === 'doc') {
      doc = json as TiptapDocument;
    }

    let text: string;
    if (doc) {
      // Tiptap JSON path
      text = extractText(doc.content || []);
    } else {
      // CKEditor HTML path — strip tags
      const html = typeof json === 'string' ? json : '';
      text = html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  } catch {
    return '';
  }
}

// 검색 인덱싱용: content(CKEditor HTML 또는 Tiptap JSON)를 길이 제한 없이 평문으로 변환.
// Post.contentText 컬럼을 이 값으로 채워, 검색이 태그가 낀 원본 HTML이 아니라
// 평문에 매칭되도록 한다(예: "<strong>볼드</strong> <i>이탤릭</i>" → "볼드 이탤릭").
export function extractSearchText(content: string): string {
  return extractTextFromTiptap(content, Number.MAX_SAFE_INTEGER);
}

// ✅ 노드에서 텍스트만 추출
function extractText(nodes: TiptapNode[]): string {
  let result = '';

  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      result += node.text;
    } else if (node.content) {
      result += extractText(node.content);
    }

    // 블록 노드 뒤에 공백 추가
    if (['paragraph', 'heading', 'listItem'].includes(node.type)) {
      result += ' ';
    }
  }

  return result.replace(/\s+/g, ' ').trim();
}
