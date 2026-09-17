import { seedTestData } from './helpers';
import { Notification } from '../models/Notification';
import { notificationService } from '../services/notification.service';
import { runLogCleanup } from '../config/bootstrap';

// 알림의 보관 기간.
//
// 알림은 댓글·좋아요·멘션·구독 전파·메시지마다 한 줄씩 쌓인다(구독 전파는 구독자 수만큼).
// 그런데 지우는 길이 사용자가 직접 누르는 것밖에 없었다 — 보안·에러·로그인·감사 로그는
// 모두 보관 기간이 있는데 알림만 빠져 있었다. 오래 돌린 설치에서는 끝없이 늘어나고
// 안 읽은 수 세기와 목록 조회가 함께 느려진다.
//
// 지우는 함수만 만들어 두고 부르지 않으면 아무 일도 일어나지 않으므로,
// 기동 시 도는 정리 작업에 실제로 걸려 있는지도 함께 본다.

/** 며칠 전에 생긴 알림을 만든다 */
async function makeAged(daysAgo: number, message: string): Promise<number> {
  const row = await Notification.create({
    userId: 'admin',
    type: 'SYSTEM',
    message,
    isRead: false,
  });
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  await Notification.update({ createdAt: when }, { where: { id: row.id }, silent: true });
  return row.id;
}

const alive = async (id: number) => (await Notification.findByPk(id)) !== null;

beforeAll(async () => {
  await seedTestData();
});

beforeEach(async () => {
  await Notification.destroy({ where: {}, truncate: true });
});

describe('오래된 알림은 걷어 낸다', () => {
  it('보관 기간이 지난 것은 지운다', async () => {
    const old = await makeAged(120, '오래된 알림');
    await notificationService.deleteOldNotifications(90);
    expect(await alive(old)).toBe(false);
  });

  it('기간 안의 것은 그대로 둔다', async () => {
    const recent = await makeAged(10, '최근 알림');
    await notificationService.deleteOldNotifications(90);
    expect(await alive(recent)).toBe(true);
  });

  it('경계에서 멀쩡한 것을 지우지 않는다', async () => {
    const justInside = await makeAged(89, '89일 전');
    const justOutside = await makeAged(91, '91일 전');

    await notificationService.deleteOldNotifications(90);

    expect(await alive(justInside)).toBe(true);
    expect(await alive(justOutside)).toBe(false);
  });

  it('읽었는지와 무관하게 기간으로만 판단한다', async () => {
    const unreadOld = await Notification.create({
      userId: 'admin',
      type: 'SYSTEM',
      message: '안 읽은 오래된 알림',
      isRead: false,
    });
    await Notification.update(
      { createdAt: new Date(Date.now() - 200 * 86_400_000) },
      { where: { id: unreadOld.id }, silent: true }
    );

    await notificationService.deleteOldNotifications(90);
    expect(await alive(unreadOld.id)).toBe(false);
  });

  it('지운 건수를 돌려준다', async () => {
    await makeAged(100, 'a');
    await makeAged(100, 'b');
    await makeAged(1, 'c');

    expect(await notificationService.deleteOldNotifications(90)).toBe(2);
  });
});

describe('정리 작업에 실제로 걸려 있다', () => {
  it('기동 시 도는 정리에서 오래된 알림도 함께 지워진다', async () => {
    // 지우는 함수를 만들어 두고 부르지 않으면 아무 일도 일어나지 않는다.
    // 다른 기록들과 같은 자리에 걸려 있는지를 확인한다.
    const old = await makeAged(400, '아주 오래된 알림');
    const recent = await makeAged(1, '오늘 알림');

    await runLogCleanup();

    expect(await alive(old)).toBe(false);
    expect(await alive(recent)).toBe(true);
  });
});
