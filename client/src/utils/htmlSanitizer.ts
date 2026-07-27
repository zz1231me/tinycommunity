// client/src/utils/htmlSanitizer.ts - HTML 콘텐츠 안전화
import DOMPurify from 'dompurify';

// Safe CSS property allowlist for inline style sanitization
const SAFE_CSS_PROPS = new Set([
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
  // 동영상 임베드 반응형 래퍼(figure.media)용 — position은 값 가드로 fixed/sticky 차단
  'position',
  'top',
  'right',
  'bottom',
  'left',
]);

const DANGEROUS_CSS_VALUES = /javascript:|expression\s*\(|url\s*\(/i;

// Sanitize inline style attributes — only allow safe CSS properties and values
function sanitizeStyleAttr(node: Element): void {
  const style = node.getAttribute('style');
  if (!style) return;

  const safe = style
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const colonIdx = s.indexOf(':');
      if (colonIdx === -1) return false;
      const prop = s.slice(0, colonIdx).trim().toLowerCase();
      const value = s
        .slice(colonIdx + 1)
        .trim()
        .toLowerCase();
      if (!SAFE_CSS_PROPS.has(prop) || DANGEROUS_CSS_VALUES.test(value)) return false;
      // position: fixed/sticky는 뷰포트 고정 오버레이(클릭재킹) 가능 → relative/absolute/static만 허용
      if (prop === 'position' && !/^(static|relative|absolute)$/.test(value)) return false;
      return true;
    })
    .join('; ');

  if (safe) {
    node.setAttribute('style', safe);
  } else {
    node.removeAttribute('style');
  }
}

// 신뢰 동영상 임베드 호스트 — iframe src 화이트리스트(호스트 → 허용 경로 prefix)
// CKEditor MediaEmbed는 YouTube/Vimeo 임베드 URL을 생성한다(previewsInData).
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
    u = new URL(src); // 상대/프로토콜상대 URL은 base 없이 throw → 거부
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const prefix = ALLOWED_EMBED_HOSTS[u.hostname.toLowerCase()];
  return !!prefix && u.pathname.startsWith(prefix);
}

// iframe: 신뢰 동영상 호스트만 통과, 그 외(피싱/클릭재킹 프레임)는 제거.
// 태그 단위 결정이므로 ALLOWED_TAGS 검사보다 먼저 도는 uponSanitizeElement에서 처리.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'iframe') return;
  const el = node as Element;
  const src = el.getAttribute('src') ?? '';
  if (!isAllowedEmbedSrc(src)) {
    el.parentNode?.removeChild(el);
  }
});

// <a> 태그 보안 속성 강제 적용 + iframe 하드닝 + 인라인 style 정화
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
  }
  // 살아남은(=신뢰 호스트) iframe에 보수적 속성 강제
  if (node.tagName === 'IFRAME') {
    node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    node.setAttribute('loading', 'lazy');
    node.removeAttribute('srcdoc'); // 인라인 문서 주입 차단
  }
  if (node.hasAttribute('style')) {
    sanitizeStyleAttr(node as Element);
  }
});

interface SanitizeOptions {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
  KEEP_CONTENT?: boolean;
}

// ✅ 기본 허용 태그 및 속성 (CKEditor 5 출력 기준)
const defaultOptions: SanitizeOptions = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'i', // CKEditor Italic 출력은 <i> (서버 allowedTags와 정합) — 없으면 이탤릭 표시 유실
    'u',
    's',
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
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'caption',
    'colgroup',
    'col',
    'code',
    'pre',
    'span',
    'div',
    'figure',
    'figcaption', // CKEditor wraps tables and images in <figure>
    'sub',
    'sup',
    'hr',
    'mark', // CKEditor Highlight 플러그인: <mark class="marker-yellow"> 등
    'iframe', // 동영상 임베드 — src는 신뢰 호스트만 통과(uponSanitizeElement 훅)
  ],
  ALLOWED_ATTR: [
    'href',
    'src',
    'alt',
    'title',
    'width',
    'height',
    'class',
    'style',
    'rowspan',
    'colspan',
    'target',
    'rel',
    'data-figure-type', // CKEditor figure metadata
    // 동영상 임베드 iframe 속성
    'frameborder',
    'allow',
    'allowfullscreen',
    'referrerpolicy',
    'loading',
  ],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
};

/**
 * HTML 콘텐츠를 안전하게 정화
 * @param dirty 정화할 HTML 문자열
 * @param options 정화 옵션
 * @returns 안전한 HTML 문자열
 */
export function sanitizeHTML(dirty: string, options: SanitizeOptions = {}): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }

  const config = { ...defaultOptions, ...options };

  const sanitized = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: config.ALLOWED_TAGS,
    ALLOWED_ATTR: config.ALLOWED_ATTR,
    ALLOW_DATA_ATTR: config.ALLOW_DATA_ATTR,
    KEEP_CONTENT: config.KEEP_CONTENT,

    FORBID_CONTENTS: ['script', 'style'],
    // iframe은 FORBID에서 제외 — 대신 uponSanitizeElement 훅이 신뢰 호스트만 통과시키고,
    // 댓글 등 iframe을 ALLOWED_TAGS에 넣지 않는 경로에서는 자동 제거된다.
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form', 'input'],
    // Note: 'style' attribute is allowed but sanitized via the afterSanitizeAttributes hook
    FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'],
    SAFE_FOR_TEMPLATES: true,

    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_DOM: true,
  });

  return sanitized;
}

/**
 * 댓글용 HTML 정화 — CKEditor 댓글 에디터 출력 기준
 * (이미지·표·style 속성 불허, 기본 서식 + 목록 + 코드 허용)
 */
export function sanitizeCommentHTML(dirty: string): string {
  return sanitizeHTML(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'i', // CKEditor Italic 출력 <i> — 댓글 이탤릭 표시 유실 방지
      'u',
      's',
      'a',
      'code',
      'pre',
      'ul',
      'ol',
      'li',
      'blockquote',
      'span',
      'sub',
      'sup',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}
