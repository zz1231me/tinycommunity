import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import Bookmark from '../models/Bookmark';
import { sendSuccess, sendError, sendNotFound, sendValidationError } from '../utils/response';
import { sequelize } from '../config/sequelize';

/** 북마크 주소를 다듬고 검사한다. 스킴을 붙이기 전에 원문을 먼저 봐야 검사가 무력해지지 않는다. */
function normalizeAndValidateUrl(url: string): { ok: boolean; url?: string; error?: string } {
  const raw = url.trim();
  if (!raw) return { ok: false, error: '유효하지 않은 URL 형식입니다.' };

  // 콜론 뒤가 숫자뿐이면 스킴이 아니라 포트다.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) {
    return { ok: false, error: '유효하지 않은 URL입니다. http 또는 https URL만 허용됩니다.' };
  }
  // '/admin', '//host', '#frag' 는 현재 사이트 기준의 조각이라 주소가 아니다.
  if (/^[/#?]/.test(raw)) {
    return { ok: false, error: '전체 주소를 입력해주세요. (예: example.com)' };
  }

  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: '유효하지 않은 URL입니다. http 또는 https URL만 허용됩니다.' };
    }
    if (!parsed.hostname) {
      return { ok: false, error: '주소에 호스트가 없습니다. (예: example.com)' };
    }
    return { ok: true, url: parsed.toString() };
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

/** GET /api/bookmarks - 관리자용 (비활성 포함) */
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

/** POST /api/bookmarks */
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
    // url·icon 컬럼은 STRING(500) 이다.
    if (normalizedUrl.length > 500) {
      sendValidationError(res, 'url', 'URL은 500자를 초과할 수 없습니다.');
      return;
    }
    if (icon !== undefined && icon !== null && String(icon).length > 500) {
      sendValidationError(res, 'icon', '아이콘 주소는 500자를 초과할 수 없습니다.');
      return;
    }

    // 파비콘 자동 생성은 일부 도메인에서 404 가 나 쓰지 않는다.
    const faviconUrl = icon ?? null;

    // order 가 없으면 Sequelize .max() 로 계산한다.
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

/** PUT /api/bookmarks/:id */
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
      if (urlResult.url!.length > 500) {
        sendValidationError(res, 'url', 'URL은 500자를 초과할 수 없습니다.');
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

/** DELETE /api/bookmarks/:id */
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

/** PUT /api/bookmarks/reorder */
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
