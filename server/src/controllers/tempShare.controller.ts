// server/src/controllers/tempShare.controller.ts
// 임시 파일 공유: 업로드(인증) → 공유 링크 반환. 링크는 TTL(기본 15분) 동안 공개 접근 가능,
// 만료되면 스케줄러가 디스크 파일 + 레코드를 삭제한다.
import { Response, Request } from 'express';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import { FlatRequest, type AuthRequest } from '../types/auth-request';
import { TempShare } from '../models/TempShare';
import { sendSuccess, sendError } from '../utils/response';
import { logError, logInfo } from '../utils/logger';

export const TEMP_TTL_MS = 15 * 60 * 1000; // 15분
export const tempDir = path.resolve(__dirname, '../../uploads/temp');

function ensureTempDir(): void {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
}
ensureTempDir();

// 업로드 (multer가 파일을 uploads/temp에 저장한 뒤 호출됨)
export const uploadTempFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as unknown as AuthRequest;
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      sendError(res, 400, '파일이 없습니다.');
      return;
    }
    const expiresAt = new Date(Date.now() + TEMP_TTL_MS);
    const record = await TempShare.create({
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      uploadedBy: authReq.user?.id ?? 'unknown',
      expiresAt,
    });
    sendSuccess(res, {
      token: record.id,
      url: `/api/temp-share/${record.id}`,
      originalName: record.originalName,
      size: record.size,
      expiresAt: record.expiresAt,
    });
  } catch (err) {
    logError('임시 파일 업로드 오류', err);
    sendError(res, 500, '업로드 중 오류가 발생했습니다.');
  }
};

// 공개 다운로드 (토큰만으로 접근, 인증 불필요). 만료 시 410.
export const downloadTempFile = async (req: FlatRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const record = await TempShare.findByPk(token);
    if (!record) {
      sendError(res, 404, '파일을 찾을 수 없습니다.');
      return;
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      // 만료 — 즉시 정리
      void deleteRecord(record);
      sendError(res, 410, '만료된 링크입니다.');
      return;
    }
    const filePath = path.join(tempDir, record.storedName);
    // 경로 안전: storedName은 서버 생성값이지만 방어적으로 tempDir 경계 확인
    if (!path.resolve(filePath).startsWith(tempDir + path.sep) || !fs.existsSync(filePath)) {
      sendError(res, 404, '파일을 찾을 수 없습니다.');
      return;
    }
    const encoded = encodeURIComponent(record.originalName);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', record.size);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logError('임시 파일 다운로드 오류', err);
    if (!res.headersSent) sendError(res, 500, '다운로드 중 오류가 발생했습니다.');
  }
};

async function deleteRecord(record: TempShare): Promise<void> {
  try {
    const filePath = path.join(tempDir, record.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logError('임시 파일 삭제 실패', err);
  }
  await record.destroy().catch(() => {});
}

// 만료된 임시 파일 정리 — 스케줄러가 주기 호출.
export async function cleanupExpiredTempShares(): Promise<number> {
  try {
    const expired = await TempShare.findAll({ where: { expiresAt: { [Op.lte]: new Date() } } });
    for (const rec of expired) await deleteRecord(rec);
    if (expired.length > 0) logInfo(`임시 공유 파일 ${expired.length}건 정리`);
    return expired.length;
  } catch (err) {
    logError('임시 파일 정리 오류', err);
    return 0;
  }
}
