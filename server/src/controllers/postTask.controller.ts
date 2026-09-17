// server/src/controllers/postTask.controller.ts
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

/**
 * 상태 목록은 화면이 라벨을 지어내지 않도록 서버가 함께 준다.
 *
 * 부르는 말은 관리자가 바꿀 수 있다(사이트 설정 › 업무 상태 이름) — 팀마다 '진행 중' 을
 * '검토 중' 이라 부르는데 그걸 바꾸려고 배포할 수는 없다. 키는 코드가 고정한다:
 * 저장된 값과 코드의 분기(예: '진행 중' 이면 담당자 자동 지정)가 이름에 흔들리면 안 된다.
 */
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

  // 아무것도 안 바꾸는 요청은 실수일 가능성이 높다 — 성공으로 넘기지 않는다
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
  // 기본은 아직 끝나지 않은 것 — 완료까지 섞이면 "내가 할 일" 이 아니게 된다
  const raw = req.query.status?.toString();
  const statuses = raw ? raw.split(',').filter(isWorkStatus) : (['todo', 'doing'] as WorkStatus[]);

  try {
    sendSuccess(res, await postTaskService.listMyTasks(userId, userRole, statuses));
  } catch (err) {
    sendServiceError(res, err, '내 업무를 불러오지 못했습니다.', { userId });
  }
};

/**
 * GET /api/posts/:boardType/:id/readers
 *
 * 누가 읽었는지는 작성자·게시판 담당자·관리자만 본다.
 * 모두에게 열면 "누가 무엇을 언제 읽었는지" 가 서로에게 드러나, 확인용 기능이
 * 감시 도구가 된다.
 */
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

/**
 * GET /api/posts/:boardType/:id/activity
 *
 * 이 글에 무슨 일이 있었는지 — 작성·수정·첨부 교체·상태·담당자 변경을 시간순으로.
 * 글을 볼 수 있으면 기록도 볼 수 있다(판정은 서비스가 getPostById 에 위임한다).
 */
export const getActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const { boardType, id } = req.params;

  try {
    sendSuccess(res, await postActivityService.list(id, boardType, userId, userRole));
  } catch (err) {
    sendServiceError(res, err, '활동 기록을 불러오지 못했습니다.', { userId, postId: id });
  }
};
