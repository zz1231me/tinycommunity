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

// 업무 일정으로 말이 되는 해. 날짜 칸에 연도를 치는 도중의 0002년 같은 값이 저장되지 않게 한다.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** 넘기지 않음·null·실제로 있는 날짜만 받는다. 2026-02-30 같은 값은 DB 마다 다르게 저장된다. */
function isDateOnlyOrNull(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

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
  const body = (req.body ?? {}) as {
    assigneeId?: unknown;
    workStatus?: unknown;
    startDate?: unknown;
    dueDate?: unknown;
    ifWorkStatus?: unknown;
  };

  // 아무것도 바꾸지 않는 요청은 성공으로 넘기지 않는다
  if (
    body.assigneeId === undefined &&
    body.workStatus === undefined &&
    body.startDate === undefined &&
    body.dueDate === undefined
  ) {
    sendError(res, 400, '바꿀 담당자나 상태를 지정해주세요.');
    return;
  }
  if (!isDateOnlyOrNull(body.startDate) || !isDateOnlyOrNull(body.dueDate)) {
    sendError(res, 400, `날짜는 ${MIN_YEAR}~${MAX_YEAR}년 사이의 YYYY-MM-DD 여야 합니다.`);
    return;
  }
  if (body.ifWorkStatus !== undefined && !isWorkStatus(body.ifWorkStatus)) {
    sendError(res, 400, '업무 상태 값이 올바르지 않습니다.');
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
      boardType: req.params.boardType,
      actorId,
      actorRole,
      actorName: actorName ?? actorId,
      assigneeId: body.assigneeId as string | null | undefined,
      workStatus: body.workStatus as WorkStatus | undefined,
      startDate: body.startDate as string | null | undefined,
      dueDate: body.dueDate as string | null | undefined,
      ifWorkStatus: body.ifWorkStatus as WorkStatus | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    sendServiceError(res, err, '담당자·상태를 바꾸지 못했습니다.', {
      actorId,
      postId: req.params.id,
    });
  }
};

/** ?status=todo,doing. 기본값은 아직 끝나지 않은 상태만 */
function parseStatuses(req: AuthRequest): WorkStatus[] {
  const raw = req.query.status?.toString();
  return raw ? raw.split(',').filter(isWorkStatus) : (['todo', 'doing'] as WorkStatus[]);
}

export const getMyTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  try {
    sendSuccess(res, await postTaskService.listMyTasks(userId, userRole, parseStatuses(req)));
  } catch (err) {
    sendServiceError(res, err, '내 업무를 불러오지 못했습니다.', { userId });
  }
};

/** GET /api/posts/tasks/board/:boardType — 게시판 업무 전체. 읽기 권한은 라우터가 확인한다. */
export const getBoardTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  try {
    sendSuccess(
      res,
      await postTaskService.listBoardTasks(
        req.params.boardType,
        userId,
        userRole,
        parseStatuses(req)
      )
    );
  } catch (err) {
    sendServiceError(res, err, '게시판 업무를 불러오지 못했습니다.', {
      userId,
      boardType: req.params.boardType,
    });
  }
};

/** GET /api/posts/tasks/boards — 팀 보기에서 고를 업무용 게시판 */
export const getTaskBoards = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  try {
    sendSuccess(res, await postTaskService.listTaskBoards(userId, userRole));
  } catch (err) {
    sendServiceError(res, err, '업무용 게시판을 불러오지 못했습니다.', { userId });
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
