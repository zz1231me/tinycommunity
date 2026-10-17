// 게시글의 업무 상태와 담당자. 작성자·담당자 본인·게시판 담당자·관리자가 바꿀 수 있다.

import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { Post } from '../models/Post';
import { PostActivity, type PostActivityKind } from '../models/PostActivity';
import User from '../models/User';
import Board from '../models/Board';
import { BoardManager } from '../models/BoardManager';
import { AppError } from '../middlewares/error.middleware';
import { ROLES } from '../config/constants';
import { isWorkStatus, type WorkStatus } from '../config/workStatus';
import { isTaskPriority, type TaskPriority } from '../config/taskPriority';
import { notificationService } from './notification.service';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { checkSecretPostAccess } from '../utils/postAccess';
import { sequelize } from '../config/sequelize';
import { logError } from '../utils/logger';

interface ChangeParams {
  postId: string;
  /** 주소에 적힌 게시판. 라우터는 이 게시판의 읽기 권한만 확인하므로 글의 게시판과 같아야 한다. */
  boardType: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  /** 넘기지 않으면 그대로 둔다. null 은 담당자 없음. */
  assigneeId?: string | null;
  workStatus?: WorkStatus;
  /** 넘기지 않으면 그대로 둔다. 'none' 은 정하지 않음. */
  priority?: TaskPriority;
  /** YYYY-MM-DD. 넘기지 않으면 그대로 두고 null 은 일정 없음. */
  startDate?: string | null;
  dueDate?: string | null;
  /**
   * 이 상태일 때만 바꾼다. 다르면 409. '되돌리기' 처럼 방금 본 상태를 전제로 한 변경이
   * 그새 다른 사람이 바꾼 상태를 덮어쓰지 않게 한다.
   */
  ifWorkStatus?: WorkStatus;
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

  // 비밀글이면 게시판 권한만이 아니라 그 글에 들어갈 수 있는지까지 본다
  const secret = checkSecretPostAccess(post, user.id, user.roleId ?? '');
  if (!secret.ok) {
    throw new AppError(400, '이 비밀글을 볼 수 없는 사용자는 담당자로 지정할 수 없습니다.');
  }
}

export const postTaskService = {
  async change(params: ChangeParams) {
    const { postId, actorId, actorRole, actorName } = params;

    const post = await Post.findByPk(postId);
    // 다른 게시판 주소로 들어오면 그 게시판의 읽기 권한만 확인된 상태다. 없는 글처럼 답한다.
    if (!post || post.boardType !== params.boardType) {
      throw new AppError(404, '게시글을 찾을 수 없습니다.');
    }
    // 권한이 있어도 업무용이 아닌 게시판에는 상태를 붙이지 않는다
    await assertTaskBoard(post.boardType);
    await assertCanManage(post, actorId, actorRole);

    if (params.workStatus !== undefined && !isWorkStatus(params.workStatus)) {
      throw new AppError(400, '업무 상태 값이 올바르지 않습니다.');
    }
    if (params.priority !== undefined && !isTaskPriority(params.priority)) {
      throw new AppError(400, '우선순위 값이 올바르지 않습니다.');
    }
    if (params.ifWorkStatus !== undefined && post.workStatus !== params.ifWorkStatus) {
      throw new AppError(409, '그사이 다른 곳에서 상태가 바뀌어 되돌리지 않았습니다.');
    }

    const previousAssignee = post.assigneeId ?? null;
    const previousStatus = post.workStatus;
    const previousSchedule = scheduleValue(post.startDate, post.dueDate);
    const previousPriority = post.priority;

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
      // 담당자 없이 '진행 중' 이면 바꾼 사람이 맡은 것으로 본다
      if (params.workStatus === 'doing' && !post.assigneeId) {
        post.assigneeId = actorId;
      }
    }

    if (params.priority !== undefined) post.priority = params.priority;
    if (params.startDate !== undefined) post.startDate = params.startDate;
    if (params.dueDate !== undefined) post.dueDate = params.dueDate;
    // 한쪽만 바꿔도 저장된 다른 쪽과 어긋날 수 있어 합친 뒤에 본다
    if (post.startDate && post.dueDate && post.startDate > post.dueDate) {
      throw new AppError(400, '시작일이 마감일보다 늦을 수 없습니다.');
    }

    // 저장과 활동 기록은 한 트랜잭션에 묶는다
    const nextStatus = post.workStatus;
    const nextAssigneeId = post.assigneeId ?? null;
    const nextSchedule = scheduleValue(post.startDate, post.dueDate);
    const nextPriority = post.priority;
    await sequelize.transaction(async t => {
      await post.save({ transaction: t });
      await recordChanges(t, {
        postId: post.id,
        actorId,
        status: previousStatus !== nextStatus ? [previousStatus, nextStatus] : null,
        assignee: previousAssignee !== nextAssigneeId ? [previousAssignee, nextAssigneeId] : null,
        schedule: previousSchedule !== nextSchedule ? [previousSchedule, nextSchedule] : null,
        priority: previousPriority !== nextPriority ? [previousPriority, nextPriority] : null,
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

    // 일정이 바뀌면 맡은 사람에게 알린다. 마감이 당겨진 것을 담당자가 모르면
    // 마감 임박 알림이 오기 전까지 알 길이 없다. 방금 담당자가 된 사람은 위에서
    // 이미 받았으므로 빼고, 자기가 바꾼 경우도 뺀다.
    if (
      nextSchedule !== previousSchedule &&
      nextAssignee &&
      nextAssignee === previousAssignee &&
      nextAssignee !== actorId
    ) {
      void notificationService
        .create({
          userId: nextAssignee,
          type: 'TASK_SCHEDULE',
          message: `${actorName}님이 "${post.title}" 의 일정을 ${scheduleLabel(post.startDate, post.dueDate)}(으)로 바꿨습니다.`,
          link: `/dashboard/posts/${post.boardType}/${post.id}`,
          relatedId: post.id,
        })
        .catch(err => logError('업무 일정 변경 알림 실패', err, { postId }));
    }

    return {
      workStatus: post.workStatus,
      assignee: nextAssignee ? await loadAssignee(nextAssignee) : null,
      priority: post.priority,
      startDate: post.startDate ?? null,
      dueDate: post.dueDate ?? null,
    };
  },

  /** 내가 담당인 글 모아 보기 */
  async listMyTasks(userId: string, userRole: string, statuses: WorkStatus[]) {
    const boardTypes = await taskBoardTypes(userId, userRole);
    if (boardTypes.length === 0) return [];
    return findTasks(
      { assigneeId: userId, boardType: { [Op.in]: boardTypes } },
      statuses,
      userId,
      userRole
    );
  },

  /** 한 게시판의 업무 전체. 읽을 수 있는 사람이면 누구나 보고, 바꾸기는 canEdit 인 것만. */
  async listBoardTasks(
    boardType: string,
    userId: string,
    userRole: string,
    statuses: WorkStatus[]
  ) {
    await assertTaskBoard(boardType);
    // 'none' 은 업무로 추적하지 않는 일반 글이다. 게시판의 모든 글이 딸려 오지 않게 뺀다.
    // (where 에 workStatus 조건을 걸면 findTasks 의 상태 조건에 덮여 사라진다)
    const tracked = statuses.filter(st => st !== 'none');
    return findTasks({ boardType }, tracked, userId, userRole);
  },

  /** 업무용으로 켠 게시판 중 내가 읽을 수 있는 것. 팀 보기에서 고를 목록이다. */
  async listTaskBoards(userId: string, userRole: string) {
    const accessible = await getAccessibleBoardTypes(userId, userRole);
    if (accessible.length === 0) return [];
    const boards = await Board.findAll({
      where: { id: { [Op.in]: accessible }, taskEnabled: true },
      attributes: ['id', 'name'],
      order: [['order', 'ASC']],
    });
    return boards.map(b => ({ id: b.id, name: b.name }));
  },
};

/** 업무용으로 켠 게시판 중 읽을 수 있는 것. 업무용을 끈 게시판의 예전 담당은 상태를 바꿀 수 없어 뺀다. */
async function taskBoardTypes(userId: string, userRole: string): Promise<string[]> {
  const accessible = await getAccessibleBoardTypes(userId, userRole);
  if (accessible.length === 0) return [];
  const taskBoards = await Board.findAll({
    where: { id: { [Op.in]: accessible }, taskEnabled: true },
    attributes: ['id'],
  });
  return taskBoards.map(b => b.id);
}

const OPEN_LIMIT = 100;
const DONE_LIMIT = 50;

/**
 * 업무 목록 공통 조회.
 *
 * 끝나지 않은 일과 완료한 일을 따로 읽는다. 한 번에 '오래된 순 100건' 으로 읽으면
 * 쌓인 완료 업무가 자리를 먼저 차지해 정작 할 일이 목록에서 빠졌다.
 * 끝나지 않은 일은 오래 방치된 것부터, 완료한 일은 최근에 끝낸 것부터 보여 준다.
 */
async function findTasks(
  where: WhereOptions,
  statuses: WorkStatus[],
  userId: string,
  userRole: string
) {
  const open = statuses.filter(s => s !== 'done');
  const query = (workStatuses: WorkStatus[], order: 'ASC' | 'DESC', limit: number) =>
    workStatuses.length === 0
      ? Promise.resolve([] as Post[])
      : Post.findAll({
          where: { ...where, workStatus: { [Op.in]: workStatuses }, status: 'published' },
          include: [
            { model: Board, as: 'board', attributes: ['name'], required: false },
            { model: User, as: 'assignee', attributes: ['id', 'name', 'avatar'], required: false },
          ],
          attributes: [
            'id',
            'title',
            'boardType',
            'workStatus',
            'priority',
            'assigneeId',
            'startDate',
            'dueDate',
            'createdAt',
            'updatedAt',
            // 비밀글 여부를 함께 읽어 아래에서 거른다
            'isSecret',
            'secretType',
            'secretUserIds',
            'UserId',
          ],
          order: [['updatedAt', order]],
          limit,
        });

  const [openPosts, donePosts] = await Promise.all([
    query(open, 'ASC', OPEN_LIMIT),
    query(statuses.includes('done') ? ['done'] : [], 'DESC', DONE_LIMIT),
  ]);

  // 지정 이후에 비밀글이 되거나 명단에서 빠질 수 있으므로 목록에서도 다시 거른다
  const visible = [...openPosts, ...donePosts].filter(
    p => checkSecretPostAccess(p, userId, userRole).ok
  );

  // 게시판 담당자는 그 게시판의 모든 업무를 바꿀 수 있다. 게시판마다 한 번만 묻는다.
  const managed = new Set(
    (
      await BoardManager.findAll({
        where: { userId, boardId: { [Op.in]: [...new Set(visible.map(p => p.boardType))] } },
        attributes: ['boardId'],
      })
    ).map(m => m.boardId)
  );
  const privileged = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;

  return visible.map(p => {
    const plain = p.get({ plain: true }) as unknown as {
      id: string;
      title: string;
      boardType: string;
      workStatus: WorkStatus;
      priority: TaskPriority;
      assigneeId: string | null;
      startDate: string | null;
      dueDate: string | null;
      createdAt: Date;
      updatedAt: Date;
      UserId: string | null;
      board?: { name: string } | null;
      assignee?: { id: string; name: string; avatar: string | null } | null;
    };
    return {
      id: plain.id,
      title: plain.title,
      boardType: plain.boardType,
      boardName: plain.board?.name ?? plain.boardType,
      workStatus: plain.workStatus,
      priority: plain.priority ?? 'none',
      assignee: plain.assignee
        ? {
            id: plain.assignee.id,
            name: plain.assignee.name,
            avatar: plain.assignee.avatar ?? null,
          }
        : null,
      startDate: plain.startDate ?? null,
      dueDate: plain.dueDate ?? null,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
      // assertCanManage 와 같은 규칙. 화면이 끌 수 없는 카드를 미리 막는 데 쓴다.
      canEdit:
        privileged ||
        plain.UserId === userId ||
        plain.assigneeId === userId ||
        managed.has(plain.boardType),
    };
  });
}

/** 바뀐 것만 활동 기록에 적는다 */
async function recordChanges(
  transaction: Transaction,
  change: {
    postId: string;
    actorId: string;
    status: [string, string] | null;
    assignee: [string | null, string | null] | null;
    schedule: [string | null, string | null] | null;
    priority: [string, string] | null;
  }
) {
  const rows: Array<{
    postId: string;
    actorId: string;
    kind: PostActivityKind;
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
  if (change.priority) {
    rows.push({
      postId: change.postId,
      actorId: change.actorId,
      kind: 'priority',
      fromValue: change.priority[0],
      toValue: change.priority[1],
    });
  }
  if (change.schedule) {
    rows.push({
      postId: change.postId,
      actorId: change.actorId,
      kind: 'schedule',
      fromValue: change.schedule[0],
      toValue: change.schedule[1],
    });
  }
  if (rows.length > 0) await PostActivity.bulkCreate(rows, { transaction });
}

/** 활동 기록용 일정 한 줄. '2026-10-01~2026-10-03', 한쪽이 없으면 비운다. 둘 다 없으면 null. */
/** 알림에 적을 일정. '2026-10-20 ~ 10-24', 한쪽만 있으면 그것만, 둘 다 없으면 '일정 없음'. */
function scheduleLabel(startDate: string | null | undefined, dueDate: string | null | undefined) {
  if (!startDate && !dueDate) return '일정 없음';
  if (startDate && dueDate) return startDate === dueDate ? dueDate : `${startDate} ~ ${dueDate}`;
  return startDate ? `${startDate} 시작` : `${dueDate} 마감`;
}

function scheduleValue(startDate: string | null | undefined, dueDate: string | null | undefined) {
  if (!startDate && !dueDate) return null;
  return `${startDate ?? ''}~${dueDate ?? ''}`;
}

async function loadAssignee(userId: string) {
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
  return user ? { id: user.id, name: user.name, avatar: user.avatar ?? null } : null;
}
