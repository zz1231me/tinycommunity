import path from 'path';
import fs from 'fs';

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';

import { authenticate } from '../middlewares/auth.middleware';
import { uploadImages } from '../middlewares/upload/image';
import { validateUploadedFile } from '../middlewares/upload/validator';
import { AuthRequest } from '../types/auth-request';
import { logError, logInfo } from '../utils/logger';
import { sendSuccess, sendError, sendNotFound, sendForbidden } from '../utils/response';
import { isAdminOrManager } from '../config/constants';
import { authorizeAttachmentAccess } from '../services/attachmentAccess.service';
import { getOrCreateThumbnail } from '../services/thumbnail.service';
import { clampText } from '../utils/clamp';

const router = Router();

const filesDir = path.join(__dirname, '../../uploads/files');
const imagesDir = path.join(__dirname, '../../uploads/images');

/**
 * 파일명 검증 + 경로 이탈 방지
 * @returns 안전한 절대경로, 검증 실패 시 null
 */
function resolveSecureFilePath(filename: string, baseDir: string): string | null {
  // Express 5 는 경로 조각을 이미 풀어서 준다. 여기서 또 풀면 '%' 한 글자에 URIError 가 난다.
  let decoded: string;
  try {
    decoded = decodeURIComponent(filename);
  } catch {
    return null;
  }
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(decoded) || decoded.includes('..')) {
    return null;
  }
  const filePath = path.join(baseDir, decoded);
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(baseDir);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return resolvedPath;
}

/** 에디터용 이미지 업로드 */
router.post(
  '/images',
  authenticate as RequestHandler,
  uploadImages.single('image'),
  validateUploadedFile() as RequestHandler, // 인라인 서빙이라 내용(magic)까지 검증한다
  asyncHandler((req, res) => {
    const authReq = req as AuthRequest;

    if (!authReq.file) {
      sendError(res, 400, '파일이 없습니다.');
      return;
    }

    const imageUrl = `/uploads/images/${authReq.file.filename}`;
    sendSuccess(res, { imageUrl });
  })
);

// 응답은 sharp 가 재인코딩한 JPEG 라 원본 바이트가 나가지 않는다.
/**
 * @swagger
 * /api/uploads/thumb/{filename}:
 *   get:
 *     summary: 첨부 이미지 썸네일
 *     description: |
 *       최대 480px JPEG. 첫 요청 시 생성해 디스크에 캐시한다.
 *       인가는 다운로드와 동일하며(게시판 읽기 권한 + 비밀글 접근),
 *       이미지가 아니거나 손상된 파일이면 404 — 호출부는 원본으로 폴백하면 된다.
 *     tags: [Uploads]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string }
 *         description: '첨부의 저장 파일명(storedName)'
 *     responses:
 *       200:
 *         description: JPEG 썸네일
 *         content:
 *           image/jpeg:
 *             schema: { type: string, format: binary }
 *       400: { description: 잘못된 파일명 }
 *       403: { description: 접근 권한 없음 }
 *       404: { description: 파일 없음 또는 썸네일 생성 불가 }
 */
router.get(
  '/thumb/:filename',
  authenticate as RequestHandler,
  asyncHandler(async (req, res) => {
    const { filename } = req.params as Record<string, string>;

    const resolvedFilePath = resolveSecureFilePath(filename, filesDir);
    if (!resolvedFilePath) {
      sendError(res, 400, '잘못된 파일명입니다.');
      return;
    }
    if (!fs.existsSync(resolvedFilePath)) {
      sendNotFound(res, '파일');
      return;
    }

    const savedFilename = path.basename(resolvedFilePath);
    const authReq = req as AuthRequest;
    const access = await authorizeAttachmentAccess(
      savedFilename,
      authReq.user.id,
      authReq.user.role
    );
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }

    const thumbPath = await getOrCreateThumbnail(resolvedFilePath, savedFilename);
    if (!thumbPath) {
      // 이미지가 아니거나 손상된 파일이면 클라이언트가 원본으로 폴백한다.
      sendNotFound(res, '썸네일');
      return;
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 파일명이 무작위·불변이라 안전하게 오래 캐시할 수 있다.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(thumbPath);
  })
);

/** GET /api/uploads/download/:filename?originalName=원본파일명.png */
router.get(
  '/download/:filename',
  authenticate as RequestHandler,
  asyncHandler(async (req, res) => {
    const { filename } = req.params as Record<string, string>;
    const rawOriginalName = req.query.originalName;
    // substring 은 서로게이트 짝을 쪼개 encodeURIComponent 에서 URIError 를 낸다.
    const originalName =
      typeof rawOriginalName === 'string' ? clampText(rawOriginalName, 255) : undefined;

    const resolvedFilePath = resolveSecureFilePath(filename, filesDir);
    if (!resolvedFilePath) {
      sendError(res, 400, '잘못된 파일명입니다.');
      return;
    }

    if (!fs.existsSync(resolvedFilePath)) {
      sendNotFound(res, '파일');
      return;
    }

    const savedFilename = path.basename(resolvedFilePath);

    // 인가 규칙은 썸네일 엔드포인트와 같다.
    const authReq = req as AuthRequest;
    const access = await authorizeAttachmentAccess(
      savedFilename,
      authReq.user.id,
      authReq.user.role
    );
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }
    const downloadFilename = originalName || savedFilename;
    const encodedFilename = encodeURIComponent(downloadFilename);

    const stats = fs.statSync(resolvedFilePath);
    const fileSize = stats.size;

    const targetName = originalName || savedFilename;
    const ext = path.extname(targetName).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.txt': 'text/plain',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.hwp': 'application/x-hwp',
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Cache-Control', 'no-cache');
    // MIME 스니핑으로 인라인 실행되는 것을 막는다.
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const fileStream = fs.createReadStream(resolvedFilePath);

    fileStream.on('error', error => {
      logError('파일 스트림 오류', error);
      if (!res.headersSent) {
        sendError(res, 500, '파일 다운로드 중 오류가 발생했습니다.');
      }
    });

    fileStream.pipe(res);
  })
);

/** 파일 정보 조회 */
router.get(
  '/info/:filename',
  authenticate as RequestHandler,
  asyncHandler(async (req, res) => {
    const { filename } = req.params as Record<string, string>;

    const resolvedFilePath = resolveSecureFilePath(filename, filesDir);
    if (!resolvedFilePath) {
      sendError(res, 400, '잘못된 파일명입니다.');
      return;
    }

    const savedFilename = path.basename(resolvedFilePath);

    // 인가는 존재 확인보다 먼저 한다. 뒤에 두면 404 와 403 이 갈려 존재가 드러난다.
    const authReq = req as AuthRequest;
    const access = await authorizeAttachmentAccess(
      savedFilename,
      authReq.user.id,
      authReq.user.role
    );
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }

    if (!fs.existsSync(resolvedFilePath)) {
      sendNotFound(res, '파일');
      return;
    }

    const stats = fs.statSync(resolvedFilePath);

    sendSuccess(res, {
      filename: savedFilename,
      size: stats.size,
      mtime: stats.mtime,
      downloadUrl: `/api/uploads/download/${savedFilename}`,
    });
  })
);

function listFilesInDir(dir: string, type: 'file' | 'image') {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => !/^\./.test(name))
    .map(name => {
      const fullPath = path.join(dir, name);
      try {
        const stats = fs.statSync(fullPath);
        return {
          filename: name,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          type,
          downloadUrl:
            type === 'file' ? `/api/uploads/download/${name}` : `/uploads/images/${name}`,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** GET /api/uploads/admin/list */
router.get(
  '/admin/list',
  authenticate as RequestHandler,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!isAdminOrManager(authReq.user.role)) {
      sendForbidden(res, '관리자 권한이 필요합니다.');
      return;
    }

    const fileType = req.query.type as string | undefined;
    const search = String(req.query.search ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 200);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));

    let allFiles: ReturnType<typeof listFilesInDir> = [];
    if (!fileType || fileType === 'file') {
      allFiles = allFiles.concat(listFilesInDir(filesDir, 'file'));
    }
    if (!fileType || fileType === 'image') {
      allFiles = allFiles.concat(listFilesInDir(imagesDir, 'image'));
    }

    // 페이지네이션 전에 전체 집합에서 걸러야 한다.
    if (search) {
      allFiles = allFiles.filter(f => f?.filename.toLowerCase().includes(search));
    }

    allFiles.sort((a, b) =>
      a && b ? new Date(b.mtime).getTime() - new Date(a.mtime).getTime() : 0
    );

    const total = allFiles.length;
    const items = allFiles.slice((page - 1) * limit, page * limit);
    const totalSize = allFiles.reduce((sum, f) => sum + (f?.size ?? 0), 0);

    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalSize,
    });
  })
);

/** DELETE /api/uploads/admin/:type/:filename */
router.delete(
  '/admin/:type/:filename',
  authenticate as RequestHandler,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!isAdminOrManager(authReq.user.role)) {
      sendForbidden(res, '관리자 권한이 필요합니다.');
      return;
    }

    const { type, filename } = req.params as Record<string, string>;
    if (!['file', 'image'].includes(type)) {
      sendError(res, 400, '유효하지 않은 파일 타입입니다.');
      return;
    }

    const baseDir = type === 'file' ? filesDir : imagesDir;
    const resolvedPath = resolveSecureFilePath(filename, baseDir);
    if (!resolvedPath) {
      sendError(res, 400, '잘못된 파일명입니다.');
      return;
    }

    if (!fs.existsSync(resolvedPath)) {
      sendNotFound(res, '파일');
      return;
    }

    fs.unlinkSync(resolvedPath);
    logInfo('파일 삭제 (관리자)', { filename, type, adminId: authReq.user.id });
    sendSuccess(res, { filename }, '파일이 삭제되었습니다.');
  })
);

export default router;
