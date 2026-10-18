import express, { RequestHandler } from 'express';
import {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  skipOccurrence,
  editOccurrence,
} from '../controllers/event.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { checkEventPermission } from '../middlewares/eventPermission.middleware';

const router = express.Router();

// EventPermission 기반 권한 체크 사용
router.post(
  '/',
  authenticate as RequestHandler,
  checkEventPermission('create') as RequestHandler,
  createEvent as RequestHandler
);

router.get(
  '/',
  authenticate as RequestHandler,
  checkEventPermission('read') as RequestHandler,
  getEvents as RequestHandler
);

// update/delete: 컨트롤러에서 소유자 vs canUpdate/canDelete 권한을 함께 처리하므로
// 여기서 checkEventPermission을 적용하면 소유자가 자기 이벤트를 수정/삭제할 수 없게 됨
router.put('/:id', authenticate as RequestHandler, updateEvent as RequestHandler);

router.delete('/:id', authenticate as RequestHandler, deleteEvent as RequestHandler);

/**
 * @openapi
 * /api/events/{id}/occurrences/{date}:
 *   delete:
 *     tags: [Events]
 *     summary: 반복 중 그 날 하루만 건너뛴다 (규칙은 그대로)
 *     security: [{ cookieAuth: [] }]
 */
router.delete(
  '/:id/occurrences/:date',
  authenticate as RequestHandler,
  skipOccurrence as RequestHandler
);

/**
 * @openapi
 * /api/events/{id}/occurrences/{date}:
 *   put:
 *     tags: [Events]
 *     summary: 반복 중 그 날 하루만 다르게 만든다 (규칙은 그대로)
 *     security: [{ cookieAuth: [] }]
 */
router.put(
  '/:id/occurrences/:date',
  authenticate as RequestHandler,
  editOccurrence as RequestHandler
);

export default router;
