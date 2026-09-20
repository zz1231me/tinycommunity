// server/src/__tests__/boardDeleteCleanup.test.ts
// 게시판을 지우면 그 게시판에 딸린 것도 함께 사라지는가.
//
// 권한·담당자·태그는 이미 지운다(같은 id 로 다시 만들었을 때 되살아나지 않게). 구독만 빠져
// 있어서, 같은 id 로 새 게시판을 만들면 예전에 구독했던 사람에게 알림이 다시 가기 시작했다 —
// 그 사람은 구독한 적이 없는 게시판이다.

import { seedTestData } from './helpers';
import Board from '../models/Board';
import { Subscription } from '../models/Subscription';
import { boardService } from '../services/board.service';

const BOARD = 'cleanupboard';

beforeAll(async () => {
  await seedTestData();
});

beforeEach(async () => {
  await Board.destroy({ where: { id: BOARD }, force: true });
  await Subscription.destroy({ where: { targetType: 'board', targetId: BOARD } });
  await Board.create({
    id: BOARD,
    name: '정리 시험용',
    description: '정리 시험용',
    isPersonal: false,
    isActive: true,
  } as never);
});

describe('게시판을 지우면', () => {
  it('그 게시판 구독도 함께 지운다 — 같은 id 로 다시 만들어도 되살아나지 않는다', async () => {
    await Subscription.create({
      userId: 'testuser',
      targetType: 'board',
      targetId: BOARD,
    } as never);

    await boardService.deleteBoard(BOARD);

    const left = await Subscription.count({ where: { targetType: 'board', targetId: BOARD } });
    expect(left).toBe(0);
  });

  it('다른 게시판 구독은 건드리지 않는다 — 대조', async () => {
    await Subscription.destroy({ where: { targetType: 'board', targetId: 'notice' } });
    await Subscription.create({
      userId: 'testuser',
      targetType: 'board',
      targetId: 'notice',
    } as never);

    await boardService.deleteBoard(BOARD);

    const left = await Subscription.count({ where: { targetType: 'board', targetId: 'notice' } });
    expect(left).toBe(1);
  });
});
