// 프로덕션 SPA(index.html) 서빙 시 현재 사이트 설정을 OG/타이틀 메타에 주입한다.
// 카카오/구글 등 링크 미리보기 크롤러는 JS를 실행하지 않아 static index.html만 읽으므로,
// 클라이언트에서 document.title을 바꿔도 미리보기엔 반영되지 않는다. 서버가 응답 시점에
// 설정값(siteName/siteTitle/description)을 직접 끼워 넣어야 크롤러가 올바른 이름을 읽는다.
//
// 렌더 결과는 캐시하고, 설정 변경 시 invalidateIndexHtmlCache()로 무효화한다.
//
// 원본 파일도 매번 확인한다. 예전에는 프로세스가 처음 한 번만 읽어 두어서, 새로 빌드해
// index.html 이 바뀌어도 서버를 다시 띄우기 전까지 옛 HTML 을 계속 내보냈다 — 그 안의
// 자산 이름(해시)이 옛것이라, 사람들은 새로고침을 해도 예전 화면을 봤다.
import crypto from 'crypto';
import fs from 'fs';
import { SiteSettings } from '../models/SiteSettings';
import { logError } from './logger';

let rawTemplate: string | null = null;
let rendered: string | null = null;
/** 마지막으로 읽은 원본의 수정 시각·크기 — 배포로 파일이 바뀌면 다시 읽는다 */
let rawStamp = '';
/** 지금 서빙 중인 빌드의 표식. 화면이 이 값으로 새 배포를 알아챈다. */
let appVersion = 'dev';

/**
 * 지금 서빙 중인 빌드의 표식.
 * 파일이 바뀌었으면 먼저 다시 읽는다 — 배포 직후 첫 물음에도 새 값을 준다.
 */
export function readAppVersion(indexPath: string): string {
  try {
    loadTemplate(indexPath);
  } catch {
    // 파일을 못 읽어도 알려 줄 값은 있어야 한다(가지고 있던 표식)
  }
  return appVersion;
}

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
 * 원본 index.html 을 (바뀌었으면) 다시 읽는다.
 * 파일이 바뀌면 렌더 캐시도 함께 버린다 — 옛 HTML 을 계속 내보내던 자리다.
 */
function loadTemplate(indexPath: string): string {
  let stamp = '';
  try {
    const st = fs.statSync(indexPath);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    // 파일을 볼 수 없으면 가지고 있던 것을 쓴다(읽기는 아래에서 다시 시도한다)
  }
  if (rawTemplate !== null && stamp === rawStamp) return rawTemplate;

  rawTemplate = fs.readFileSync(indexPath, 'utf-8');
  rawStamp = stamp;
  rendered = null;
  // 자산 이름(해시)이 들어 있으므로 내용이 곧 빌드의 표식이다
  appVersion = crypto.createHash('sha1').update(rawTemplate).digest('hex').slice(0, 12);
  return rawTemplate;
}

/**
 * index.html에 현재 사이트 설정을 주입해 반환한다(캐시됨).
 * 설정 조회 실패 시 원본 템플릿을 그대로 반환(안전).
 */
export async function renderIndexHtml(indexPath: string): Promise<string> {
  const template = loadTemplate(indexPath);
  if (rendered) return rendered;

  // 화면이 '지금 보고 있는 빌드' 를 알 수 있게 심는다 — 이 값으로 새 배포를 알아챈다
  let html = template.replace(
    /<head>/,
    `<head>\n    <meta name="app-version" content="${appVersion}" />`
  );
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
    return html;
  }

  rendered = html;
  return rendered;
}
