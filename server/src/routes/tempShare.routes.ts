// server/src/routes/tempShare.routes.ts
import { Router, RequestHandler } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadTempFile, downloadTempFile, tempDir } from '../controllers/tempShare.controller';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempDir),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(16).toString('hex');
    // 원본 확장자만 보존(경로/이름은 서버 생성값 사용 → 경로탈출·덮어쓰기 불가)
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE, files: 1 } });

const router = Router();

// 업로드 — 로그인 사용자만
router.post(
  '/upload',
  authenticate as RequestHandler,
  upload.single('file'),
  uploadTempFile as RequestHandler
);

// 다운로드 — 토큰만으로 공개 접근(인증 불필요, 링크 공유용)
router.get('/:token', downloadTempFile as RequestHandler);

export default router;
