// server/src/services/postTask.service.ts
// 게시글의 업무 상태와 담당자.
//
// 누가 바꿀 수 있는가: 작성자, 담당자 본인, 게시판 담당자, 관리자.
// 담당자 본인을 넣는 이유는 "내가 맡았다 / 다 했다" 를 스스로 표시하지 못하면
// 결국 작성자에게 말해서 바꿔 달라고 해야 하기 때문이다.

import { Op, type Transaction } from 'sequelize';
import { Post } from '../models/Post';
import { PostActivity } from '../models/PostActivity';
import User from '../models/User';
import Board from '../models/Board';
import { BoardManager } from '../models/BoardManager';
import { AppError } from '../middlewares/error.middleware';
import { ROLES } from '../config/constants';
import { isWorkStatus, type WorkStatus } from '../config/workStatus';
import { notificationService } from './notification.service';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { checkSecretPostAccess } from '../utils/postAccess';
import { sequelize } from '../config/sequelize';
import { logError } from '../utils/logger';

interface ChangeParams {
  postId: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  /** 넘기지 않으면 그대로 둔다. null 은 담당자 없음. */
  assigneeId?: string | null;
  workStatus?: WorkStatus;
}

/** 업무용으로 켜 둔 게시판에서만 담당자·상태를 쓴다 */
async function assertTaskBoard(boardType: string) {
  const board = await Board.findByPk(boardType, { attributes: ['id', 'taskEnabled'] });
  if (!board?.taskEnabled) {
    throw new AppError(400, '업무용으로 설정된 게시판이 아닙니다.');
  }
}

async function assertCanManage(post: Post, actorId: string, actorRole: string) {
  if (actorRole === ROLES.ADMIN || actorRole === ROLES.MANAGER) return;
  if (post.UserId === actorId) return;
  if (post.assigneeId === actorId) return;

  const manager = await BoardManager.findOne({
    where: { boardId: post.boardType, userId: actorId },
    attributes: ['boardId'],
  });
  if (!manager) {
    throw new AppError(403, '이 글의 담당자나 상태를 바꿀 권한이 없습니다.');
  }
}

/** 담당자로 지정하려는 사람이 이 글을 읽을 수 있는지 */
async function assertAssigneeCanSee(assigneeId: string, post: Post) {
  const user = await User.findOne({
    where: { id: assigneeId, isActive: true, isDeleted: false },
    attributes: ['id', 'roleId'],
  });
  if (!user) throw new AppError(404, '담당자로 지정할 사용자를 찾을 수 없습니다.');

  // 못 보는 글의 담당자가 되면 알림만 받고 열지 못한다
  const boards = await getAccessibleBoardTypes(user.id, user.roleId ?? '');
  if (!boards.includes(post.boardType)) {
    throw new AppError(400, '이 게시판을 볼 수 없는 사용자는 담당자로 지정할 수 없습니다.');
  }

  // 비밀글이면 그 글에 들어갈 수 있는 사람인지까지 본다.
  //
  // 게시판만 보던 때는, 명단에서 빠진 사람도 담당자로 지정할 수 있었다 — 그 사람은 알림으로
  // 제목을 읽고('…님이 "<비밀글 제목>" 의 담당자로 지정했습니다'), '내 업무' 목록에도 제목이
  // 남았다. 글은 403 이라 열지도 못하면서 상태·담당자는 바꿀 수 있었다(담당자라서).
  // 멘션 알림은 처음부터 이 검사를 한다(mention.service) — 이 길만 빠져 있었다.
  const secret = checkSecretPostAccess(post, user.id, user.roleId ?? '');
  if (!secret.ok) {
    throw new AppError(400, '이 비밀글을 볼 수 없는 사용자는 담당자로 지정할 수 없습니다.');
  }
}

export const postTaskService = {
  async change(params: ChangeParams) {
    const { postId, actorId, actorRole, actorName } = params;

    const post = await Post.findByPk(postId);
    if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');
    // 게시판 용도를 먼저 본다 — 권한이 있어도 업무용이 아닌 곳에는 상태를 붙이지 않는다
    await assertTaskBoard(post.boardType);
    await assertCanManage(post, actorId, actorRole);

    if (params.workStatus !== undefined && !isWorkStatus(params.workStatus)) {
      throw new AppError(400, '업무 상태 값이 올바르지 않습니다.');
    }

    const previousAssignee = post.assigneeId ?? null;
    const previousStatus = post.workStatus;

    if (params.assigneeId !== undefined) {
      if (params.assigneeId === null) {
        post.assigneeId = null;
      } else {
        await assertAssigneeCanSee(params.assigneeId, post);
        post.assigneeId = params.assigneeId;
      }
    }

    if (params.workStatus !== undefined) {
      post.workStatus = params.workStatus;
      // 담당자 없이 '진행 중' 은 앞뒤가 맞지 않는다 — 바꾼 사람이 맡은 것으로 본다
      if (params.workStatus === 'doing' && !post.assigneeId) {
        post.assigneeId = actorId;
      }
    }

    // 상태를 손대며 'none' 을 벗어났는데 담당자가 없으면 그대로 둔다 —
    // '할 일' 은 아직 누가 할지 정하지 않은 상태일 수 있다.
    //
    // 저장과 기록을 한 트랜잭션에 묶는다. 따로 하면 "바뀌었는데 기록이 없는" 줄이
    // 생길 수 있고, 그건 기록을 신뢰할 수 없게 만든다.
    const nextStatus = post.workStatus;
    const nextAssigneeId = post.assigneeId ?? null;
    await sequelize.transaction(async t => {
      await post.save({ transaction: t });
      await recordChanges(t, {
        postId: post.id,
        actorId,
        status: previousStatus !== nextStatus ? [previousStatus, nextStatus] : null,
        assignee: previousAssignee !== nextAssigneeId ? [previousAssignee, nextAssigneeId] : null,
      });
    });

    // 새로 담당자가 된 사람에게 알린다. 자기가 스스로 맡은 경우는 뺀다.
    const nextAssignee = nextAssigneeId;
    if (nextAssignee && nextAssignee !== previousAssignee && nextAssignee !== actorId) {
      void notificationService
        .create({
          userId: nextAssignee,
          type: 'ASSIGNMENT',
          message: `${actorName}님이 "${post.title}" 의 담당자로 지정했습니다.`,
          link: `/dashboard/posts/${post.boardType}/${post.id}`,
          relatedId: post.id,
        })
        .catch(err => logError('담당자 지정 알림 실패', err, { postId }));
    }

    return {
      workStatus: post.workStatus,
      assignee: nextAssignee ? await loadAssignee(nextAssignee) : null,
    };
  },

  /** 내가 담당인 글 모아 보기 */
  async listMyTasks(userId: string, userRole: string, statuses: WorkStatus[]) {
    const accessible = await getAccessibleBoardTypes(userId, userRole);
    if (accessible.length === 0) return [];

    // 업무용을 끈 게시판의 예전 담당은 목록에서 뺀다 — 그 게시판에서는 상태를
    // 바꿀 수도 없으므로, 남겨 두면 지울 수 없는 항목이 된다
    const taskBoards = await Board.findAll({
      where: { id: { [Op.in]: accessible }, taskEnabled: true },
      attributes: ['id'],
    });
    const boardTypes = taskBoards.map(b => b.id);
    if (boardTypes.length === 0) return [];

    const posts = await Post.findAll({
      where: {
        assigneeId: userId,
        workStatus: { [Op.in]: statuses },
        boardType: { [Op.in]: boardTypes },
        status: 'published',
      },
      include: [{ model: Board, as: 'board', attributes: ['name'], required: false }],
      attributes: [
        'id',
        'title',
        'boardType',
        'workStatus',
        'createdAt',
        'updatedAt',
        // 비밀글 여부를 함께 읽어 아래에서 거른다(제목도 가려야 하는 글이 있다)
        'isSecret',
        'secretType',
        'secretUserIds',
        'UserId',
      ],
      // 오래 걸린 일이 위로 오게 — 방치된 것을 먼저 보여 준다
      order: [['updatedAt', 'ASC']],
      limit: 100,
    });

    // 열 수 없는 비밀글은 목록에서도 뺀다. 지금은 담당자로 지정할 때 막지만, 지정한 뒤에
    // 글이 비밀글이 되거나 명단에서 빠질 수 있다 — 그때 제목만 남아 보이지 않게 한다.
    const visible = posts.filter(p => checkSecretPostAccess(p, userId, userRole).ok);

    return visible.map(p => {
      const plain = p.get({ plain: true }) as unknown as {
        id: string;
        title: string;
        boardType: string;
        workStatus: WorkStatus;
        createdAt: Date;
        updatedAt: Date;
        board?: { name: string } | null;
      };
      return {
        id: plain.id,
        title: plain.title,
        boardType: plain.boardType,
        boardName: plain.board?.name ?? plain.boardType,
        workStatus: plain.workStatus,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
      };
    });
  },
};

/** 바뀐 것만 활동 기록에 적는다 — 안 바뀐 값을 적으면 기록이 잡음으로 덮인다 */
async function recordChanges(
  transaction: Transaction,
  change: {
    postId: string;
    actorId: string;
    status: [string, string] | null;
    assignee: [string | null, string | null] | null;
  }
) {
  const rows: Array<{
    postId: string;
    actorId: string;
    kind: 'status' | 'assignee';
    fromValue: string | null;
    toValue: string | null;
  }> = [];

  if (change.status) {
    rows.push({
      postId: change.postId,
      actorId: change.actorId,
      kind: 'status',
      fromValue: change.status[0],
      toValue: change.status[1],
    });
  }
  if (change.assignee) {
    rows.push({
      postId: change.postId,
      actorId: change.actorId,
      kind: 'assignee',
      fromValue: change.assignee[0],
      toValue: change.assignee[1],
    });
  }
  if (rows.length > 0) await PostActivity.bulkCreate(rows, { transaction });
}

async function loadAssignee(userId: string) {
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
  return user ? { id: user.id, name: user.name, avatar: user.avatar ?? null } : null;
}
