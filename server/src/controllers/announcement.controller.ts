// server/src/controllers/announcement.controller.ts
import { Response } from 'express';
import { Op } from 'sequelize';
import { FlatRequest as Request, type AuthRequest } from '../types/auth-request';
import { Announcement } from '../models/Announcement';
import { sendSuccess, sendError, sendValidationError } from '../utils/response';
import { logError } from '../utils/logger';

const MAX_CONTENT = 20_000;

// 사용자 — 현재 게시 중인 공지 (isActive + startAt<=now + (endAt null || endAt>=now))
export const listActiveAnnouncements = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const items = await Announcement.findAll({
      where: {
        isActive: true,
        startAt: { [Op.lte]: now },
        [Op.or]: [{ endAt: null }, { endAt: { [Op.gte]: now } }],
      },
      attributes: ['id', 'title', 'content', 'startAt', 'endAt', 'isPinned'],
      order: [
        ['isPinned', 'DESC'],
        ['startAt', 'DESC'],
      ],
      limit: 20,
    });
    sendSuccess(res, items);
  } catch (err) {
    logError('공지 조회 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 전체
export const adminListAnnouncements = async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await Announcement.findAll({
      order: [
        ['isPinned', 'DESC'],
        ['startAt', 'DESC'],
      ],
    });
    sendSuccess(res, items);
  } catch (err) {
    logError('공지 관리 목록 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

interface Parsed {
  title: string;
  content: string;
  startAt: Date;
  endAt: Date | null;
}

function validatePayload(res: Response, body: Record<string, unknown>): Parsed | null {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content : '';
  if (!title) {
    sendValidationError(res, 'title', '제목을 입력해주세요.');
    return null;
  }
  if (content.length > MAX_CONTENT) {
    sendValidationError(res, 'content', '내용이 너무 깁니다.');
    return null;
  }
  const startAt = body.startAt ? new Date(body.startAt as string) : new Date();
  if (Number.isNaN(startAt.getTime())) {
    sendValidationError(res, 'startAt', '게시 시작일이 올바르지 않습니다.');
    return null;
  }
  let endAt: Date | null = null;
  if (body.endAt) {
    endAt = new Date(body.endAt as string);
    if (Number.isNaN(endAt.getTime())) {
      sendValidationError(res, 'endAt', '게시 종료일이 올바르지 않습니다.');
      return null;
    }
    if (endAt < startAt) {
      sendValidationError(res, 'endAt', '종료일은 시작일 이후여야 합니다.');
      return null;
    }
  }
  return { title, content, startAt, endAt };
}

// 관리자 — 생성
export const createAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const p = validatePayload(res, req.body);
    if (!p) return;
    const item = await Announcement.create({
      title: p.title,
      content: p.content,
      startAt: p.startAt,
      endAt: p.endAt,
      isActive: req.body.isActive !== false,
      isPinned: req.body.isPinned === true,
      createdBy: authReq.user?.id ?? 'admin',
    });
    sendSuccess(res, item, '공지를 등록했습니다.');
  } catch (err) {
    logError('공지 생성 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 수정
export const updateAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await Announcement.findByPk(req.params.id);
    if (!item) {
      sendError(res, 404, '공지를 찾을 수 없습니다.');
      return;
    }
    const p = validatePayload(res, req.body);
    if (!p) return;
    item.title = p.title;
    item.content = p.content;
    item.startAt = p.startAt;
    item.endAt = p.endAt;
    if (typeof req.body.isActive === 'boolean') item.isActive = req.body.isActive;
    if (typeof req.body.isPinned === 'boolean') item.isPinned = req.body.isPinned;
    await item.save();
    sendSuccess(res, item, '공지를 수정했습니다.');
  } catch (err) {
    logError('공지 수정 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};

// 관리자 — 삭제
export const deleteAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const item = await Announcement.findByPk(req.params.id);
    if (!item) {
      sendError(res, 404, '공지를 찾을 수 없습니다.');
      return;
    }
    await item.destroy();
    sendSuccess(res, null, '공지를 삭제했습니다.');
  } catch (err) {
    logError('공지 삭제 오류', err);
    sendError(res, 500, '서버 오류가 발생했습니다.');
  }
};
