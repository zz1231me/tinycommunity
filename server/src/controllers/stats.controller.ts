import { Request, Response } from 'express';
import { fn, col, literal, Op, type FindOptions } from 'sequelize';
import { User } from '../models/User';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';
import { Board } from '../models/Board';
import { LoginHistory } from '../models/LoginHistory';
import { Role } from '../models/Role';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

// SQLite 날짜는 'YYYY-MM-DD HH:MM:SS.SSS +00:00' 문자열로 저장되므로
// strftime(타임존 파싱 이슈)보다 substr가 안전하다: 1~7=YYYY-MM, 1~10=YYYY-MM-DD.
const MONTH_EXPR = 'substr(createdAt,1,7)';
const DAY_EXPR = 'substr(createdAt,1,10)';

type Bucket = { key: string; count: number };

// 관리자 대시보드 통계 — 요약 카운트 + 가입/게시글 월별, 로그인 일별, 역할별 분포
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
      // group 타입은 Literal을 명시하지 않지만 런타임은 지원 — 안전하게 캐스팅
      group: [literal(MONTH_EXPR) as unknown as string],
      order: [literal(`${MONTH_EXPR} ASC`)],
      raw: true,
    };

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
    ]);

    const toBuckets = (rows: unknown): Bucket[] =>
      (rows as Array<{ key: string; count: number }>).map(r => ({
        key: r.key,
        count: Number(r.count),
      }));

    const roleName = new Map(
      (roles as unknown as Array<{ id: string; name: string }>).map(r => [r.id, r.name])
    );
    const usersByRole = (roleRows as unknown as Array<{ roleId: string; count: number }>).map(r => ({
      role: roleName.get(r.roleId) ?? r.roleId ?? '미지정',
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
