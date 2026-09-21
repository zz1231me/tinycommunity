// 이 게시판을 읽을 수 있는 사용자 판정. 기준은 역할별 BoardAccess와 담당자 BoardManager.

import { Op } from 'sequelize';
import BoardAccess from '../models/BoardAccess';
import { BoardManager } from '../models/BoardManager';

/**
 * 대상자를 걸러내는 where 조건. 아무도 읽을 수 없으면 null (빈 조건은 전원 일치가 된다).
 */
export async function getBoardAudienceWhere(
  boardType: string
): Promise<{ [Op.or]: object[] } | null> {
  const [readableRoles, managers] = await Promise.all([
    BoardAccess.findAll({ where: { boardId: boardType, canRead: true }, attributes: ['roleId'] }),
    BoardManager.findAll({ where: { boardId: boardType }, attributes: ['userId'] }),
  ]);

  const roleIds = readableRoles.map(r => r.roleId);
  const managerIds = managers.map(m => m.userId);
  if (roleIds.length === 0 && managerIds.length === 0) return null;

  return {
    [Op.or]: [
      ...(roleIds.length ? [{ roleId: { [Op.in]: roleIds } }] : []),
      ...(managerIds.length ? [{ id: { [Op.in]: managerIds } }] : []),
    ],
  };
}
