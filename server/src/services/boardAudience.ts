// server/src/services/boardAudience.ts
// 이 게시판을 읽을 수 있는 사람들.
//
// getAccessibleBoardTypes 의 반대 방향이다. 그쪽은 "이 사람이 볼 수 있는 게시판" 을,
// 여기서는 "이 게시판을 볼 수 있는 사람" 을 구한다. 둘의 기준이 어긋나면
// 담당자 후보로 뜨는데 지정은 거부되는 식의 불일치가 생기므로 판정 근거를 맞춰 둔다:
// 역할별 읽기 권한(BoardAccess) + 게시판 담당자(BoardManager).

import { Op } from 'sequelize';
import BoardAccess from '../models/BoardAccess';
import { BoardManager } from '../models/BoardManager';

/**
 * 대상자를 걸러내는 where 조건. 아무도 읽을 수 없는 게시판이면 null 을 준다 —
 * 빈 조건을 돌려주면 "조건 없음" 이 되어 전원이 걸리기 때문에 호출부가 구분해야 한다.
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
