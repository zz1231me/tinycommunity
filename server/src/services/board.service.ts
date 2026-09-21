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
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
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
import { deleteThumbnail } from './thumbnail.service';
import Subscription from '../models/Subscription';

export interface PermissionCheckResult {
  hasAccess: boolean;
  reason?: string;
  board?: Board;
  permissions?: { canRead: boolean; canWrite: boolean; canDelete: boolean };
  /** 이 게시판을 관리할 수 있는가. 이미 BoardManager 를 조회하므로 함께 내준다. */
  canManage?: boolean;
}

export class BoardService extends BaseService {
  async getAllBoards() {
    return await Board.findAll({
      order: [['order', 'ASC']],
      where: {
        isPersonal: false,
      },
      limit: 100,
    });
  }

  async getAccessibleBoards(userRole: string): Promise<Board[]> {
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

  async getBoardById(boardId: string) {
    return await Board.findByPk(boardId);
  }

  async createBoard(data: {
    id: string;
    name: string;
    description?: string;
    order?: number;
    taskEnabled?: boolean;
  }) {
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
            taskEnabled: data.taskEnabled ?? false,
          },
          { transaction: t }
        );

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

  async updateBoard(
    boardId: string,
    updates: {
      name?: string;
      description?: string;
      order?: number;
      isActive?: boolean;
      taskEnabled?: boolean;
    }
  ) {
    const board = await Board.findByPk(boardId);
    if (!board) {
      throw new AppError(404, '게시판을 찾을 수 없습니다.');
    }

    await board.update(updates);
    return board;
  }

  // SQLite 는 단일 writer 라 한 트랜잭션 안에서 각 update 에 transaction 을 넘겨야 한다.
  async reorderBoards(orderedIds: string[]) {
    await sequelize.transaction(async t => {
      for (let i = 0; i < orderedIds.length; i++) {
        await Board.update({ order: i }, { where: { id: orderedIds[i] }, transaction: t });
      }
    });
  }

  async deleteBoard(boardId: string) {
    const board = await Board.findByPk(boardId);
    if (!board) {
      throw new AppError(404, '게시판을 찾을 수 없습니다.');
    }

    if (board.isPersonal) {
      throw new AppError(403, '개인 폴더는 일반 삭제로 제거할 수 없습니다.');
    }

    // paranoid:false 로 soft-deleted 글까지 모아야 그 자식 행들도 함께 정리된다.
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
      } catch {}
    }

    // Post 는 paranoid 라 force:true 가 없으면 행이 남아 FK 위반으로 board.destroy() 가 실패한다.
    // SQLite 는 FK 를 강제하지 않으므로 자식 데이터도 직접 지운다.
    const postIds = posts.map(p => p.id);

    // 밀려난 예전 첨부 목록은 삭제 전에 모아야 한다. 삭제 뒤에는 파일명을 되짚을 수 없다.
    if (postIds.length > 0) {
      const versions = await PostAttachmentVersion.findAll({
        where: { postId: { [Op.in]: postIds } },
        attributes: ['filename'],
      });
      filesToDelete.push(...versions.map(v => ({ filename: v.filename })));
    }

    await sequelize.transaction(async t => {
      if (postIds.length > 0) {
        const childWhere = { PostId: { [Op.in]: postIds } };
        // CommentLike 는 CASCADE 가 보장되지 않아 직접 지운다. IN 변수 상한 때문에 청크로 나눈다.
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
        await PostTag.destroy({ where: childWhere, transaction: t });
        // 이 글들을 가리키는 알림도 링크가 죽으므로 함께 지운다.
        await Notification.destroy({
          where: { relatedId: { [Op.in]: postIds } },
          transaction: t,
        });
      }
      await Post.destroy({ where: { boardType: boardId }, transaction: t, force: true });
      // CASCADE 가 보장되지 않는다. 안 지우면 같은 id 로 게시판을 다시 만들 때 옛 권한이 되살아난다.
      await BoardAccess.destroy({ where: { boardId }, transaction: t });
      await BoardManager.destroy({ where: { boardId }, transaction: t });
      await Tag.destroy({ where: { boardId }, transaction: t });
      // 구독도 같은 이유로 지운다.
      await Subscription.destroy({
        where: { targetType: 'board', targetId: boardId },
        transaction: t,
      });
      await board.destroy({ transaction: t });
    });

    // DB 삭제가 끝난 뒤에 파일을 지운다.
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
          void deleteThumbnail(path.basename(filePath));
        }
      } catch (fileErr) {
        logError(`게시판 삭제 중 첨부파일 삭제 실패: ${att.filename}`, fileErr);
      }
    }
  }

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

  async getUserAccessibleBoards(
    userId: string,
    userRole: string,
    userName: string
  ): Promise<AccessibleBoard[]> {
    logInfo('사용자 접근 가능한 게시판 조회', { userId, userName, userRole });

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

    // 담당자로 지정된 게시판은 역할 권한이 없어도 노출하고 전체 권한을 준다.
    const managedRecords = await BoardManager.findAll({
      where: { userId },
      include: [{ model: Board, as: 'board', where: { isPersonal: false }, required: true }],
    });
    const generalBoardIds = new Set(generalBoards.filter(a => a.board).map(a => a.board!.id));

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
          taskEnabled: !!access.board!.taskEnabled,
          permissions: {
            canRead: access.canRead,
            canWrite: access.canWrite,
            canDelete: access.canDelete,
          },
        })),
      ...managedRecords
        .map(rec => (rec as BoardManager & { board?: Board }).board)
        .filter((b): b is Board => !!b && !generalBoardIds.has(b.id))
        .map(b => ({
          id: b.id,
          name: b.name,
          description: b.description,
          order: b.order,
          isPersonal: false,
          taskEnabled: !!b.taskEnabled,
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
        taskEnabled: !!personalFolderResult.board.taskEnabled,
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

  async checkPermission(
    userId: string,
    userRole: string,
    boardId: string,
    action: 'canRead' | 'canWrite' | 'canDelete'
  ): Promise<PermissionCheckResult> {
    const isAdmin = userRole === 'admin';
    const isManager = userRole === 'manager';
    const prepass = isAdmin || isManager;

    const [board, access, managerRecord] = await Promise.all([
      Board.findByPk(boardId),
      prepass
        ? Promise.resolve(null)
        : BoardAccess.findOne({ where: { boardId, roleId: userRole } }),
      prepass ? Promise.resolve(null) : BoardManager.findOne({ where: { boardId, userId } }),
    ]);

    if (!board) {
      return { hasAccess: false, reason: '존재하지 않는 게시판입니다.' };
    }

    const allPermissions = { canRead: true, canWrite: true, canDelete: true };

    if (board?.isPersonal) {
      const hasAccess = board.ownerId === userId;
      return {
        hasAccess,
        reason: hasAccess ? undefined : '개인 공간에는 접근할 수 없습니다.',
        board,
        permissions: hasAccess ? allPermissions : undefined,
        canManage: hasAccess,
      };
    }

    // 게시판 담당자는 그 게시판에 대해 전체 권한을 자동으로 갖는다.
    const isBoardManagerOfThis = managerRecord !== null;

    if (!board.isPersonal && !board.isActive && !prepass && !isBoardManagerOfThis) {
      return { hasAccess: false, reason: '비활성화된 게시판입니다.', board };
    }

    if (prepass || isBoardManagerOfThis) {
      return {
        hasAccess: true,
        board: board || undefined,
        permissions: allPermissions,
        canManage: true,
      };
    }

    if (!access) {
      return {
        hasAccess: false,
        reason: '접근 권한이 설정되지 않았습니다.',
        board: board || undefined,
      };
    }

    if (!access.canRead) {
      return {
        hasAccess: false,
        reason: '게시판 읽기 권한이 없습니다.',
        board: board || undefined,
      };
    }

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
