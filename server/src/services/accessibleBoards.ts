// 사용자가 읽을 수 있는 게시판 id 목록. 검색과 목록 조회가 같은 기준을 써야 한다.
// 기준: 역할별 읽기 권한 + 게시판 담당자 + 본인 개인 폴더. 비활성 게시판은 제외한다.

import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { BoardManager } from '../models/BoardManager';

export async function getAccessibleBoardTypes(userId: string, userRole: string): Promise<string[]> {
  const [generalBoards, managedBoards, personalBoard] = await Promise.all([
    BoardAccess.findAll({
      where: { roleId: userRole, canRead: true },
      include: [
        {
          model: Board,
          as: 'board',
          where: { isActive: true, isPersonal: false },
          required: true,
          attributes: ['id'],
        },
      ],
      attributes: ['boardId'],
    }),
    BoardManager.findAll({
      where: { userId },
      include: [
        {
          model: Board,
          as: 'board',
          where: { isActive: true, isPersonal: false },
          required: true,
          attributes: ['id'],
        },
      ],
      attributes: ['boardId'],
    }),
    Board.findOne({
      where: { isPersonal: true, ownerId: userId, isActive: true },
      attributes: ['id'],
    }),
  ]);

  return [
    ...new Set([
      ...generalBoards.map(a => a.boardId),
      ...managedBoards.map(m => m.boardId),
      ...(personalBoard ? [personalBoard.id] : []),
    ]),
  ];
}
