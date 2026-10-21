// 마감이 가까운(그리고 이미 지난) 업무를 담당자에게 알린다. 주기적으로 돌지만 같은 글은
// 하루 한 번만 알린다.
// 날짜는 프로세스 시간대(운영은 TZ=Asia/Seoul)의 달력 날짜로 센다.
//
// 알림에는 글 제목이 실린다. 담당자로 지정된 뒤에 게시판 권한을 잃었거나, 글이 비밀글이 되어
// 명단에서 빠졌거나, 계정이 정지된 사람에게는 보내지 않는다. '내 업무' 목록이 거르는 것과 같다.

import { Op } from 'sequelize';
import { Post } from '../models/Post';
import Board from '../models/Board';
import { Notification } from '../models/Notification';
import User from '../models/User';
import { notificationService } from './notification.service';
import { featureFlagService } from './featureFlag.service';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { checkSecretPostAccess } from '../utils/postAccess';
import { getTaskSettings } from '../utils/settingsCache';

/** 현지 달력 날짜 'YYYY-MM-DD'. toISOString 은 UTC 라 한국 시간 오전 9시 전에는 하루 전이 된다. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 마감이 지난 뒤 며칠까지 계속 알릴지.
 *
 * 예전에는 오늘부터 앞쪽만 봤다. 마감일 아침에 한 번 울리고 그 뒤로는 조용해서, 그 알림을
 * 놓치면 늦은 일을 아무도 모른 채 지나갔다 — 정작 지난 일이 가장 급한데.
 * 그렇다고 끝없이 알리면 방치된 업무가 매일 같은 말을 반복한다. 일주일에서 끊는다.
 */
const OVERDUE_DAYS = 7;

/** 마감까지 남은 날로 문구를 고른다. 음수면 이미 지난 것이다. */
function whenPhrase(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}일 지났습니다`;
  if (daysLeft === 0) return '오늘입니다';
  if (daysLeft === 1) return '내일입니다';
  return `${daysLeft}일 뒤입니다`;
}

/** 보낸 알림 수를 돌려준다 */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const { reminderDaysBefore, reminderHour } = getTaskSettings();

  // 정해 둔 시각 전에는 보내지 않는다. 주기는 1시간이라, 이 가드가 없으면 자정 직후
  // 첫 차례에 '마감이 오늘입니다' 가 나가 한밤중에 울린다.
  if (now.getHours() < reminderHour) return 0;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 지난 OVERDUE_DAYS 일부터 reminderDaysBefore 일 뒤까지. 0 이면 마감 당일과 지난 것만 알린다.
  const window: string[] = [];
  for (let i = -OVERDUE_DAYS; i <= Math.max(0, reminderDaysBefore); i += 1) {
    window.push(localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  }
  /** 창에서의 자리로 남은 날을 센다. 창의 첫 칸이 OVERDUE_DAYS 일 전이다. */
  const daysLeftOf = (dueDate: string) => window.indexOf(dueDate) - OVERDUE_DAYS;

  const posts = await Post.findAll({
    where: {
      dueDate: { [Op.in]: window },
      workStatus: { [Op.in]: ['todo', 'doing'] },
      assigneeId: { [Op.ne]: null },
      status: 'published',
    },
    // 업무용을 끈 게시판은 내 업무에도 나오지 않으므로 알리지 않는다
    include: [{ model: Board, as: 'board', attributes: [], where: { taskEnabled: true } }],
    attributes: [
      'id',
      'title',
      'boardType',
      'assigneeId',
      'dueDate',
      'isSecret',
      'secretType',
      'secretUserIds',
      'UserId',
    ],
  });
  if (posts.length === 0) return 0;

  // 받을 사람이 지금도 그 글을 볼 수 있는지. 사람마다 한 번만 묻는다.
  const assigneeIds = [...new Set(posts.map(p => p.assigneeId as string))];
  const users = await User.findAll({
    where: { id: { [Op.in]: assigneeIds }, isActive: true, isDeleted: false },
    attributes: ['id', 'roleId'],
  });
  const access = new Map<string, { role: string; boards: Set<string> }>();
  for (const user of users) {
    const role = user.roleId ?? '';
    access.set(user.id, { role, boards: new Set(await getAccessibleBoardTypes(user.id, role)) });
  }
  // 업무 기능을 역할·개인 예외로 끈 사람에게도 보내지 않는다
  const tasksOn = await featureFlagService.filterUsers('post.tasks', [...access.keys()]);
  const canSee = (post: (typeof posts)[number]) => {
    if (!tasksOn.has(post.assigneeId as string)) return false;
    const who = access.get(post.assigneeId as string);
    if (!who || !who.boards.has(post.boardType)) return false;
    return checkSecretPostAccess(post, post.assigneeId as string, who.role).ok;
  };

  // 오늘 이미 알린 글은 건너뛴다. 서버를 다시 켜거나 주기가 여러 번 돌아도 한 번이다.
  const sent = await Notification.findAll({
    where: {
      type: 'TASK_DUE',
      relatedId: { [Op.in]: posts.map(p => p.id) },
      createdAt: { [Op.gte]: startOfToday },
    },
    attributes: ['userId', 'relatedId'],
  });
  const already = new Set(sent.map(n => `${n.userId}:${n.relatedId}`));

  let count = 0;
  for (const post of posts) {
    const userId = post.assigneeId as string;
    if (already.has(`${userId}:${post.id}`) || !canSee(post)) continue;
    const when = whenPhrase(daysLeftOf(post.dueDate as string));
    const created = await notificationService.create({
      userId,
      type: 'TASK_DUE',
      message: `"${post.title}" 마감이 ${when}`,
      link: `/dashboard/posts/${post.boardType}/${post.id}`,
      relatedId: post.id,
    });
    if (created) count += 1;
  }
  return count;
}
