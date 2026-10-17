// 저장된 업무 필터. 사람마다 자기 것만 보고, 자기 것만 고치고 지운다.
//
// 거르는 일은 화면이 한다. 여기서는 조건을 아는 모양으로 깎아 맡아 둘 뿐이다.

import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { TaskFilterPreset } from '../models/TaskFilterPreset';
import { MAX_PRESETS, sanitizePreset } from '../config/taskFilterPreset';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

const view = (row: TaskFilterPreset) => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  query: row.query,
  boardType: row.boardType,
  due: row.due,
  priority: row.priority,
  sort: row.sort,
});

/** GET /api/users/me/task-filters */
export const listTaskFilters = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await TaskFilterPreset.findAll({
      where: { userId: req.user.id },
      order: [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    sendSuccess(res, rows.map(view));
  } catch (err) {
    logError('저장된 필터 조회 실패', err, { userId: req.user.id });
    sendError(res, 500, '저장된 필터를 불러오지 못했습니다.');
  }
};

/** POST /api/users/me/task-filters — 같은 이름이면 덮어쓴다(화면의 '이 이름으로 저장'과 같게) */
export const createTaskFilter = async (req: AuthRequest, res: Response): Promise<void> => {
  const input = sanitizePreset(req.body);
  if (!input) {
    sendError(res, 400, '필터 이름을 적어주세요.');
    return;
  }

  try {
    const existing = await TaskFilterPreset.findOne({
      where: { userId: req.user.id, name: input.name },
    });
    if (existing) {
      await existing.update(input);
      sendSuccess(res, view(existing));
      return;
    }

    const count = await TaskFilterPreset.count({ where: { userId: req.user.id } });
    if (count >= MAX_PRESETS) {
      sendError(res, 400, `저장된 필터는 ${MAX_PRESETS}개까지 둘 수 있습니다.`);
      return;
    }

    const row = await TaskFilterPreset.create({ ...input, userId: req.user.id });
    sendSuccess(res, view(row), '필터를 저장했습니다.', 201);
  } catch (err) {
    logError('저장된 필터 저장 실패', err, { userId: req.user.id });
    sendError(res, 500, '필터를 저장하지 못했습니다.');
  }
};

/** DELETE /api/users/me/task-filters/:id */
export const deleteTaskFilter = async (req: AuthRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    sendError(res, 400, '잘못된 주소입니다.');
    return;
  }

  try {
    // 남의 것은 없는 것처럼 답한다 — 번호로 남의 필터 존재를 떠볼 수 없게.
    const removed = await TaskFilterPreset.destroy({ where: { id, userId: req.user.id } });
    if (removed === 0) {
      sendError(res, 404, '저장된 필터를 찾을 수 없습니다.');
      return;
    }
    sendSuccess(res, null, '필터를 지웠습니다.');
  } catch (err) {
    logError('저장된 필터 삭제 실패', err, { userId: req.user.id, id });
    sendError(res, 500, '필터를 지우지 못했습니다.');
  }
};
