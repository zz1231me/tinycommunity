import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import {
  sendSuccess,
  sendError,
  sendValidationError,
  sendForbidden,
  sendNotFound,
} from '../utils/response';
import { logError } from '../utils/logger';
import { tagService } from '../services/tag.service';
import { AppError } from '../middlewares/error.middleware';
import { Post } from '../models/Post';
import { Board } from '../models/Board';
import { Tag } from '../models/Tag';
import { boardManagerService } from '../services/boardManager.service';

// HEX 색상: 3자리(#fff) 또는 6자리(#3b82f6)만 허용
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * 태그 관리 인가 — 전역 태그(boardId=null)는 admin만, 게시판 태그는 admin/manager/해당 게시판 담당자.
 * 통과하면 true, 실패 시 응답을 보내고 false 반환.
 */
async function ensureTagManagePermission(
  req: AuthRequest,
  res: Response,
  boardId: string | null
): Promise<boolean> {
  const userId = req.user?.id ?? '';
  const role = req.user?.role ?? 'guest';
  if (boardId === null) {
    if (role !== 'admin') {
      sendForbidden(res, '전역(공용) 태그는 관리자만 관리할 수 있습니다.');
      return false;
    }
    return true;
  }
  const ok = await boardManagerService.canManage(boardId, userId, role);
  if (!ok) {
    sendForbidden(res, '이 게시판의 태그를 관리할 권한이 없습니다.');
    return false;
  }
  return true;
}

export const getTags = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // ?boardId=xxx → 해당 게시판 태그, ?boardId=null → 공용 태그, 없으면 전체
    const rawBoardId = req.query.boardId;
    const boardId =
      rawBoardId === undefined
        ? undefined
        : rawBoardId === 'null' || rawBoardId === ''
          ? null
          : String(rawBoardId);
    const tags = await tagService.getAllTags(boardId);
    sendSuccess(res, tags);
  } catch (err) {
    logError('태그 목록 조회 실패', err);
    sendError(res, 500, '태그 조회 중 오류가 발생했습니다.');
  }
};

export const createTag = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, color, description, boardId } = req.body;
  if (!name || !String(name).trim())
    return sendValidationError(res, 'name', '태그 이름은 필수입니다.');
  if (String(name).trim().length > 50)
    return sendValidationError(res, 'name', '태그 이름은 50자를 초과할 수 없습니다.');
  if (color !== undefined && !HEX_COLOR_REGEX.test(color)) {
    return sendValidationError(res, 'color', '유효한 HEX 색상 코드를 입력하세요. (예: #3b82f6)');
  }
  if (description !== undefined && String(description).length > 500) {
    return sendValidationError(res, 'description', '태그 설명은 500자를 초과할 수 없습니다.');
  }
  const resolvedBoardId =
    boardId === undefined || boardId === null || boardId === '' ? null : String(boardId);
  try {
    // boardId가 지정된 경우 해당 게시판 존재 여부 확인
    if (resolvedBoardId !== null) {
      const board = await Board.findByPk(resolvedBoardId, { attributes: ['id'] });
      if (!board) return sendNotFound(res, '게시판');
    }
    // 인가: 전역 태그는 admin, 게시판 태그는 admin/manager/담당자
    if (!(await ensureTagManagePermission(req, res, resolvedBoardId))) return;
    const tag = await tagService.createTag({ name, color, description, boardId: resolvedBoardId });
    sendSuccess(res, tag, '태그가 생성되었습니다.', 201);
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('태그 생성 실패', err);
    sendError(res, 500, '태그 생성 중 오류가 발생했습니다.');
  }
};

export const updateTag = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendValidationError(res, 'id', '잘못된 태그 ID입니다.');
  const { name, color, description } = req.body;
  if (name !== undefined && String(name).trim().length > 50) {
    return sendValidationError(res, 'name', '태그 이름은 50자를 초과할 수 없습니다.');
  }
  if (color !== undefined && !HEX_COLOR_REGEX.test(color)) {
    return sendValidationError(res, 'color', '유효한 HEX 색상 코드를 입력하세요. (예: #3b82f6)');
  }
  if (description !== undefined && String(description).length > 500) {
    return sendValidationError(res, 'description', '태그 설명은 500자를 초과할 수 없습니다.');
  }
  try {
    // 대상 태그의 boardId 기준으로 인가
    const target = await Tag.findByPk(id, { attributes: ['id', 'boardId'] });
    if (!target) return sendNotFound(res, '태그');
    if (!(await ensureTagManagePermission(req, res, target.boardId ?? null))) return;
    const tag = await tagService.updateTag(id, { name, color, description });
    sendSuccess(res, tag);
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('태그 수정 실패', err, { tagId: id });
    sendError(res, 500, '태그 수정 중 오류가 발생했습니다.');
  }
};

export const deleteTag = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendValidationError(res, 'id', '잘못된 태그 ID입니다.');
  try {
    const target = await Tag.findByPk(id, { attributes: ['id', 'boardId'] });
    if (!target) return sendNotFound(res, '태그');
    if (!(await ensureTagManagePermission(req, res, target.boardId ?? null))) return;
    await tagService.deleteTag(id);
    sendSuccess(res, null, '태그가 삭제되었습니다.');
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('태그 삭제 실패', err, { tagId: id });
    sendError(res, 500, '태그 삭제 중 오류가 발생했습니다.');
  }
};

export const addPostTags = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: postId } = req.params;
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds)) return sendError(res, 400, 'tagIds 배열이 필요합니다.');
  if (!tagIds.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)) {
    return sendError(res, 400, 'tagIds는 양의 정수 배열이어야 합니다.');
  }
  if (tagIds.length > 20) {
    return sendError(res, 400, '태그는 최대 20개까지 설정할 수 있습니다.');
  }
  try {
    const post = await Post.findByPk(postId, { attributes: ['id', 'UserId'] });
    if (!post) return sendNotFound(res, '게시글');
    const userId = req.user?.id;
    const userRole = req.user?.role ?? 'guest';
    const isAdminOrManager = userRole === 'admin' || userRole === 'manager';
    if (!isAdminOrManager && post.UserId !== userId) {
      return sendForbidden(res, '본인의 게시글에만 태그를 설정할 수 있습니다.');
    }
    await tagService.addTagsToPost(postId, tagIds);
    sendSuccess(res, null, '태그가 저장되었습니다.');
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('게시글 태그 저장 실패', err, { postId });
    sendError(res, 500, '태그 저장 중 오류가 발생했습니다.');
  }
};

export const getPostTags = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { boardType, id } = req.params;
    // boardType 교차 검증: 미들웨어(checkReadAccess)는 :boardType만 검증하므로, 다른 게시판
    // 읽기 권한으로 임의 게시글의 태그를 읽는 IDOR을 막기 위해 게시글이 해당 게시판 소속인지 확인
    const post = await Post.findByPk(id, { attributes: ['id', 'boardType'] });
    if (!post || post.boardType !== boardType) {
      sendNotFound(res, '게시글');
      return;
    }
    const tags = await tagService.getTagsForPost(id);
    sendSuccess(res, tags);
  } catch (err) {
    logError('게시글 태그 조회 실패', err, { postId: req.params.id });
    sendError(res, 500, '태그 조회 중 오류가 발생했습니다.');
  }
};
