import { Router, RequestHandler } from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  getPasswordResetRequests,
  dismissPasswordResetRequest,
  approveUser,
  rejectUser,
  deactivateUser,
  restoreUser,
  getDeletedUsers,
  getAllBoards,
  createBoard,
  updateBoard,
  reorderBoards,
  deleteBoard,
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getBoardAccessPermissions,
  getAllBoardAccessPermissions,
  setBoardAccessPermissions,
  getAllEvents,
  deleteEventAsAdmin,
  updateEventAsAdmin,
  getEventPermissionsByRole,
  setEventPermissions,
  getWikiPermissions,
  setWikiPermissions,
  exportUsersExcel,
  exportSecurityLogsExcel,
} from '../controllers/admin.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import { ipWhitelistMiddleware } from '../middlewares/ipWhitelistMiddleware';
import { validateUuidParam, validateBody } from '../middlewares/validate.middleware';
import { getSecurityLogs, deleteSecurityLogs } from '../controllers/securityLog.controller';
import { getErrorLogs, deleteErrorLogs } from '../controllers/errorLog.controller';
import { getLoginHistory, getGlobalLoginHistory } from '../controllers/loginHistory.controller';
import { getAuditLogs, getUserAuditLogs } from '../controllers/auditLog.controller';
import { getUserSessions, forceLogoutSession } from '../controllers/userSession.controller';
import { getAdminStats } from '../controllers/stats.controller';
import { getFeatureCatalog, updateFeatures } from '../controllers/featureFlag.controller';
import tagRoutes from './tag.routes';
import {
  getAttendanceRecords,
  getAttendanceToday,
  getAttendanceSummary,
  getAttendanceSettings,
  createAttendanceChecklistItem,
  updateAttendanceChecklistItem,
  deleteAttendanceChecklistItem,
  reorderAttendanceChecklist,
  updateAttendancePolicy,
} from '../controllers/attendance.controller';
import { getPointAttackLog } from '../controllers/pointAttack.controller';
import {
  attendanceChecklistCreateSchema,
  attendanceChecklistUpdateSchema,
  attendancePolicySchema,
  attendanceReorderSchema,
} from '../validators/schemas';
import {
  getIpRules,
  getStats as getIpStats,
  addIpRule,
  patchIpRule,
  removeIpRule,
} from '../controllers/ipRule.controller';

const router = Router();

// 인증, 관리자 권한, IP 제한, Rate limit 체크
router.use(
  authenticate as RequestHandler,
  isAdmin as RequestHandler,
  ipWhitelistMiddleware as RequestHandler
);

// 정적 라우트를 :id 라우트보다 먼저 정의해야 한다
router.get('/stats', getAdminStats as RequestHandler);

// 기능 스위치 카탈로그 조회와 일괄 저장
router.get('/features', getFeatureCatalog as RequestHandler);
router.put('/features', updateFeatures as RequestHandler);
router.get('/users', getAllUsers as RequestHandler);
router.get('/users/deleted', getDeletedUsers as RequestHandler);
router.post('/users', createUser as RequestHandler);
router.put('/users/:id', updateUser as RequestHandler);
router.delete('/users/:id', deleteUser as RequestHandler);
router.post('/users/:id/reset-password', resetPassword as RequestHandler);

// 목록에 복호화된 인증번호가 들어 있어 관리자 인증이 필수다.
router.get('/password-reset-requests', getPasswordResetRequests as RequestHandler);
router.delete(
  '/password-reset-requests/:id',
  validateUuidParam('id'),
  dismissPasswordResetRequest as RequestHandler
);
router.patch('/users/:userId/approve', approveUser as RequestHandler);
router.delete('/users/:userId/reject', rejectUser as RequestHandler);
router.patch('/users/:userId/deactivate', deactivateUser as RequestHandler);
router.post('/users/:userId/restore', restoreUser as RequestHandler);

router.get('/boards', getAllBoards as RequestHandler);
router.post('/boards', createBoard as RequestHandler);
router.put('/boards/reorder', reorderBoards as RequestHandler);
router.put('/boards/:id', updateBoard as RequestHandler);
router.delete('/boards/:id', deleteBoard as RequestHandler);
// 전체 게시판 권한 일괄 조회
router.get('/board-permissions', getAllBoardAccessPermissions as RequestHandler);
router.get('/boards/:boardId/permissions', getBoardAccessPermissions as RequestHandler);
router.put('/boards/:boardId/permissions', setBoardAccessPermissions as RequestHandler);

router.get('/roles', getAllRoles as RequestHandler);
router.post('/roles', createRole as RequestHandler);
router.put('/roles/:id', updateRole as RequestHandler);
router.delete('/roles/:id', deleteRole as RequestHandler);

// permissions 라우트를 :id 라우트보다 먼저 정의해야 한다
router.get('/events/permissions', getEventPermissionsByRole as RequestHandler);
router.put('/events/permissions', setEventPermissions as RequestHandler);
router.get('/events', getAllEvents as RequestHandler);
router.put('/events/:id', updateEventAsAdmin as RequestHandler);
router.delete('/events/:id', deleteEventAsAdmin as RequestHandler);

// 기능을 꺼도 지난 기록은 봐야 하므로 requireFeature 를 걸지 않는다.
// 정적 라우트를 :id 라우트보다 먼저 정의해야 한다.
router.get('/attendance/records', getAttendanceRecords as RequestHandler);
router.get('/point-attacks', getPointAttackLog as RequestHandler);
router.get('/attendance/today', getAttendanceToday as RequestHandler);
router.get('/attendance/summary', getAttendanceSummary as RequestHandler);
router.get('/attendance/settings', getAttendanceSettings as RequestHandler);
router.post(
  '/attendance/checklist',
  validateBody(attendanceChecklistCreateSchema),
  createAttendanceChecklistItem as RequestHandler
);
router.put(
  '/attendance/checklist/reorder',
  validateBody(attendanceReorderSchema),
  reorderAttendanceChecklist as RequestHandler
);
router.put(
  '/attendance/checklist/:id',
  validateBody(attendanceChecklistUpdateSchema),
  updateAttendanceChecklistItem as RequestHandler
);
router.delete('/attendance/checklist/:id', deleteAttendanceChecklistItem as RequestHandler);
router.put(
  '/attendance/policy',
  validateBody(attendancePolicySchema),
  updateAttendancePolicy as RequestHandler
);

router.get('/wiki/permissions', getWikiPermissions as RequestHandler);
router.put('/wiki/permissions', setWikiPermissions as RequestHandler);

router.get('/export/users', exportUsersExcel as RequestHandler);
router.get('/export/security-logs', exportSecurityLogsExcel as RequestHandler);

router.get('/security-logs', getSecurityLogs as RequestHandler);
router.delete('/security-logs', deleteSecurityLogs as RequestHandler);
router.get('/error-logs', getErrorLogs as RequestHandler);
router.delete('/error-logs', deleteErrorLogs as RequestHandler);

// 정적 라우트를 :userId 라우트보다 먼저 정의해야 한다
router.get('/login-history', getGlobalLoginHistory as RequestHandler);
router.get('/users/:userId/login-history', getLoginHistory as RequestHandler);

router.get('/audit-logs', getAuditLogs as RequestHandler);
router.get('/users/:userId/audit-logs', getUserAuditLogs as RequestHandler);

router.get('/users/:userId/sessions', getUserSessions as RequestHandler);
router.delete(
  '/users/:userId/sessions/:sessionId',
  validateUuidParam('sessionId'),
  forceLogoutSession as RequestHandler
);

router.use('/tags', tagRoutes);

router.get('/ip-rules/stats', getIpStats as RequestHandler);
router.get('/ip-rules', getIpRules as RequestHandler);
router.post('/ip-rules', addIpRule as RequestHandler);
router.patch('/ip-rules/:id', validateUuidParam('id'), patchIpRule as RequestHandler);
router.delete('/ip-rules/:id', validateUuidParam('id'), removeIpRule as RequestHandler);

export default router;
