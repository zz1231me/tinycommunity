import { Request, Response } from 'express';
import { fn, col, literal, Op, type FindOptions } from 'sequelize';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';
import { Board } from '../models/Board';
import { LoginHistory } from '../models/LoginHistory';
import { Role } from '../models/Role';
import { Report } from '../models/Report';
import { PasswordResetRequest } from '../models/PasswordResetRequest';
import { sequelize } from '../config/sequelize';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

// 그래프 칸을 지역 시각 기준으로 나눈다. SQLite 는 UTC 저장이라 localtime 변환이 필요하고,
// MySQL/MariaDB 는 연결이 +09:00 으로 고정돼 이미 지역 시각이다. Postgres 는 to_char 를 쓴다.
function bucketExpr(unit: 'month' | 'day'): string {
  const sqlite = unit === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const other = unit === 'month' ? '%Y-%m' : '%Y-%m-%d';
  switch (sequelize.getDialect()) {
    case 'sqlite':
      return `strftime('${sqlite}', createdAt, 'localtime')`;
    case 'postgres':
      return `to_char("createdAt" AT TIME ZONE INTERVAL '+09:00', '${unit === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}')`;
    default:
      return `DATE_FORMAT(createdAt, '${other}')`;
  }
}

const MONTH_EXPR = bucketExpr('month');
const DAY_EXPR = bucketExpr('day');

type Bucket = { key: string; count: number };

/** '최근' 의 기준 일수. 게시판 활력과 상위 작성자에 같이 쓴다. */
const RECENT_DAYS = 30;

// 관리자 대시보드 통계
export const getAdminStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    // 최근 6개월(이번 달 포함)의 1일 0시부터
    const sinceMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    // 최근 14일
    const sinceDays = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
    sinceDays.setHours(0, 0, 0, 0);

    const groupByMonth: FindOptions = {
      attributes: [
        [literal(MONTH_EXPR), 'key'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { createdAt: { [Op.gte]: sinceMonths } },
      // group 타입에 Literal 이 없지만 런타임은 지원하므로 캐스팅한다
      group: [literal(MONTH_EXPR) as unknown as string],
      order: [literal(`${MONTH_EXPR} ASC`)],
      raw: true,
    };

    const sinceRecent = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      totalPosts,
      totalComments,
      totalBoards,
      signupRows,
      postRows,
      loginRows,
      roleRows,
      roles,
      pendingReports,
      pendingPasswordResets,
      boards,
      boardPostRows,
      boardRecentPostRows,
      topAuthorRows,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { isActive: true } }),
      User.count({ where: { isActive: false } }),
      Post.count(),
      Comment.count(),
      Board.count({ where: { isPersonal: false } }),
      User.findAll(groupByMonth),
      Post.findAll(groupByMonth),
      LoginHistory.findAll({
        attributes: [
          [literal(DAY_EXPR), 'key'],
          [fn('COUNT', col('id')), 'count'],
        ],
        where: { createdAt: { [Op.gte]: sinceDays } },
        group: [literal(DAY_EXPR) as unknown as string],
        order: [literal(`${DAY_EXPR} ASC`)],
        raw: true,
      }),
      User.findAll({
        attributes: ['roleId', [fn('COUNT', col('id')), 'count']],
        group: ['roleId'],
        raw: true,
      }),
      Role.findAll({ attributes: ['id', 'name'], raw: true }),
      // 운영자가 지금 처리해야 하는 항목 수
      Report.count({ where: { status: 'pending' } }),
      PasswordResetRequest.count({ where: { status: 'pending' } }),
      Board.findAll({ where: { isPersonal: false }, attributes: ['id', 'name'], raw: true }),
      Post.findAll({
        attributes: ['boardType', [fn('COUNT', col('id')), 'count']],
        group: ['boardType'],
        raw: true,
      }),
      Post.findAll({
        attributes: ['boardType', [fn('COUNT', col('id')), 'count']],
        where: { createdAt: { [Op.gte]: sinceRecent } },
        group: ['boardType'],
        raw: true,
      }),
      Post.findAll({
        attributes: ['UserId', [fn('COUNT', col('Post.id')), 'count']],
        where: { createdAt: { [Op.gte]: sinceRecent }, UserId: { [Op.ne]: null } },
        include: [{ model: User, as: 'user', attributes: ['name'], required: true }],
        group: ['UserId', 'user.id'],
        order: [[literal('count'), 'DESC']],
        limit: 5,
        raw: true,
        nest: true,
      }),
    ]);

    const toBuckets = (rows: unknown): Bucket[] =>
      (rows as Array<{ key: string; count: number }>).map(r => ({
        key: r.key,
        count: Number(r.count),
      }));

    const roleName = new Map(
      (roles as unknown as Array<{ id: string; name: string }>).map(r => [r.id, r.name])
    );
    const usersByRole = (roleRows as unknown as Array<{ roleId: string; count: number }>).map(
      r => ({
        role: roleName.get(r.roleId) ?? r.roleId ?? '미지정',
        count: Number(r.count),
      })
    );

    // 전체 글 수만으로는 죽은 게시판을 구분할 수 없어 최근 글 수를 함께 낸다.
    const totalByBoard = new Map(
      (boardPostRows as unknown as Array<{ boardType: string; count: number }>).map(r => [
        r.boardType,
        Number(r.count),
      ])
    );
    const recentByBoard = new Map(
      (boardRecentPostRows as unknown as Array<{ boardType: string; count: number }>).map(r => [
        r.boardType,
        Number(r.count),
      ])
    );
    const boardActivity = (boards as unknown as Array<{ id: string; name: string }>)
      .map(b => ({
        boardId: b.id,
        name: b.name,
        totalPosts: totalByBoard.get(b.id) ?? 0,
        recentPosts: recentByBoard.get(b.id) ?? 0,
      }))
      .sort((a, b) => b.recentPosts - a.recentPosts || b.totalPosts - a.totalPosts);

    const topAuthors = (
      topAuthorRows as unknown as Array<{
        UserId: string;
        count: number;
        user: { name: string | null };
      }>
    ).map(r => ({
      userId: r.UserId,
      name: r.user?.name ?? r.UserId,
      count: Number(r.count),
    }));

    sendSuccess(res, {
      summary: {
        totalUsers,
        activeUsers,
        pendingUsers,
        totalPosts,
        totalComments,
        totalBoards,
      },
      // 대기 중인 처리 항목
      pending: {
        userApprovals: pendingUsers,
        reports: pendingReports,
        passwordResets: pendingPasswordResets,
      },
      recentDays: RECENT_DAYS,
      boardActivity,
      topAuthors,
      signupsByMonth: toBuckets(signupRows),
      postsByMonth: toBuckets(postRows),
      loginsByDay: toBuckets(loginRows),
      usersByRole,
    });
  } catch (error) {
    logError('통계 조회 실패', error);
    sendError(res, 500, '통계 조회 실패');
  }
};
