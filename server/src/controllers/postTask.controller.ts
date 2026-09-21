// 게시글의 담당자·업무 상태와 읽음 확인.

import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendServiceError } from '../utils/response';
import { postTaskService } from '../services/postTask.service';
import { postReadService } from '../services/postRead.service';
import { Post } from '../models/Post';
import { BoardManager } from '../models/BoardManager';
import { ROLES } from '../config/constants';
import {
  isWorkStatus,
  WORK_STATUSES,
  WORK_STATUS_KEYS,
  type WorkStatus,
} from '../config/workStatus';
import { postActivityService } from '../services/postActivity.service';
import { getWorkStatusLabels } from '../utils/settingsCache';

/** 상태 목록. 라벨은 관리자가 바꿀 수 있고 키는 코드가 고정한다. */
export const getWorkStatuses = async (_req: AuthRequest, res: Response): Promise<void> => {
  const custom = getWorkStatusLabels();
  sendSuccess(
    res,
    WORK_STATUS_KEYS.map(key => ({
      key,
      label: custom[key] || WORK_STATUSES[key].label,
      description: WORK_STATUSES[key].description,
    }))
  );
};

export const changeTask = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: actorId, role: actorRole, name: actorName } = req.user;
  const body = (req.body ?? {}) as { assigneeId?: unknown; workStatus?: unknown };

  // 아무것도 바꾸지 않는 요청은 성공으로 넘기지 않는다
  if (body.assigneeId === undefined && body.workStatus === undefined) {
    sendError(res, 400, '바꿀 담당자나 상태를 지정해주세요.');
    return;
  }
  if (body.workStatus !== undefined && !isWorkStatus(body.workStatus)) {
    sendError(res, 400, '업무 상태 값이 올바르지 않습니다.');
    return;
  }
  if (
    body.assigneeId !== undefined &&
    body.assigneeId !== null &&
    typeof body.assigneeId !== 'string'
  ) {
    sendError(res, 400, '담당자 id 가 올바르지 않습니다.');
    return;
  }

  try {
    const result = await postTaskService.change({
      postId: req.params.id,
      actorId,
      actorRole,
      actorName: actorName ?? actorId,
      assigneeId: body.assigneeId as string | null | undefined,
      workStatus: body.workStatus as WorkStatus | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    sendServiceError(res, err, '담당자·상태를 바꾸지 못했습니다.', {
      actorId,
      postId: req.params.id,
    });
  }
};

export const getMyTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  // 기본값은 아직 끝나지 않은 상태만
  const raw = req.query.status?.toString();
  const statuses = raw ? raw.split(',').filter(isWorkStatus) : (['todo', 'doing'] as WorkStatus[]);

  try {
    sendSuccess(res, await postTaskService.listMyTasks(userId, userRole, statuses));
  } catch (err) {
    sendServiceError(res, err, '내 업무를 불러오지 못했습니다.', { userId });
  }
};

/** GET /api/posts/:boardType/:id/readers — 작성자·게시판 담당자·관리자만 볼 수 있다. */
export const getReaders = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;

  try {
    const post = await Post.findByPk(req.params.id, { attributes: ['id', 'boardType', 'UserId'] });
    if (!post) {
      sendError(res, 404, '게시글을 찾을 수 없습니다.');
      return;
    }

    const privileged = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;
    const isAuthor = post.UserId === userId;
    const isBoardManager = privileged
      ? true
      : !!(await BoardManager.findOne({
          where: { boardId: post.boardType, userId },
          attributes: ['boardId'],
        }));

    if (!isAuthor && !isBoardManager) {
      sendError(res, 403, '읽음 확인은 작성자와 게시판 담당자만 볼 수 있습니다.');
      return;
    }

    sendSuccess(res, await postReadService.getReaders(req.params.id));
  } catch (err) {
    sendServiceError(res, err, '읽음 확인을 불러오지 못했습니다.', { userId });
  }
};

/** GET /api/posts/:boardType/:id/activity — 글을 볼 수 있으면 기록도 볼 수 있다. */
export const getActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const { boardType, id } = req.params;

  try {
    sendSuccess(res, await postActivityService.list(id, boardType, userId, userRole));
  } catch (err) {
    sendServiceError(res, err, '활동 기록을 불러오지 못했습니다.', { userId, postId: id });
  }
};
