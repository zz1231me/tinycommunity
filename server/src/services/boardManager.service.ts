import { BoardManager } from '../models/BoardManager';
import User from '../models/User';
import Board from '../models/Board';
import { AppError } from '../middlewares/error.middleware';

export class BoardManagerService {
  async listByBoard(boardId: string): Promise<BoardManager[]> {
    return BoardManager.findAll({
      where: { boardId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });
  }

  async listAllBoards(): Promise<Board[]> {
    return Board.findAll({
      where: { isPersonal: false },
      include: [
        {
          model: BoardManager,
          as: 'boardManagers',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'avatar'],
            },
          ],
        },
      ],
      order: [['order', 'ASC']],
    });
  }

  async add(boardId: string, userId: string): Promise<BoardManager> {
    const board = await Board.findByPk(boardId);
    if (!board) throw new AppError(404, '게시판을 찾을 수 없습니다.');
    if (board.isPersonal)
      throw new AppError(400, '개인공간 게시판에는 담당자를 지정할 수 없습니다.');

    const user = await User.findByPk(userId);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    const [record, created] = await BoardManager.findOrCreate({
      where: { boardId, userId },
      defaults: { boardId, userId },
    });

    if (!created) throw new AppError(409, '이미 해당 게시판의 담당자로 지정된 사용자입니다.');

    return record;
  }

  async remove(id: string): Promise<void> {
    const record = await BoardManager.findByPk(id);
    if (!record) throw new AppError(404, '게시판 담당자를 찾을 수 없습니다.');
    await record.destroy();
  }

  async isManager(boardId: string, userId: string): Promise<boolean> {
    const record = await BoardManager.findOne({ where: { boardId, userId } });
    return record !== null;
  }

  /**
   * 해당 게시판을 관리할 수 있는지 — admin/manager(전역) 또는 해당 게시판 담당자(BoardManager).
   * 게시판 내 태그/기본정보 관리 인가에 사용.
   */
  async canManage(boardId: string, userId: string, role: string): Promise<boolean> {
    if (role === 'admin' || role === 'manager') return true;
    return this.isManager(boardId, userId);
  }
}

export const boardManagerService = new BoardManagerService();
