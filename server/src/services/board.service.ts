import { Board } from '../models/Board';
import { BoardAccess } from '../models/BoardAccess';
import { Post } from '../models/Post';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { UniqueConstraintError, Op } from 'sequelize';
import { PostTag } from '../models/PostTag';
import { Comment } from '../models/Comment';
import { PostLike } from '../models/PostLike';
import { PostRead } from '../models/PostRead';
import { PostBookmark } from '../models/PostBookmark';
import { BoardManager } from '../models/BoardManager';
import { CommentLike } from '../models/CommentLike';
import { Notification } from '../models/Notification';
import { Tag } from '../models/Tag';
import { AccessibleBoard, PersonalFolderResult } from '../types/auth-request';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logInfo, logError, logSuccess } from '../utils/logger';
import { RESERVED_BOARD_IDS } from '../config/constants';

export interface PermissionCheckResult {
  hasAccess: boolean;
  reason?: string;
  board?: Board;
  permissions?: { canRead: boolean; canWrite: boolean; canDelete: boolean };
}

export class BoardService extends BaseService {
  // ✅ 모든 게시판 목록 조회 (관리자용 포함)
  async getAllBoards() {
    return await Board.findAll({
      order: [['order', 'ASC']],
      where: {
        isPersonal: false, // 개인 폴더 제외
      },
      limit: 100,
    });
  }

  // ✅ 사용자가 접근 가능한 게시판 목록 조회
  async getAccessibleBoards(userRole: string): Promise<Board[]> {
    // 1. 역할에 부여된 게시판 접근 권한 조회
    const accesses = await BoardAccess.findAll({
      where: {
        roleId: userRole,
        canRead: true,
      },
      include: [
        {
          model: Board,
          as: 'board',
          where: {
            isActive: true,
            isPersonal: false,
          },
          required: true,
        },
      ],
      order: [[{ model: Board, as: 'board' }, 'order', 'ASC']],
    });

    return accesses.map(access => access.board).filter((board): board is Board => !!board);
  }

  // ✅ 특정 게시판 정보 조회
  async getBoardById(boardId: string) {
    return await Board.findByPk(boardId);
  }

  // ✅ 게시판 생성 (관리자용)
  async createBoard(data: { id: string; name: string; description?: string; order?: number }) {
    // 예약된 시스템 경로와 충돌 방지
    if (RESERVED_BOARD_IDS.includes(data.id.toLowerCase())) {
      throw new AppError(400, `'${data.id}'는 시스템에서 예약된 ID입니다. 다른 ID를 사용해주세요.`);
    }

    try {
      const board = await sequelize.transaction(async t => {
        const newBoard = await Board.create(
          {
            id: data.id,
            name: data.name,
            description: data.description,
            order: data.order || 0,
            isActive: true,
            isPersonal: false,
          },
          { transaction: t }
        );

        // 기본적으로 관리자에게 모든 권한 부여
        await BoardAccess.create(
          {
            boardId: newBoard.id,
            roleId: 'admin',
            canRead: true,
            canWrite: true,
            canDelete: true,
          },
          { transaction: t }
        );

        return newBoard;
      });

      return board;
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '이미 존재하는 게시판 ID입니다.');
      }
      throw err;
    }
  }

  // ✅ 게시판 수정
  async updateBoard(
    boardId: string,
    updates: { name?: string; description?: string; order?: number; isActive?: boolean }
  ) {
    const board = await Board.findByPk(boardId);
    if (!board) {
      throw new AppError(404, '게시판을 찾을 수 없습니다.');
    }

    await board.update(updates);
    return board;
  }

  // ✅ 게시판 삭제
  async deleteBoard(boardId: string) {
    const board = await Board.findByPk(boardId);
    if (!board) {
      throw new AppError(404, '게시판을 찾을 수 없습니다.');
    }

    if (board.isPersonal) {
      throw new AppError(403, '개인 폴더는 일반 삭제로 제거할 수 없습니다.');
    }

    // 게시판 내 게시글 첨부파일 목록을 미리 수집 (DB 삭제 후 파일 정리용)
    // ⚠️ paranoid:false — 아래 Post.destroy(force:true)는 soft-deleted 글까지 hard-delete 하므로,
    //    postIds도 soft-deleted 글을 포함해야 그 자식(댓글/좋아요 등)까지 정리된다(orphan 방지).
    const posts = await Post.findAll({
      where: { boardType: boardId },
      attributes: ['id', 'attachments'],
      paranoid: false,
    });
    type Attachment = { filename: string; path?: string };
    const filesToDelete: Attachment[] = [];
    for (const post of posts) {
      try {
        const attachments: Attachment[] =
          typeof post.attachments === 'string'
            ? JSON.parse(post.attachments)
            : Array.isArray(post.attachments)
              ? (post.attachments as Attachment[])
              : [];
        filesToDelete.push(...attachments);
      } catch {
        // 파싱 실패 시 해당 게시글 첨부파일만 건너뜀
      }
    }

    // 게시글 + 게시판 삭제를 트랜잭션으로 원자적 처리 (중간 실패 시 롤백)
    // ⚠️ Post는 paranoid이므로 force:true가 없으면 deletedAt만 채워지고 실제 row가 남음 →
    //    Post.boardType의 FK(onDelete: RESTRICT) 위반으로 board.destroy()가 실패함.
    //    따라서 게시판 삭제 시에는 게시글을 hard-delete 한다.
    // 게시글의 자식 데이터(댓글/좋아요/조회기록/북마크/태그)는 모두 수동 정리해야 한다.
    // SQLite는 FK 미강제, Post는 paranoid라 — deletePost와 동일하게 직접 hard-delete하지
    // 않으면 게시판 삭제 후 PostId가 사라진 게시글을 가리키는 orphan 행이 남는다.
    // 게시글을 hard-delete(force:true)하므로 댓글도 audit 가치 없이 hard-delete한다.
    const postIds = posts.map(p => p.id);
    await sequelize.transaction(async t => {
      if (postIds.length > 0) {
        const childWhere = { PostId: { [Op.in]: postIds } };
        // CommentLike는 댓글 soft/hard 삭제로 CASCADE가 보장되지 않으므로(constraints:false+SQLite)
        // 댓글 id를 먼저 모아 명시 정리한다(deletePost와 동일). IN 변수 상한 회피 위해 청크 분할.
        const comments = await Comment.findAll({
          where: childWhere,
          attributes: ['id'],
          paranoid: false,
          transaction: t,
        });
        const commentIds = comments.map(c => c.id);
        const COMMENT_LIKE_CHUNK = 500;
        for (let i = 0; i < commentIds.length; i += COMMENT_LIKE_CHUNK) {
          await CommentLike.destroy({
            where: { CommentId: { [Op.in]: commentIds.slice(i, i + COMMENT_LIKE_CHUNK) } },
            transaction: t,
          });
        }
        await Comment.destroy({ where: childWhere, transaction: t, force: true });
        await PostLike.destroy({ where: childWhere, transaction: t });
        await PostRead.destroy({ where: childWhere, transaction: t });
        await PostBookmark.destroy({ where: childWhere, transaction: t });
        await PostTag.destroy({ where: childWhere, transaction: t });
        // 이 글들을 가리키는 알림(댓글/좋아요)도 링크가 죽으므로 정리(deletePost와 동일).
        await Notification.destroy({
          where: { relatedId: { [Op.in]: postIds } },
          transaction: t,
        });
      }
      await Post.destroy({ where: { boardType: boardId }, transaction: t, force: true });
      // 게시판 권한(BoardAccess) + 담당자(BoardManager) + 게시판 전용 태그(Tag)도 명시적으로 정리 —
      // onDelete:CASCADE는 constraints:false + SQLite FK 미강제라 보장되지 않는다. 안 지우면 같은
      // id로 게시판 재생성 시 옛 권한/담당자/태그가 되살아나 의도치 않게 부활한다.
      // (PostTag 조인 행은 위 게시글 정리에서 제거됨. 전역 태그(boardId=null)는 영향 없음.)
      await BoardAccess.destroy({ where: { boardId }, transaction: t });
      await BoardManager.destroy({ where: { boardId }, transaction: t });
      await Tag.destroy({ where: { boardId }, transaction: t });
      await board.destroy({ transaction: t });
    });

    // 첨부파일 삭제 (DB 삭제 성공 후)
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    for (const att of filesToDelete) {
      try {
        let filePath: string;
        if (att.path) {
          filePath = path.isAbsolute(att.path)
            ? path.resolve(att.path)
            : path.resolve(process.cwd(), att.path.startsWith('/') ? att.path.slice(1) : att.path);
        } else {
          filePath = path.resolve(uploadsRoot, 'files', att.filename);
        }
        if (filePath.startsWith(uploadsRoot + path.sep) && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileErr) {
        logError(`게시판 삭제 중 첨부파일 삭제 실패: ${att.filename}`, fileErr);
      }
    }
  }

  // ✅ 개인 폴더 안전한 생성/조회
  private async findOrCreatePersonalFolder(
    userId: string,
    userName: string
  ): Promise<PersonalFolderResult> {
    try {
      const [board, created] = await sequelize.transaction(async t => {
        return Board.findOrCreate({
          where: { isPersonal: true, ownerId: userId, isActive: true },
          defaults: {
            id: `personal_${crypto.randomUUID().split('-').join('')}`,
            name: `${userName}님의 개인공간`,
            description: '본인만 접근 가능한 개인 공간입니다.',
            isPersonal: true,
            ownerId: userId,
            isActive: true,
            order: 999,
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      });
      return { board, created };
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existing = await Board.findOne({
          where: { isPersonal: true, ownerId: userId, isActive: true },
        });
        if (existing) return { board: existing, created: false };
      }
      logError('개인 폴더 생성/조회 실패', error, { userId, userName });
      throw error;
    }
  }

  // ✅ 사용자가 접근 가능한 모든 게시판 조회 (일반 게시판 + 개인 폴더)
  async getUserAccessibleBoards(
    userId: string,
    userRole: string,
    userName: string
  ): Promise<AccessibleBoard[]> {
    logInfo('사용자 접근 가능한 게시판 조회', { userId, userName, userRole });

    // 1. 일반 게시판 조회 (역할 기반 권한)
    const generalBoards = await BoardAccess.findAll({
      where: { roleId: userRole, canRead: true },
      include: [
        {
          model: Board,
          as: 'board',
          where: { isActive: true, isPersonal: false },
          required: true,
        },
      ],
    });

    // 1b. 담당자로 지정된 게시판 — 역할 권한이 없어도 사이드바에 노출 + 전체 권한 자동 부여
    const managedRecords = await BoardManager.findAll({
      where: { userId },
      include: [{ model: Board, as: 'board', where: { isPersonal: false }, required: true }],
    });
    const generalBoardIds = new Set(generalBoards.filter(a => a.board).map(a => a.board!.id));

    // 2. 개인 폴더 처리
    let personalFolderResult: PersonalFolderResult | null = null;
    try {
      personalFolderResult = await this.findOrCreatePersonalFolder(userId, userName);
      if (personalFolderResult.created) {
        logSuccess('개인 폴더 자동 생성됨', {
          userId,
          userName,
          boardId: personalFolderResult.board.id,
        });
      }
    } catch (error) {
      logError('개인 폴더 생성/조회 실패', error, { userId, userName });
      // 개인 폴더 실패해도 일반 게시판은 반환
    }

    const result: AccessibleBoard[] = [
      ...generalBoards
        .filter(access => access.board)
        .map(access => ({
          id: access.board!.id,
          name: access.board!.name,
          description: access.board!.description,
          order: access.board!.order,
          isPersonal: false,
          permissions: {
            canRead: access.canRead,
            canWrite: access.canWrite,
            canDelete: access.canDelete,
          },
        })),
      // 담당자 게시판 (역할 기반 목록에 없는 것만, 전체 권한)
      ...managedRecords
        .map(rec => (rec as BoardManager & { board?: Board }).board)
        .filter((b): b is Board => !!b && !generalBoardIds.has(b.id))
        .map(b => ({
          id: b.id,
          name: b.name,
          description: b.description,
          order: b.order,
          isPersonal: false,
          permissions: { canRead: true, canWrite: true, canDelete: true },
        })),
    ];

    if (personalFolderResult?.board) {
      result.push({
        id: personalFolderResult.board.id,
        name: personalFolderResult.board.name,
        description: personalFolderResult.board.description,
        order: personalFolderResult.board.order,
        isPersonal: true,
        ownerId: userId,
        permissions: { canRead: true, canWrite: true, canDelete: true },
      });
    }

    result.sort((a, b) => {
      if (a.isPersonal && !b.isPersonal) return 1;
      if (!a.isPersonal && b.isPersonal) return -1;
      return a.order - b.order;
    });

    return result;
  }

  // ✅ 사용자별 게시판 권한 확인 (Helper Logic moved here)
  async checkPermission(
    userId: string,
    userRole: string,
    boardId: string,
    action: 'canRead' | 'canWrite' | 'canDelete'
  ): Promise<PermissionCheckResult> {
    const isAdmin = userRole === 'admin';
    const isManager = userRole === 'manager';
    const prepass = isAdmin || isManager; // 전역 관리자/매니저

    // Board + BoardAccess + BoardManager 쿼리 병렬 실행 (전역 관리자/매니저는 추가 조회 불필요)
    const [board, access, managerRecord] = await Promise.all([
      Board.findByPk(boardId),
      prepass
        ? Promise.resolve(null)
        : BoardAccess.findOne({ where: { boardId, roleId: userRole } }),
      prepass ? Promise.resolve(null) : BoardManager.findOne({ where: { boardId, userId } }),
    ]);

    // 0. 존재하지 않는 게시판 체크
    if (!board) {
      return { hasAccess: false, reason: '존재하지 않는 게시판입니다.' };
    }

    const allPermissions = { canRead: true, canWrite: true, canDelete: true };

    // 1. 개인 폴더 체크
    if (board?.isPersonal) {
      // 개인 폴더는 소유자만 모든 권한 가짐
      const hasAccess = board.ownerId === userId;
      return {
        hasAccess,
        reason: hasAccess ? undefined : '개인 공간에는 접근할 수 없습니다.',
        board,
        permissions: hasAccess ? allPermissions : undefined,
      };
    }

    // 해당 게시판의 담당자(BoardManager)는 자기 게시판에 대해 전체 권한을 자동 보유
    const isBoardManagerOfThis = managerRecord !== null;

    // 2. 비활성 게시판 접근 차단 (관리자/매니저/해당 게시판 담당자 제외)
    if (!board.isPersonal && !board.isActive && !prepass && !isBoardManagerOfThis) {
      return { hasAccess: false, reason: '비활성화된 게시판입니다.', board };
    }

    // 3. 관리자/매니저/해당 게시판 담당자는 프리패스 (읽기/쓰기/삭제 전체)
    if (prepass || isBoardManagerOfThis) {
      return { hasAccess: true, board: board || undefined, permissions: allPermissions };
    }

    // 4. 일반 게시판 권한 체크
    if (!access) {
      return {
        hasAccess: false,
        reason: '접근 권한이 설정되지 않았습니다.',
        board: board || undefined,
      };
    }

    if (!access.canRead) {
      // 읽기 권한이 없으면 아예 접근 불가
      return {
        hasAccess: false,
        reason: '게시판 읽기 권한이 없습니다.',
        board: board || undefined,
      };
    }

    // 요청된 액션 확인
    if (!access[action]) {
      return {
        hasAccess: false,
        reason: `게시판 ${action === 'canWrite' ? '쓰기' : '삭제'} 권한이 없습니다.`,
        board: board || undefined,
      };
    }

    return {
      hasAccess: true,
      board: board || undefined,
      permissions: {
        canRead: access.canRead,
        canWrite: access.canWrite,
        canDelete: access.canDelete,
      },
    };
  }
}

export const boardService = new BoardService();
