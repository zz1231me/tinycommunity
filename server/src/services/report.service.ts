// 콘텐츠 신고 서비스
import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/sequelize';
import { Report, ReportTargetType, ReportReason, ReportStatus } from '../models/Report';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';
import { User } from '../models/User';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { boardService } from './board.service';

export class ReportService extends BaseService {
  async createReport(params: {
    reporterId: string;
    reporterRole: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    description?: string;
  }): Promise<Report> {
    const { reporterId, reporterRole, targetType, targetId, reason, description } = params;

    let boardType: string;
    if (targetType === 'post') {
      const post = await Post.findByPk(targetId, { attributes: ['id', 'UserId', 'boardType'] });
      if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');
      if (post.UserId === reporterId)
        throw new AppError(400, '자신의 게시글은 신고할 수 없습니다.');
      boardType = post.boardType;
    } else {
      const comment = await Comment.findByPk(targetId, { attributes: ['id', 'UserId', 'PostId'] });
      if (!comment) throw new AppError(404, '댓글을 찾을 수 없습니다.');
      if (comment.UserId === reporterId)
        throw new AppError(400, '자신의 댓글은 신고할 수 없습니다.');
      const parentPost = await Post.findByPk(comment.PostId, { attributes: ['boardType'] });
      if (!parentPost) throw new AppError(404, '게시글을 찾을 수 없습니다.');
      boardType = parentPost.boardType;
    }

    // 게시판 읽기 권한이 있어야 신고할 수 있다. 없으면 존재 여부를 떠보는 창구가 된다.
    const access = await boardService.checkPermission(
      reporterId,
      reporterRole,
      boardType,
      'canRead'
    );
    if (!access.hasAccess) {
      throw new AppError(403, '접근 권한이 없는 게시판의 콘텐츠는 신고할 수 없습니다.');
    }

    const existing = await Report.findOne({
      where: { reporterId, targetType, targetId },
    });
    if (existing) throw new AppError(409, '이미 신고한 콘텐츠입니다.');

    try {
      return await Report.create({ reporterId, targetType, targetId, reason, description });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '이미 신고한 콘텐츠입니다.');
      }
      throw err;
    }
  }

  async getReports(params: {
    status?: ReportStatus;
    targetType?: ReportTargetType;
    page?: number;
    limit?: number;
  }) {
    const pagination = this.buildPagination({ page: params.page, limit: params.limit });
    const where: Record<string, unknown> = {};

    if (params.status) where['status'] = params.status;
    if (params.targetType) where['targetType'] = params.targetType;

    const { rows, count } = await Report.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'reporter',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      // 시각이 같을 때 id 로 가르지 않으면 페이지 경계에서 신고가 중복되거나 빠진다.
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    // 대상 정보는 N+1 을 피하려고 한 번에 모아 온다.
    const plains = rows.map(
      report => report.get({ plain: true }) as Report & { reporter?: { id: string; name: string } }
    );

    const postIds = plains.filter(r => r.targetType === 'post').map(r => r.targetId);
    const commentIds = plains.filter(r => r.targetType === 'comment').map(r => r.targetId);

    const [postsData, commentsData] = await Promise.all([
      postIds.length > 0
        ? Post.findAll({
            where: { id: { [Op.in]: postIds } },
            attributes: ['id', 'title'],
            paranoid: false,
          })
        : Promise.resolve([]),
      commentIds.length > 0
        ? Comment.findAll({
            where: { id: { [Op.in]: commentIds } },
            attributes: ['id', 'content'],
            paranoid: false,
          })
        : Promise.resolve([]),
    ]);

    const postMap = new Map(
      postsData.map(p => [String(p.id), p.get({ plain: true }) as { title: string }])
    );
    const commentMap = new Map(
      commentsData.map(c => [String(c.id), c.get({ plain: true }) as { content: string }])
    );

    // 처리자 이름도 한 번에 모아 온다.
    const reviewerIds = [
      ...new Set(
        plains
          .map(r => (r as { reviewedBy?: string | null }).reviewedBy)
          .filter((x): x is string => !!x)
      ),
    ];
    const reviewersData =
      reviewerIds.length > 0
        ? await User.findAll({
            where: { id: { [Op.in]: reviewerIds } },
            attributes: ['id', 'name'],
            paranoid: false,
          })
        : [];
    const reviewerMap = new Map(
      reviewersData.map(u => [String(u.id), (u.get({ plain: true }) as { name: string }).name])
    );

    const enriched = plains.map(plain => {
      let targetInfo: { title?: string; content?: string } = {};
      if (plain.targetType === 'post') {
        const p = postMap.get(plain.targetId);
        if (p) targetInfo = { title: p.title };
      } else {
        const c = commentMap.get(plain.targetId);
        if (c) targetInfo = { content: c.content?.substring(0, 100) };
      }
      const reviewedBy = (plain as { reviewedBy?: string | null }).reviewedBy;
      const reviewedByName = reviewedBy ? (reviewerMap.get(reviewedBy) ?? reviewedBy) : null;
      return { ...plain, targetInfo, reviewedByName };
    });

    return this.buildPagedResponse(enriched, count, pagination);
  }

  async reviewReport(params: {
    reportId: number;
    reviewerId: string;
    status: 'reviewed' | 'dismissed' | 'action_taken';
    reviewNote?: string;
  }): Promise<Report> {
    return sequelize.transaction(async t => {
      const report = await Report.findByPk(params.reportId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!report) throw new AppError(404, '신고를 찾을 수 없습니다.');
      if (report.status !== 'pending') throw new AppError(400, '이미 처리된 신고입니다.');

      await report.update(
        {
          status: params.status,
          reviewedBy: params.reviewerId,
          reviewedAt: new Date(),
          reviewNote: params.reviewNote,
        },
        { transaction: t }
      );

      return report;
    });
  }

  async getReportStats() {
    const [pending, reviewed, dismissed, action_taken] = await Promise.all([
      Report.count({ where: { status: 'pending' } }),
      Report.count({ where: { status: 'reviewed' } }),
      Report.count({ where: { status: 'dismissed' } }),
      Report.count({ where: { status: 'action_taken' } }),
    ]);

    const recentPending = await Report.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [{ model: User, as: 'reporter', attributes: ['id', 'name'], required: false }],
    });

    return {
      counts: {
        pending,
        reviewed,
        dismissed,
        action_taken,
        total: pending + reviewed + dismissed + action_taken,
      },
      recentPending: recentPending.map(r => r.get({ plain: true })),
    };
  }

  async getTargetReportCount(targetType: ReportTargetType, targetId: string): Promise<number> {
    return Report.count({
      where: {
        targetType,
        targetId,
        status: { [Op.in]: ['pending', 'action_taken'] },
      },
    });
  }
}

export const reportService = new ReportService();
