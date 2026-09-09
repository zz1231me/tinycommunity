// 프로덕션 SPA(index.html) 서빙 시 현재 사이트 설정을 OG/타이틀 메타에 주입한다.
// 카카오/구글 등 링크 미리보기 크롤러는 JS를 실행하지 않아 static index.html만 읽으므로,
// 클라이언트에서 document.title을 바꿔도 미리보기엔 반영되지 않는다. 서버가 응답 시점에
// 설정값(siteName/siteTitle/description)을 직접 끼워 넣어야 크롤러가 올바른 이름을 읽는다.
//
// 렌더 결과는 캐시하고, 설정 변경 시 invalidateIndexHtmlCache()로 무효화한다.
import fs from 'fs';
import { SiteSettings } from '../models/SiteSettings';
import { logError } from './logger';

let rawTemplate: string | null = null;
let rendered: string | null = null;

/** HTML 속성/본문에 안전하게 넣기 위한 이스케이프 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 설정 변경 시 호출 — 다음 요청에서 최신 값으로 다시 렌더한다 */
export function invalidateIndexHtmlCache(): void {
  rendered = null;
}

/**
 * index.html에 현재 사이트 설정을 주입해 반환한다(캐시됨).
 * 설정 조회 실패 시 원본 템플릿을 그대로 반환(안전).
 */
export async function renderIndexHtml(indexPath: string): Promise<string> {
  if (rendered) return rendered;
  if (rawTemplate === null) {
    rawTemplate = fs.readFileSync(indexPath, 'utf-8');
  }

  let html = rawTemplate;
  try {
    // consolidateSiteSettings로 단일 행이 보장되지만, 다중 행이어도 결정적으로 선택
    const s = await SiteSettings.findOne({
      order: [
        ['updatedAt', 'DESC'],
        ['id', 'ASC'],
      ],
    });
    if (s) {
      const siteName = escapeHtml(s.siteName || 'TinyCommunity');
      const pageTitle = escapeHtml(s.siteTitle || s.siteName || 'TinyCommunity');
      const description = s.description ? escapeHtml(s.description) : null;

      html = html
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${pageTitle}</title>`)
        .replace(/(<meta property="og:site_name" content=")[^"]*(")/, `$1${siteName}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${pageTitle}$2`);

      if (description !== null) {
        html = html
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`)
          .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`);
      }
    }
  } catch (err) {
    logError('index.html OG 주입 실패 — 원본 템플릿 사용', err);
    return rawTemplate;
  }

  rendered = html;
  return rendered;
}
