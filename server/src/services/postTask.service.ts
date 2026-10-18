// 게시글의 업무 상태와 담당자. 작성자·담당자 본인·게시판 담당자·관리자가 바꿀 수 있다.

import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { Post } from '../models/Post';
import { PostActivity, type PostActivityKind } from '../models/PostActivity';
import User from '../models/User';
import Board from '../models/Board';
import { BoardManager } from '../models/BoardManager';
import { AppError } from '../middlewares/error.middleware';
import { ROLES } from '../config/constants';
import { isWorkStatus, WORK_STATUS_KEYS, type WorkStatus } from '../config/workStatus';
import { isTaskPriority, type TaskPriority } from '../config/taskPriority';
import { notificationService } from './notification.service';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { checkUserBoardPermission } from '../controllers/board.controller';
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

/**
 * 주소의 게시판에 정말 있는, 지금 읽을 수 있는 글인지. 아니면 없는 것처럼 답한다.
 * 라우터의 읽기 확인은 주소의 게시판만 보므로 글 자체를 여기서 다시 본다.
 */
async function assertVisibleTask(
  boardType: string,
  postId: string,
  userId: string,
  userRole: string
) {
  const post = await Post.findByPk(postId, {
    attributes: ['id', 'boardType', 'status', 'isSecret', 'secretType', 'secretUserIds', 'UserId'],
  });
  if (
    !post ||
    post.boardType !== boardType ||
    post.status !== 'published' ||
    !checkSecretPostAccess(post, userId, userRole).ok
  ) {
    throw new AppError(404, '게시글을 찾을 수 없습니다.');
  }
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

/** 하위 업무 제목 상한. 한 줄짜리 할 일이라 글 제목보다 짧게 둔다. */
const SUBTASK_TITLE_MAX = 200;

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

  /**
   * 들어갈 수 있는 업무 게시판 전부를 한 장으로. 공용 간트가 쓴다.
   *
   * listMyTasks 와 같은 범위(taskBoardTypes)를 보되 담당자 조건만 뺀다 — 즉 이미
   * 게시판 팀 보기로 볼 수 있던 것들이고, 새로 드러나는 업무는 없다. 비밀글·
   * 못 들어가는 게시판은 findTasks 가 거른다.
   */
  async listAllTasks(userId: string, userRole: string, statuses: WorkStatus[]) {
    const boardTypes = await taskBoardTypes(userId, userRole);
    if (boardTypes.length === 0) return [];
    // 'none' 은 업무로 추적하지 않는 일반 글이라 뺀다(팀 보기와 같은 규칙).
    const tracked = statuses.filter(st => st !== 'none');
    return findTasks({ boardType: { [Op.in]: boardTypes } }, tracked, userId, userRole);
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

  /**
   * 한 업무에 딸린 하위 업무. 끝난 것까지 모두 준다 — '3/5 끝남' 을 세려면 끝난 것도 세야 한다.
   *
   * 라우터는 주소에 적힌 게시판의 읽기 권한만 본다. 읽을 수 있는 게시판 주소에 다른 게시판
   * 글의 id 를 끼워 넣으면 그 글의 하위 목록이 새 나간다(역링크에서 막은 것과 같은 구멍).
   * 상위 글이 정말 그 게시판의 것인지 다시 보고, 하위도 읽을 수 있는 게시판의 것만 준다
   * — 하위는 나중에 다른 게시판으로 옮겨질 수 있다.
   */
  async listSubtasks(boardType: string, parentId: string, userId: string, userRole: string) {
    await assertVisibleTask(boardType, parentId, userId, userRole);
    const accessible = await getAccessibleBoardTypes(userId, userRole);
    if (accessible.length === 0) return [];
    return findTasks(
      { parentTaskId: parentId, boardType: { [Op.in]: accessible } },
      [...WORK_STATUS_KEYS],
      userId,
      userRole
    );
  },

  /**
   * 하위 업무를 하나 만든다. 글 하나가 그대로 하위 업무가 되므로 담당자·마감·상태를
   * 상위와 따로 가진다(지라의 subtask 자리).
   *
   * 한 단계만 둔다 — 하위의 하위를 허용하면 고리가 생기고 화면도 끝없이 펼쳐진다.
   * 담당자를 함께 받으면 change() 로 지정해 알림·활동 기록이 평소 길과 같게 남는다.
   */
  async addSubtask(params: {
    boardType: string;
    parentId: string;
    title: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    actorId: string;
    actorRole: string;
    actorName: string;
  }) {
    const title = params.title.trim();
    if (!title) throw new AppError(400, '하위 업무의 제목을 적어주세요.');
    if (title.length > SUBTASK_TITLE_MAX) {
      throw new AppError(400, `제목은 ${SUBTASK_TITLE_MAX}자를 넘을 수 없습니다.`);
    }

    const parent = await Post.findByPk(params.parentId);
    // 주소의 게시판과 글의 게시판이 다르면 없는 것으로 본다 — change() 와 같은 규칙.
    if (!parent || parent.status !== 'published' || parent.boardType !== params.boardType) {
      throw new AppError(404, '상위 업무를 찾을 수 없습니다.');
    }
    if (parent.parentTaskId) {
      throw new AppError(400, '하위 업무 아래에는 다시 하위 업무를 둘 수 없습니다.');
    }
    await assertTaskBoard(parent.boardType);
    await assertCanManage(parent, params.actorId, params.actorRole);
    // 하위 업무도 글 하나다. 읽기만 되는 게시판에 글이 생기지 않게 쓰기 권한까지 본다
    // — 담당자라는 이유로 글쓰기 권한이 생기면 안 된다.
    const writable = await checkUserBoardPermission(
      params.actorId,
      params.actorRole,
      parent.boardType,
      'canWrite'
    );
    if (!writable.hasAccess) {
      throw new AppError(403, '이 게시판에 글을 쓸 권한이 없습니다.');
    }

    const child = await Post.create({
      title,
      // 본문은 비워 둔다. 하위 업무는 '할 일 한 줄' 이고, 필요하면 글처럼 열어 채운다.
      content: '',
      boardType: parent.boardType,
      author: params.actorName,
      UserId: params.actorId,
      parentTaskId: parent.id,
      workStatus: 'todo',
      status: 'published',
    });

    if (params.assigneeId || params.dueDate) {
      await postTaskService.change({
        postId: child.id,
        boardType: parent.boardType,
        actorId: params.actorId,
        actorRole: params.actorRole,
        actorName: params.actorName,
        ...(params.assigneeId ? { assigneeId: params.assigneeId } : {}),
        ...(params.dueDate ? { dueDate: params.dueDate } : {}),
      });
    }

    const [view] = await findTasks(
      { id: child.id },
      [...WORK_STATUS_KEYS],
      params.actorId,
      params.actorRole
    );
    return view;
  },

  /** 하위에서 떼어 낸다. 글은 지우지 않는다 — 혼자 선 업무로 남는다. */
  async detachSubtask(
    boardType: string,
    parentId: string,
    childId: string,
    actorId: string,
    actorRole: string
  ) {
    const child = await Post.findByPk(childId);
    // 주소의 게시판·상위가 모두 맞아야 한다. 번호만 알고 떼어 내지 못하게.
    if (!child || child.parentTaskId !== parentId || child.boardType !== boardType) {
      throw new AppError(404, '하위 업무를 찾을 수 없습니다.');
    }
    await assertCanManage(child, actorId, actorRole);
    child.parentTaskId = null;
    await child.save();
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
