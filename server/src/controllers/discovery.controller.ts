// server/src/controllers/discovery.controller.ts
// 탐색(인기글·관련 글·태그 클라우드)과 참여(스크랩) 엔드포인트.

import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendServiceError } from '../utils/response';
import { logError } from '../utils/logger';
import { parsePagination } from '../utils/pagination';
import { discoveryService, type PopularPeriod } from '../services/discovery.service';
import { postScrapService } from '../services/postScrap.service';

const PERIODS: PopularPeriod[] = ['week', 'month', 'all'];

export const getPopularPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const raw = req.query.period?.toString() ?? 'week';
  const period = (PERIODS as string[]).includes(raw) ? (raw as PopularPeriod) : 'week';
  const limit = Number.parseInt(req.query.limit?.toString() ?? '10', 10);

  try {
    const posts = await discoveryService.getPopularPosts(
      userId,
      userRole,
      period,
      Number.isFinite(limit) ? limit : 10
    );
    sendSuccess(res, { period, posts });
  } catch (err) {
    logError('인기글 조회 실패', err, { userId, period });
    sendError(res, 500, '인기글을 불러오지 못했습니다.');
  }
};

export const getRelatedPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const postId = req.params.id;

  try {
    const posts = await discoveryService.getRelatedPosts(postId, userId, userRole, 5);
    sendSuccess(res, posts);
  } catch (err) {
    logError('관련 글 조회 실패', err, { userId, postId });
    sendError(res, 500, '관련 글을 불러오지 못했습니다.');
  }
};

export const getTagCloud = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const limit = Number.parseInt(req.query.limit?.toString() ?? '40', 10);

  try {
    const tags = await discoveryService.getTagCloud(
      userId,
      userRole,
      Number.isFinite(limit) ? limit : 40
    );
    sendSuccess(res, tags);
  } catch (err) {
    logError('태그 클라우드 조회 실패', err, { userId });
    sendError(res, 500, '태그 목록을 불러오지 못했습니다.');
  }
};

export const getPostsByTag = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const tagId = Number.parseInt(req.params.id, 10);
  const { page, limit } = parsePagination(req);

  if (!Number.isFinite(tagId) || tagId <= 0) {
    sendError(res, 400, '태그 id가 올바르지 않습니다.');
    return;
  }

  try {
    sendSuccess(res, await discoveryService.getPostsByTag(tagId, userId, userRole, page, limit));
  } catch (err) {
    logError('태그별 글 조회 실패', err, { userId, tagId });
    sendError(res, 500, '태그별 글을 불러오지 못했습니다.');
  }
};

export const toggleScrap = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const { boardType, id: postId } = req.params;

  try {
    const result = await postScrapService.toggle(postId, userId, boardType, userRole);
    sendSuccess(res, result);
  } catch (err) {
    sendServiceError(res, err, '스크랩 처리에 실패했습니다.', { userId, postId });
  }
};

export const getScrapStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const { boardType, id: postId } = req.params;

  try {
    // 주소로 들어온 요청이라, 글이 정말 그 게시판 소속인지부터 본다
    await postScrapService.assertReachable(postId, boardType, userId, userRole);
    const scrapped = await postScrapService.isScrapped(postId, userId);
    sendSuccess(res, { scrapped });
  } catch (err) {
    // sendServiceError 로 바꾼다. 여기서 500 으로 뭉개면 교차 게시판 요청의 404 와
    // 비밀글 403 이 모두 '서버 오류' 가 되어, 막았다는 사실이 응답에 드러나지 않는다.
    sendServiceError(res, err, '스크랩 상태를 확인하지 못했습니다.', { userId, postId });
  }
};

export const getMyScraps = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  const { page, limit } = parsePagination(req);

  try {
    sendSuccess(res, await postScrapService.list(userId, userRole, page, limit));
  } catch (err) {
    logError('스크랩 목록 조회 실패', err, { userId });
    sendError(res, 500, '스크랩 목록을 불러오지 못했습니다.');
  }
};
