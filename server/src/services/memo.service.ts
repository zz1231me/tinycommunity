import { Memo, MemoColor } from '../models/Memo';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { getSettings } from '../utils/settingsCache';

export class MemoService extends BaseService {
  async getMemos(userId: string): Promise<Memo[]> {
    return Memo.findAll({
      where: { UserId: userId },
      order: [
        ['isPinned', 'DESC'],
        ['order', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: 500, // 사용자당 최대 500개 메모 반환 (무제한 조회 방지)
    });
  }

  async createMemo(
    userId: string,
    data: {
      title?: string;
      content?: string;
      color?: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
    }
  ): Promise<Memo> {
    // 관리자가 동적으로 조정 가능 — settingsCache에서 읽음
    const MAX_MEMOS_PER_USER = getSettings().memoMaxPerUser;

    // 사용자당 최대 메모 수 제한 (DoS 방지).
    // 전체 row를 SELECT FOR UPDATE 잠그는 비용을 피하기 위해 count로 변경.
    // InnoDB가 gap lock으로 phantom INSERT까지 막아주지는 않지만, 200건 한도는
    // strict한 invariant가 아니라 사용자 보호용 상한이므로 트레이드오프 수용.
    return sequelize.transaction(async t => {
      const existingCount = await Memo.count({
        where: { UserId: userId },
        transaction: t,
      });
      if (existingCount >= MAX_MEMOS_PER_USER) {
        throw new AppError(400, `메모는 최대 ${MAX_MEMOS_PER_USER}개까지 생성할 수 있습니다.`);
      }

      // Sequelize .max()로 order 계산 — dialect-aware 인용 부호(MySQL/PG/SQLite 공통)
      const maxOrder = (await Memo.max('order', {
        where: { UserId: userId },
        transaction: t,
      })) as number | null;
      return Memo.create(
        {
          UserId: userId,
          title: data.title || '',
          content: data.content || '',
          color: data.color || 'yellow',
          isPinned: false,
          order: (maxOrder ?? 0) + 1,
        },
        { transaction: t }
      );
    });
  }

  async updateMemo(
    userId: string,
    id: number,
    data: Partial<{
      title: string;
      content: string;
      color: MemoColor;
      isPinned: boolean;
      order: number;
    }>
  ): Promise<Memo> {
    const memo = await Memo.findOne({ where: { id, UserId: userId } });
    if (!memo) throw new AppError(404, '메모를 찾을 수 없습니다.');
    await memo.update(data);
    return memo;
  }

  async deleteMemo(userId: string, id: number): Promise<void> {
    const memo = await Memo.findOne({ where: { id, UserId: userId } });
    if (!memo) throw new AppError(404, '메모를 찾을 수 없습니다.');
    await memo.destroy();
  }
}

export const memoService = new MemoService();
