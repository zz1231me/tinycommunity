// server/src/routes/announcement.routes.ts
import { Router, RequestHandler } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import {
  listActiveAnnouncements,
  adminListAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../controllers/announcement.controller';

const router = Router();

router.use(authenticate as RequestHandler);

// 사용자 — 현재 게시 중인 공지
router.get('/', listActiveAnnouncements);

// 관리자
router.get('/admin', isAdmin as RequestHandler, adminListAnnouncements);
router.post('/', isAdmin as RequestHandler, createAnnouncement);
router.put('/:id', isAdmin as RequestHandler, updateAnnouncement);
router.delete('/:id', isAdmin as RequestHandler, deleteAnnouncement);

export default router;
