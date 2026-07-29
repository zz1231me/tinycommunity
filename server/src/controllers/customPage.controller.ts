// server/src/controllers/customPage.controller.ts
// 관리자 커스텀 HTML 페이지 CRUD + 사용자용 조회.
// 저장 html은 원문 그대로(새니타이즈 X) — 클라이언트가 sandbox iframe으로 격리 렌더한다.
import { Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { FlatRequest as Request, type AuthRequest } from '../types/auth-request';
import { CustomPage } from '../models/CustomPage';
import { sendSuccess, sendError, sendValidationError } from '../utils/response';
import { logError } from '../utils/logger';
import { UPLOAD_DIRS } from '../middlewares/upload/config';
import { blockedExtOf } from '../middlewares/upload/utils';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_HTML = 500_000; // 원문 HTML 상한 (~500KB)

// ── 번들(ZIP 폴더 업로드) 상수/헬퍼 ──────────────────────────────────────────
export const BUNDLE_MAX_ZIP = 30 * 1024 * 1024; // 업로드 zip 자체 상한 30MB
const BUNDLE_MAX_TOTAL = 80 * 1024 * 1024; // 압축 해제 총량 상한(zip-bomb 방지) 80MB
const BUNDLE_MAX_FILES = 500; // 파일 개수 상한

// 번들 내부에서 금지할 확장자 — 서버에서 실행될 수 있는 스크립트/설정만 차단.
// (.html/.js/.css/.svg 등은 sandbox iframe 안에서만 도므로 여기선 허용)
const BUNDLE_BLOCKED_EXTS = new Set([
  '.php', '.php3', '.php4', '.php5', '.phtml', '.phps',
  '.asp', '.aspx', '.jsp', '.jspx',
  '.sh', '.bash', '.zsh', '.cgi', '.fcgi',
  '.pl', '.pm', '.py', '.pyc', '.pyo', '.rb',
  '.htaccess', '.htpasswd',
]);

// 검증 실패(400)를 서버 오류(500)와 구분하기 위한 에러 타입
class BundleError extends Error {}

function bundleDir(pageId: string): string {
  return path.join(UPLOAD_DIRS.CUSTOM_PAGES, pageId);
}

// 진입 파일 선택: 루트 index.html 우선 → 루트 html → 최상위 depth html
function pickEntry(htmlFiles: string[]): string {
  if (htmlFiles.includes('index.html')) return 'index.html';
  const root = htmlFiles.filter(f => !f.includes('/')).sort();
  if (root.length) return root[0];
  return [...htmlFiles].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)
  )[0];
}

// ZIP 버퍼를 페이지 디렉터리에 안전하게 해제. 검증을 모두 통과한 뒤에만 디스크에 기록한다.
async function extractBundle(
  pageId: string,
  zipBuffer: Buffer
): Promise<{ entryFile: string; htmlFiles: string[] }> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new BundleError('올바른 ZIP 파일이 아닙니다.');
  }
  const destDir = bundleDir(pageId);
  const htmlFiles: string[] = [];
  const toWrite: { rel: string; data: Buffer }[] = [];
  let totalSize = 0;
  let fileCount = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (++fileCount > BUNDLE_MAX_FILES) {
      throw new BundleError(`파일이 너무 많습니다(최대 ${BUNDLE_MAX_FILES}개).`);
    }
    const raw = entry.entryName.replace(/\\/g, '/');
    if (raw.includes('\0')) throw new BundleError('잘못된 파일 경로가 포함되어 있습니다.');
    // zip-slip: 절대경로/상위 탈출 경로는 조용히 고치지 않고 거부(fail-closed)
    const norm = path.posix.normalize(raw);
    if (path.posix.isAbsolute(norm) || norm === '..' || norm.startsWith('../')) {
      throw new BundleError('압축 파일에 안전하지 않은 경로가 있습니다.');
    }
    const rel = norm.replace(/^\.\//, '');
    if (!rel || rel === '.') continue;
    // 최종 방어: 해석된 절대경로가 목적지 밖이면 거부
    const abs = path.resolve(destDir, rel);
    if (abs !== destDir && !abs.startsWith(destDir + path.sep)) {
      throw new BundleError('압축 파일에 안전하지 않은 경로가 있습니다.');
    }
    const ext = blockedExtOf(rel);
    if (BUNDLE_BLOCKED_EXTS.has(ext)) {
      throw new BundleError(`허용되지 않는 파일이 있습니다: ${path.basename(rel)}`);
    }
    const data = entry.getData();
    totalSize += data.length;
    if (totalSize > BUNDLE_MAX_TOTAL) throw new BundleError('압축 해제 용량이 너무 큽니다.');
    toWrite.push({ rel, data });
    if (ext === '.html' || ext === '.htm') htmlFiles.push(rel);
  }

  if (toWrite.length === 0) throw new BundleError('빈 압축 파일입니다.');
  if (htmlFiles.length === 0) {
    throw new BundleError('HTML 파일이 없습니다. index.html을 포함해주세요.');
  }

  // 기존 번들 제거 후 새로 기록 (교체 시 잔여 파일 제거)
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });
  for (const { rel, data } of toWrite) {
    const absFile = path.join(destDir, rel);
    await fs.mkdir(path.dirname(absFile), { recursive: true });
    await fs.writeFile(absFile, data);
  }

  return { entryFile: pickEntry(htmlFiles), htmlFiles: htmlFiles.sort() };
}

// 사용자용 — 게시된 페이지 목록(사이드바용, html 제외)
export const listPublishedPages = async (_req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CustomPage.findAll({
      where: { isPublished: true },
      attributes: ['id', 'slug', 'title', 'order'],
      order: [
        ['order', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    sendSuccess(res, pages);
  } catch (err) {
    logError('커스텀 페이지 목록 조회 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 사용자용 — slug로 게시된 페이지 원문 조회
export const getPageBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const page = await CustomPage.findOne({ where: { slug } });
    if (!page || !page.isPublished) {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }
    // 사용자 응답에는 렌더에 필요한 필드만 — 작성 관리자 ID(createdBy)는 노출하지 않는다.
    sendSuccess(res, {
      id: page.id,
      slug: page.slug,
      title: page.title,
      html: page.html,
      isBundle: !!page.bundlePath, // true면 클라이언트가 번들 URL을 iframe src로 사용
      entryFile: page.entryFile,
      order: page.order,
      isPublished: page.isPublished,
      updatedAt: page.updatedAt,
    });
  } catch (err) {
    logError('커스텀 페이지 조회 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 전체 목록(미게시 포함)
export const adminListPages = async (_req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CustomPage.findAll({
      order: [
        ['order', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    sendSuccess(res, pages);
  } catch (err) {
    logError('커스텀 페이지 관리 목록 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

function validatePayload(
  res: Response,
  body: { slug?: unknown; title?: unknown; html?: unknown }
): { slug: string; title: string; html: string } | null {
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const html = typeof body.html === 'string' ? body.html : '';
  if (!SLUG_RE.test(slug)) {
    sendValidationError(res, 'slug', '주소(slug)는 영문 소문자·숫자·하이픈만 가능합니다.');
    return null;
  }
  if (!title) {
    sendValidationError(res, 'title', '제목을 입력해주세요.');
    return null;
  }
  if (html.length > MAX_HTML) {
    sendValidationError(res, 'html', `HTML이 너무 큽니다(최대 ${MAX_HTML.toLocaleString()}자).`);
    return null;
  }
  return { slug, title, html };
}

// 관리자 — 생성
export const createPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const payload = validatePayload(res, req.body);
    if (!payload) return;

    const exists = await CustomPage.findOne({ where: { slug: payload.slug } });
    if (exists) {
      sendValidationError(res, 'slug', '이미 사용 중인 주소(slug)입니다.');
      return;
    }
    const page = await CustomPage.create({
      slug: payload.slug,
      title: payload.title,
      html: payload.html,
      isPublished: req.body.isPublished === true,
      order: Number.isFinite(req.body.order) ? Number(req.body.order) : 0,
      createdBy: authReq.user?.id ?? 'admin',
    });
    sendSuccess(res, page, '페이지를 만들었습니다.');
  } catch (err) {
    logError('커스텀 페이지 생성 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 수정
export const updatePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const page = await CustomPage.findByPk(req.params.id);
    if (!page) {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }
    const payload = validatePayload(res, req.body);
    if (!payload) return;

    if (payload.slug !== page.slug) {
      const dup = await CustomPage.findOne({ where: { slug: payload.slug } });
      if (dup) {
        sendValidationError(res, 'slug', '이미 사용 중인 주소(slug)입니다.');
        return;
      }
    }
    page.slug = payload.slug;
    page.title = payload.title;
    page.html = payload.html;
    if (typeof req.body.isPublished === 'boolean') page.isPublished = req.body.isPublished;
    if (Number.isFinite(req.body.order)) page.order = Number(req.body.order);
    // 번들 페이지의 진입 파일 변경 — 실제 번들 안에 존재하는 .html만 허용(경로 순회 차단)
    if (page.bundlePath && typeof req.body.entryFile === 'string') {
      const candidate = req.body.entryFile.trim().replace(/\\/g, '/');
      const dir = bundleDir(page.id);
      const abs = path.resolve(dir, candidate);
      const ext = blockedExtOf(candidate);
      if ((abs === dir || abs.startsWith(dir + path.sep)) && (ext === '.html' || ext === '.htm')) {
        try {
          if ((await fs.stat(abs)).isFile()) page.entryFile = candidate;
        } catch {
          /* 없는 파일이면 무시 */
        }
      }
    }
    page.createdBy = authReq.user?.id ?? page.createdBy;
    await page.save();
    sendSuccess(res, page, '페이지를 수정했습니다.');
  } catch (err) {
    logError('커스텀 페이지 수정 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 삭제
export const deletePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CustomPage.findByPk(req.params.id);
    if (!page) {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }
    const hadBundle = !!page.bundlePath;
    const pageId = page.id;
    await page.destroy();
    // 번들 정적 파일 디렉터리도 정리
    if (hadBundle) {
      await fs.rm(bundleDir(pageId), { recursive: true, force: true }).catch(() => {});
    }
    sendSuccess(res, null, '페이지를 삭제했습니다.');
  } catch (err) {
    logError('커스텀 페이지 삭제 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 번들(ZIP) 업로드: 압축을 안전하게 해제하고 진입 파일을 설정한다.
export const uploadBundle = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const page = await CustomPage.findByPk(req.params.id);
    if (!page) {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      sendValidationError(res, 'bundle', 'ZIP 파일을 업로드해주세요.');
      return;
    }
    if (blockedExtOf(file.originalname) !== '.zip') {
      sendValidationError(res, 'bundle', 'ZIP 파일만 업로드할 수 있습니다.');
      return;
    }

    const { entryFile, htmlFiles } = await extractBundle(page.id, file.buffer);
    // 업로드 시 진입 파일을 함께 지정할 수 있음(없으면 자동 감지)
    const requested =
      typeof req.body?.entryFile === 'string' ? req.body.entryFile.trim() : '';
    const finalEntry = requested && htmlFiles.includes(requested) ? requested : entryFile;

    page.bundlePath = path.posix.join('custom-pages', page.id);
    page.entryFile = finalEntry;
    page.html = ''; // 번들 페이지는 원문 HTML 미사용
    page.createdBy = authReq.user?.id ?? page.createdBy;
    await page.save();

    sendSuccess(
      res,
      { id: page.id, entryFile: page.entryFile, htmlFiles },
      '번들을 업로드했습니다.'
    );
  } catch (err) {
    if (err instanceof BundleError) {
      sendValidationError(res, 'bundle', err.message);
      return;
    }
    logError('커스텀 페이지 번들 업로드 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 번들 안의 HTML 파일 목록(진입 파일 선택용)
async function listHtmlFilesInDir(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(cur: string, prefix: string): Promise<void> {
    let items: import('fs').Dirent[];
    try {
      items = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const rel = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.isDirectory()) await walk(path.join(cur, it.name), rel);
      else {
        const e = blockedExtOf(rel);
        if (e === '.html' || e === '.htm') out.push(rel);
      }
    }
  }
  await walk(dir, '');
  return out.sort();
}

export const listBundleFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CustomPage.findByPk(req.params.id);
    if (!page) {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }
    const htmlFiles = page.bundlePath ? await listHtmlFilesInDir(bundleDir(page.id)) : [];
    sendSuccess(res, { entryFile: page.entryFile, htmlFiles });
  } catch (err) {
    logError('커스텀 페이지 번들 파일 목록 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 번들 정적 파일 서빙 — sandbox iframe에서 로드. 전역 helmet 헤더(DENY/strict CSP)를 개별 오버라이드.
export const serveBundle = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const page = await CustomPage.findOne({ where: { slug: req.params.slug } });
    if (!page || !page.bundlePath) {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }
    // 미게시 페이지는 관리자만 접근(미리보기)
    if (!page.isPublished && authReq.user?.role !== 'admin') {
      sendError(res, 404, '페이지를 찾을 수 없습니다.');
      return;
    }

    const dir = bundleDir(page.id);
    // 와일드카드(*splat)는 세그먼트 배열 → 경로로 합침. 비면 진입 파일.
    const splat = (req.params as Record<string, unknown>).splat;
    let sub = Array.isArray(splat) ? splat.join('/') : typeof splat === 'string' ? splat : '';
    sub = sub.replace(/\\/g, '/');
    if (!sub || sub.endsWith('/')) sub = page.entryFile || 'index.html';

    const abs = path.resolve(dir, sub);
    if (abs !== dir && !abs.startsWith(dir + path.sep)) {
      sendError(res, 400, '잘못된 경로입니다.');
      return;
    }
    try {
      if (!(await fs.stat(abs)).isFile()) throw new Error('not a file');
    } catch {
      sendError(res, 404, '파일을 찾을 수 없습니다.');
      return;
    }

    // ★sandbox iframe(opaque origin)에서 자산/인라인스크립트가 로드되도록, 서빙 오리진을 명시한
    //   완화 CSP로 전역 helmet 값을 대체. 격리는 iframe sandbox(allow-same-origin 미부여)가 담당.
    const origin = `${req.protocol}://${req.get('host')}`;
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // 전역 DENY 대체 → 앱이 iframe으로 임베드 가능
    res.setHeader(
      'Content-Security-Policy',
      [
        `default-src ${origin} 'unsafe-inline' 'unsafe-eval' data: blob:`,
        `img-src ${origin} data: blob: https:`,
        `media-src ${origin} data: blob: https:`,
        `font-src ${origin} data: https:`,
        `style-src ${origin} 'unsafe-inline'`,
        `script-src ${origin} 'unsafe-inline' 'unsafe-eval'`,
        `frame-ancestors 'self'`,
      ].join('; ')
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(abs);
  } catch (err) {
    logError('커스텀 페이지 번들 서빙 오류', err);
    if (!res.headersSent) sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};
