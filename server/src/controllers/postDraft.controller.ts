import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendServiceError } from '../utils/response';
import { postDraftService } from '../services/postDraft.service';

export const listDrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    sendSuccess(res, await postDraftService.list(userId));
  } catch (err) {
    sendServiceError(res, err, '임시저장 목록을 불러오지 못했습니다.', { userId });
  }
};

export const getDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    sendSuccess(res, await postDraftService.get(req.params.id, userId));
  } catch (err) {
    sendServiceError(res, err, '임시저장을 불러오지 못했습니다.', {
      userId,
      draftId: req.params.id,
    });
  }
};

export const createDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  const boardType = String(req.body?.boardType ?? '').trim();
  const title = String(req.body?.title ?? '');
  const content = String(req.body?.content ?? '');

  if (!boardType) {
    sendError(res, 400, '게시판을 지정해주세요.');
    return;
  }

  try {
    sendSuccess(
      res,
      await postDraftService.create(userId, boardType, title, content),
      undefined,
      201
    );
  } catch (err) {
    sendServiceError(res, err, '임시저장에 실패했습니다.', { userId, boardType });
  }
};

export const updateDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    const saved = await postDraftService.update(
      req.params.id,
      userId,
      String(req.body?.title ?? ''),
      String(req.body?.content ?? '')
    );
    sendSuccess(res, saved);
  } catch (err) {
    sendServiceError(res, err, '임시저장에 실패했습니다.', { userId, draftId: req.params.id });
  }
};

export const deleteDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    await postDraftService.remove(req.params.id, userId);
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendServiceError(res, err, '임시저장 삭제에 실패했습니다.', { userId, draftId: req.params.id });
  }
};
