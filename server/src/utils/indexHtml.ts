// 프로덕션 SPA(index.html) 서빙 시 사이트 설정을 OG/타이틀 메타에 주입한다.
// 링크 미리보기 크롤러는 JS 를 실행하지 않으므로 서버가 응답 시점에 끼워 넣어야 한다.
// 렌더 결과는 캐시하고, 원본 파일의 mtime·크기도 매번 확인해 배포 후 옛 HTML 을 내보내지 않는다.
import crypto from 'crypto';
import fs from 'fs';
import { SiteSettings } from '../models/SiteSettings';
import { logError } from './logger';

let rawTemplate: string | null = null;
let rendered: string | null = null;
/** 마지막으로 읽은 원본의 수정 시각·크기. 배포로 파일이 바뀌면 다시 읽는다. */
let rawStamp = '';
/** 지금 서빙 중인 빌드의 표식. 화면이 이 값으로 새 배포를 알아챈다. */
let appVersion = 'dev';

/** 지금 서빙 중인 빌드의 표식. 파일이 바뀌었으면 먼저 다시 읽는다. */
export function readAppVersion(indexPath: string): string {
  try {
    loadTemplate(indexPath);
  } catch {
    // 파일을 못 읽어도 가지고 있던 표식을 돌려준다
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

/** 설정 변경 시 호출. 다음 요청에서 최신 값으로 다시 렌더한다. */
export function invalidateIndexHtmlCache(): void {
  rendered = null;
}

/** 원본 index.html 을 바뀌었으면 다시 읽는다. 파일이 바뀌면 렌더 캐시도 함께 버린다. */
function loadTemplate(indexPath: string): string {
  let stamp = '';
  try {
    const st = fs.statSync(indexPath);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    // 파일을 볼 수 없으면 가지고 있던 것을 쓴다. 읽기는 아래에서 다시 시도한다.
  }
  if (rawTemplate !== null && stamp === rawStamp) return rawTemplate;

  rawTemplate = fs.readFileSync(indexPath, 'utf-8');
  rawStamp = stamp;
  rendered = null;
  // 자산 이름(해시)이 들어 있으므로 내용이 곧 빌드의 표식이다
  appVersion = crypto.createHash('sha1').update(rawTemplate).digest('hex').slice(0, 12);
  return rawTemplate;
}

/** index.html 에 현재 사이트 설정을 주입해 반환한다(캐시됨). 실패 시 원본 템플릿. */
export async function renderIndexHtml(indexPath: string, retry = 1): Promise<string> {
  const template = loadTemplate(indexPath);
  if (rendered) return rendered;
  // 아래 DB 조회 중에 배포가 끼어들 수 있다. 그때 이 결과를 캐시에 넣으면 사라진 자산을
  // 가리키는 옛 HTML 이 고정돼 화면이 빈 채로 남는다. 조회 전후의 표식을 비교한다.
  const builtFrom = rawStamp;

  // 화면이 이 값으로 새 배포를 알아챈다
  let html = template.replace(
    /<head>/,
    `<head>\n    <meta name="app-version" content="${appVersion}" />`
  );
  try {
    // 다중 행이어도 결정적으로 하나를 고른다
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

  // 조회 사이에 파일이 바뀌었으면 이 결과는 이미 지난 빌드의 것이다.
  // 캐시에 넣지 않고 새 템플릿으로 한 번 더 만든다(그 사이 또 바뀌면 그때 것을 그대로 준다).
  if (rawStamp !== builtFrom) {
    return retry > 0 ? renderIndexHtml(indexPath, retry - 1) : html;
  }
  rendered = html;
  return rendered;
}
