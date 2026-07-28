// server/src/controllers/customPage.controller.ts
// 관리자 커스텀 HTML 페이지 CRUD + 사용자용 조회.
// 저장 html은 원문 그대로(새니타이즈 X) — 클라이언트가 sandbox iframe으로 격리 렌더한다.
import { Response } from 'express';
import { FlatRequest as Request, type AuthRequest } from '../types/auth-request';
import { CustomPage } from '../models/CustomPage';
import { sendSuccess, sendError, sendValidationError } from '../utils/response';
import { logError } from '../utils/logger';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_HTML = 500_000; // 원문 HTML 상한 (~500KB)

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
    await page.destroy();
    sendSuccess(res, null, '페이지를 삭제했습니다.');
  } catch (err) {
    logError('커스텀 페이지 삭제 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};
