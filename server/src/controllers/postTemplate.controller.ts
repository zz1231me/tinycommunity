// 글 템플릿. 관리자가 만들고, 쓰는 사람은 글쓰기에서 골라 제목·본문을 미리 채운다.
//
// 본문은 관리자가 넣더라도 글과 같은 자리에서 그려지므로 저장 전에 글과 똑같이 씻는다.
// 관리자 계정이 넘어갔을 때 템플릿이 스크립트 심는 구멍이 되지 않게 한다.

import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types/auth-request';
import { PostTemplate } from '../models/PostTemplate';
import Board from '../models/Board';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { sanitizeHtmlContent } from '../utils/contentRenderer';
import { auditLogService } from '../services/auditLog.service';
import { getAccessibleBoardTypes } from '../services/accessibleBoards';

const MAX_NAME = 100;
const MAX_DESCRIPTION = 300;
const MAX_TITLE = 200;
/** 본문 상한. 글 본문 상한과 달리 템플릿은 틀이라 길 이유가 없다. */
const MAX_CONTENT = 100_000;

interface Parsed {
  name: string;
  description: string | null;
  boardType: string | null;
  title: string | null;
  content: string;
  order: number;
  isActive: boolean;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.length > max ? null : trimmed;
}

/** 보낸 값을 검사한다. 문제가 있으면 문구를, 아니면 저장할 값을 돌려준다. */
async function parseBody(body: unknown): Promise<{ data: Parsed } | { error: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: '템플릿 내용을 보내주세요.' };
  }
  const b = body as Record<string, unknown>;

  const name = str(b.name, MAX_NAME);
  if (!name) return { error: `이름은 1~${MAX_NAME}자여야 합니다.` };

  if (typeof b.content !== 'string' || b.content.trim().length === 0) {
    return { error: '본문을 비워 둘 수 없습니다.' };
  }
  if (b.content.length > MAX_CONTENT) {
    return { error: `본문이 너무 깁니다(${MAX_CONTENT}자까지).` };
  }

  const description =
    b.description === undefined || b.description === null || b.description === ''
      ? null
      : str(b.description, MAX_DESCRIPTION);
  if (b.description && description === null) {
    return { error: `설명은 ${MAX_DESCRIPTION}자까지입니다.` };
  }

  const title =
    b.title === undefined || b.title === null || b.title === '' ? null : str(b.title, MAX_TITLE);
  if (b.title && title === null) return { error: `미리 넣을 제목은 ${MAX_TITLE}자까지입니다.` };

  let boardType: string | null = null;
  if (b.boardType !== undefined && b.boardType !== null && b.boardType !== '') {
    if (typeof b.boardType !== 'string') return { error: '게시판 값이 올바르지 않습니다.' };
    const board = await Board.findByPk(b.boardType, { attributes: ['id'] });
    if (!board) return { error: '게시판을 찾을 수 없습니다.' };
    boardType = b.boardType;
  }

  const order = Number.isInteger(b.order) ? (b.order as number) : 0;
  const isActive = b.isActive === undefined ? true : b.isActive === true;

  return {
    data: {
      name,
      description,
      boardType,
      title,
      // 글 본문과 같은 규칙으로 씻는다
      content: sanitizeHtmlContent(b.content),
      order,
      isActive,
    },
  };
}

/** GET /api/post-templates?boardType=x — 쓰는 사람이 고를 수 있는 템플릿 */
export const listTemplates = async (req: Request, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = (req as AuthRequest).user;
  const boardType = typeof req.query.boardType === 'string' ? req.query.boardType : null;
  try {
    // 읽을 수 없는 게시판 전용 템플릿은 목록에도 올리지 않는다(이름만으로도 내부 사정이 보인다).
    const accessible = await getAccessibleBoardTypes(userId, userRole);
    const rows = await PostTemplate.findAll({
      where: {
        isActive: true,
        ...(boardType
          ? { boardType: { [Op.or]: [null, boardType] } }
          : { boardType: { [Op.or]: [null, { [Op.in]: accessible }] } }),
      },
      attributes: ['id', 'name', 'description', 'boardType', 'title', 'content'],
      order: [
        ['order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    const visible = rows.filter(r => !r.boardType || accessible.includes(r.boardType));
    sendSuccess(res, visible);
  } catch (err) {
    logError('템플릿 목록 조회 실패', err, { userId });
    sendError(res, 500, '템플릿을 불러오지 못했습니다.');
  }
};

/** GET /api/admin/post-templates — 관리자 목록(끈 것까지) */
export const listTemplatesForAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(
      res,
      await PostTemplate.findAll({
        order: [
          ['order', 'ASC'],
          ['id', 'ASC'],
        ],
      })
    );
  } catch (err) {
    logError('템플릿 관리 목록 조회 실패', err);
    sendError(res, 500, '템플릿을 불러오지 못했습니다.');
  }
};

export const createTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = await parseBody(req.body);
  if ('error' in parsed) return sendError(res, 400, parsed.error);
  try {
    const row = await PostTemplate.create({ ...parsed.data, createdBy: req.user.id });
    await auditLogService.createAuditLog({
      actorId: req.user.id,
      actorName: req.user.name ?? req.user.id,
      action: 'update_site_settings',
      targetType: 'setting',
      targetId: `post-template:${row.id}`,
      targetName: `글 템플릿 (${row.name})`,
      afterValue: { name: row.name, boardType: row.boardType },
      ipAddress: req.ip ?? null,
    });
    sendSuccess(res, row, '템플릿을 만들었습니다.', 201);
  } catch (err) {
    logError('템플릿 생성 실패', err, { adminId: req.user.id });
    sendError(res, 500, '템플릿을 만들지 못했습니다.');
  }
};

export const updateTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = await parseBody(req.body);
  if ('error' in parsed) return sendError(res, 400, parsed.error);
  try {
    const row = await PostTemplate.findByPk(req.params.id);
    if (!row) return sendError(res, 404, '템플릿을 찾을 수 없습니다.');
    await row.update(parsed.data);
    sendSuccess(res, row, '템플릿을 저장했습니다.');
  } catch (err) {
    logError('템플릿 수정 실패', err, { adminId: req.user.id, id: req.params.id });
    sendError(res, 500, '템플릿을 저장하지 못했습니다.');
  }
};

export const deleteTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await PostTemplate.findByPk(req.params.id);
    if (!row) return sendError(res, 404, '템플릿을 찾을 수 없습니다.');
    await row.destroy();
    sendSuccess(res, { id: Number(req.params.id) }, '템플릿을 지웠습니다.');
  } catch (err) {
    logError('템플릿 삭제 실패', err, { adminId: req.user.id, id: req.params.id });
    sendError(res, 500, '템플릿을 지우지 못했습니다.');
  }
};
