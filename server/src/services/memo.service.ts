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
      // 생성 상한과 같은 값을 써야 만들어진 메모가 목록에서 빠지지 않는다
      limit: getSettings().memoMaxPerUser,
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
    const MAX_MEMOS_PER_USER = getSettings().memoMaxPerUser;

    // 사용자당 최대 메모 수 제한. 잠금 대신 count 를 쓰므로 phantom INSERT 는 막지 못한다.
    return sequelize.transaction(async t => {
      const existingCount = await Memo.count({
        where: { UserId: userId },
        transaction: t,
      });
      if (existingCount >= MAX_MEMOS_PER_USER) {
        throw new AppError(400, `메모는 최대 ${MAX_MEMOS_PER_USER}개까지 생성할 수 있습니다.`);
      }

      // Sequelize .max() 는 dialect 별 인용 부호를 알아서 처리한다
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
