// server/src/controllers/bookmark.controller.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import Bookmark from '../models/Bookmark';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/response';
import { sequelize } from '../config/sequelize';

function normalizeAndValidateUrl(url: string): { ok: boolean; url?: string; error?: string } {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: '유효하지 않은 URL입니다. http 또는 https URL만 허용됩니다.' };
    }
    return { ok: true, url: normalized };
  } catch {
    return { ok: false, error: '유효하지 않은 URL 형식입니다.' };
  }
}

/** GET /api/bookmarks - 일반 사용자용 */
export const getBookmarks = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bookmarks = await Bookmark.findAll({
      where: { isActive: true },
      order: [
        ['order', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      attributes: ['id', 'name', 'url', 'icon', 'order'],
    });
    sendSuccess(res, bookmarks);
  } catch (error) {
    next(error);
  }
};

/** GET /api/admin/bookmarks - 관리자용 (비활성 포함) */
export const getAllBookmarks = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bookmarks = await Bookmark.findAll({
      order: [
        ['order', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    sendSuccess(res, bookmarks);
  } catch (error) {
    next(error);
  }
};

/** POST /api/admin/bookmarks */
export const createBookmark = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, url, icon, order } = req.body;

    if (!name || !url) {
      sendValidationError(res, 'name/url', '이름과 URL은 필수입니다.');
      return;
    }

    if (String(name).trim().length > 100) {
      sendValidationError(res, 'name', '북마크 이름은 100자를 초과할 수 없습니다.');
      return;
    }

    const urlResult = normalizeAndValidateUrl(url);
    if (!urlResult.ok) {
      sendValidationError(res, 'url', urlResult.error!);
      return;
    }
    const normalizedUrl = urlResult.url!;

    // 파비콘 미사용 — google favicon 자동 생성이 일부 도메인에서 404를 유발해 제거함
    const faviconUrl = icon ?? null;

    // order가 명시적으로 주어지지 않은 경우 Sequelize .max()로 계산
    // — dialect-aware 인용 부호(MySQL/PG/SQLite 공통)
    let orderExpr: number;
    if (order !== undefined && order !== null) {
      orderExpr = order as number;
    } else {
      const maxOrder = (await Bookmark.max('order')) as number | null;
      orderExpr = (maxOrder ?? 0) + 1;
    }

    const bookmark = await Bookmark.create({
      name: name.trim(),
      url: normalizedUrl,
      icon: faviconUrl,
      order: orderExpr,
      isActive: true,
    });

    sendSuccess(res, bookmark, '북마크가 생성되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

/** PUT /api/admin/bookmarks/:id */
export const updateBookmark = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, url, icon, order, isActive } = req.body;

    const bookmark = await Bookmark.findByPk(id);
    if (!bookmark) {
      sendNotFound(res, '북마크');
      return;
    }

    if (name && String(name).trim().length > 100) {
      sendValidationError(res, 'name', '북마크 이름은 100자를 초과할 수 없습니다.');
      return;
    }

    if (order !== undefined && (!Number.isInteger(order) || order < 0 || order > 2_147_483_647)) {
      sendValidationError(res, 'order', '순서는 0 이상의 정수여야 합니다.');
      return;
    }

    let normalizedUrl = url;
    if (url) {
      const urlResult = normalizeAndValidateUrl(url);
      if (!urlResult.ok) {
        sendValidationError(res, 'url', urlResult.error!);
        return;
      }
      normalizedUrl = urlResult.url!;
    }

    await bookmark.update({
      name: name?.trim() || bookmark.name,
      url: normalizedUrl || bookmark.url,
      icon: icon !== undefined ? icon : bookmark.icon,
      order: order !== undefined ? order : bookmark.order,
      isActive: isActive !== undefined ? isActive : bookmark.isActive,
    });

    sendSuccess(res, bookmark, '북마크가 수정되었습니다.');
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/admin/bookmarks/:id */
export const deleteBookmark = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const bookmark = await Bookmark.findByPk(id);
    if (!bookmark) {
      sendNotFound(res, '북마크');
      return;
    }

    await bookmark.destroy();
    sendSuccess(res, null, '북마크가 삭제되었습니다.');
  } catch (error) {
    next(error);
  }
};

/** PUT /api/admin/bookmarks/reorder */
export const reorderBookmarks = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { bookmarks } = req.body;

    if (!Array.isArray(bookmarks) || bookmarks.length > 500) {
      sendError(res, 400, '북마크 목록이 올바르지 않습니다. (최대 500개)');
      return;
    }

    if (
      bookmarks.some(
        b => !b.id || !Number.isInteger(b.order) || b.order < 0 || b.order > 2_147_483_647
      )
    ) {
      sendError(
        res,
        400,
        '잘못된 요청 형식입니다. 각 북마크는 유효한 id와 order(0 이상 정수)를 포함해야 합니다.'
      );
      return;
    }

    await sequelize.transaction(async t => {
      await Promise.all(
        bookmarks.map(({ id, order }: { id: number; order: number }) =>
          Bookmark.update({ order }, { where: { id }, transaction: t })
        )
      );
    });

    sendSuccess(res, null, '북마크 순서가 변경되었습니다.');
  } catch (error) {
    next(error);
  }
};
