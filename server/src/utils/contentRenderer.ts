// Tiptap JSON·CKEditor HTML 을 서버에서 HTML 로 변환한다.
import sanitizeHtml from 'sanitize-html';
import { logInfo } from './logger';

// 서버 측 살균. 클라이언트 DOMPurify 에만 의존하면 OG·검색 미리보기 같은 비 DOMPurify 경로에서 XSS 가 노출된다.
// 허용 태그·속성·CSS 는 client/src/utils/htmlSanitizer.ts 와 동기화한다. 서버가 더 엄격하면 정상 콘텐츠가 잘린다.

// client 의 SAFE_CSS_PROPS 와 같은 목록이어야 한다. sanitizerParity.test.ts 가 두 목록을 비교한다.
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
    // 체크리스트(CKEditor TodoList) — <ul class="todo-list"><li><label><input type=checkbox>
    'label',
    'input',
  ],
  // client ALLOWED_ATTR과 일치 (style은 transformTags에서 직접 sanitize)
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title', 'class'],
    img: ['src', 'alt', 'title', 'width', 'height', 'class', 'style'],
    th: ['colspan', 'rowspan', 'class', 'style'],
    td: ['colspan', 'rowspan', 'class', 'style'],
    code: ['class'],
    // 문단별 첨부(증적) 참조. client htmlSanitizer 의 ALLOWED_ATTR 과 동기화한다.
    span: ['data-attachment'],
    label: ['class'],
    // input 은 체크리스트 표시 전용. transformTags 에서 항상 checkbox·disabled 로 강제한다.
    input: ['type', 'checked', 'disabled'],
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
    // 체크리스트의 체크박스는 '표시' 다. 어떤 값이 들어오든 읽기 전용 체크박스로 만든다.
    input: (_tagName, attribs) => ({
      tagName: 'input',
      attribs: {
        type: 'checkbox',
        disabled: 'disabled',
        ...(attribs.checked !== undefined ? { checked: 'checked' } : {}),
      },
    }),
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

// 콘텐츠를 HTML로 변환 — Tiptap JSON 및 CKEditor HTML 모두 지원.
//   모든 반환 HTML은 sanitize-html을 통과해 서버 측에서 XSS를 1차 차단한다.
export function renderContentToHTML(json: string | TiptapDocument): string {
  try {
    if (typeof json === 'string') {
      const trimmed = json.trimStart();
      if (trimmed.startsWith('<') || trimmed === '') {
        return sanitizeHtmlContent(json);
      }
      const doc = JSON.parse(json) as TiptapDocument;
      if (!doc || doc.type !== 'doc') {
        return sanitizeHtmlContent(json); // Unknown format — sanitize raw input
      }
      return sanitizeHtmlContent(renderNodes(doc.content || []));
    }
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

function renderNodes(nodes: TiptapNode[]): string {
  return nodes.map(node => renderNode(node)).join('');
}

function renderNode(node: TiptapNode): string {
  const { type, attrs = {}, content = [], marks = [], text } = node;

  switch (type) {
    case 'paragraph': {
      const allowedAligns = ['left', 'center', 'right', 'justify'];
      const safeAlign =
        attrs.textAlign && allowedAligns.includes(attrs.textAlign) ? attrs.textAlign : null;
      const pAttrs = safeAlign ? ` style="text-align: ${safeAlign}"` : '';
      const pContent = renderNodes(content);
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
      logInfo(`알 수 없는 노드 타입: ${type}`);
      return renderNodes(content);
  }
}

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

// 텍스트 요약 생성 (검색 결과용) — Tiptap JSON 및 CKEditor HTML 모두 지원
export function extractTextFromContent(
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
      text = extractText(doc.content || []);
    } else {
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

// 검색 인덱싱용: content 를 길이 제한 없이 평문으로 바꿔 Post.contentText 에 채운다.
export function extractSearchText(content: string): string {
  return extractTextFromContent(content, Number.MAX_SAFE_INTEGER);
}

function extractText(nodes: TiptapNode[]): string {
  let result = '';

  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      result += node.text;
    } else if (node.content) {
      result += extractText(node.content);
    }

    if (['paragraph', 'heading', 'listItem'].includes(node.type)) {
      result += ' ';
    }
  }

  return result.replace(/\s+/g, ' ').trim();
}
