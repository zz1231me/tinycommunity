import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Notification } from '../models/Notification';
import { NotificationSetting } from '../models/NotificationSetting';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

// 메시지.
//
// 지켜야 하는 선:
//  1. 남의 대화는 열리지 않는다 — 있는지 없는지도 알려 주지 않는다.
//  2. 내가 지운 대화가 상대 쪽에서도 사라지지 않는다.
//  3. 같은 두 사람의 대화는 언제나 하나다.

let adminCookie: string;
let userCookie: string;
let thirdCookie: string;

function send(cookie: string, recipientId: string, content: string) {
  return request(app)
    .post('/api/messages')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ recipientId, content });
}

function conversations(cookie: string) {
  return request(app).get('/api/messages/conversations').set('Cookie', cookie);
}

function openConversation(cookie: string, id: string, query = '') {
  return request(app).get(`/api/messages/conversations/${id}${query}`).set('Cookie', cookie);
}

async function clearMessages() {
  await Message.destroy({ where: {} });
  await Conversation.destroy({ where: {} });
  await Notification.destroy({ where: {} });
  await NotificationSetting.destroy({ where: {}, truncate: true });
  await FeatureFlag.destroy({ where: {}, truncate: true });
  featureFlagService.invalidate();
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다

  // 세 번째 사람 — 남의 대화에 못 들어가는지 확인용
  const third = await User.findByPk('thirduser');
  if (!third) {
    await User.create({
      id: 'thirduser',
      password: 'TestThird123!',
      name: '제삼자',
      email: 'third@test.com',
      roleId: 'user',
      isActive: true,
    });
  }

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
  thirdCookie = await loginAs('thirduser', 'TestThird123!');
});

afterEach(clearMessages);

describe('보내기', () => {
  it('보내면 대화가 만들어지고 양쪽 목록에 뜬다', async () => {
    const res = await send(userCookie, 'admin', '안녕하세요');
    expect(res.status).toBe(201);
    expect(res.body.data.conversationId).toBeTruthy();

    const mine = await conversations(userCookie);
    const theirs = await conversations(adminCookie);
    expect(mine.body.data).toHaveLength(1);
    expect(theirs.body.data).toHaveLength(1);
    expect(mine.body.data[0].partner.name).toBe('관리자');
    expect(theirs.body.data[0].partner.name).toBe('테스트사용자');
  });

  it('보낸 결과가 대화 목록과 같은 모양이다', async () => {
    // 화면이 이 값을 그대로 목록에 이어 붙인다 — 모양이 다르면
    // 보낸 직후와 새로고침 후가 다르게 그려진다.
    const res = await send(userCookie, 'admin', '모양 확인');
    expect(res.body.data.message).toEqual({
      id: expect.any(Number),
      senderId: 'testuser',
      fromMe: true,
      content: '모양 확인',
      createdAt: expect.any(String),
    });
  });

  it('같은 두 사람의 대화는 방향이 달라도 하나다', async () => {
    const first = await send(userCookie, 'admin', '먼저');
    const second = await send(adminCookie, 'testuser', '답장');

    expect(second.body.data.conversationId).toBe(first.body.data.conversationId);
    expect(await Conversation.count()).toBe(1);
  });

  it('자기 자신에게는 보낼 수 없다', async () => {
    expect((await send(userCookie, 'testuser', '혼잣말')).status).toBe(400);
  });

  it('없는 사람에게는 보낼 수 없다', async () => {
    expect((await send(userCookie, 'ghost', '아무나')).status).toBe(404);
  });

  it('빈 내용은 보낼 수 없다', async () => {
    expect((await send(userCookie, 'admin', '   ')).status).toBe(400);
  });

  it('너무 긴 내용은 거절한다', async () => {
    expect((await send(userCookie, 'admin', 'ㄱ'.repeat(2001))).status).toBe(400);
  });

  it('받는 사람에게 알림이 간다 — 다만 내용은 싣지 않는다', async () => {
    await send(userCookie, 'admin', '이 문장은 알림에 없어야 한다');
    await new Promise(r => setTimeout(r, 250));

    const notes = await Notification.findAll({ where: { userId: 'admin', type: 'MESSAGE' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('테스트사용자');
    // 알림 목록은 다른 사람 눈에 띄기 쉬운 자리다
    expect(notes[0].message).not.toContain('이 문장은');
  });

  it('알림 만들다 터져도 메시지는 저장되고 201 이 나간다', async () => {
    // 알림은 트랜잭션 밖의 곁가지다. 그런데 보낸 사람 이름 조회를 인자 자리에서
    // await 하고 있어서, 그 조회가 실패하면 .catch 가 덮지 못하고 500 이 나갔다 —
    // 메시지는 이미 커밋된 뒤라 "보내기 실패라는데 상대는 받은" 상태가 된다.
    // 인증 미들웨어도 User.findByPk 를 쓴다. 그쪽까지 막으면 인증이 먼저 깨져
    // 무엇 때문에 500 인지 알 수 없으므로, 알림 문구용 조회(attributes: ['name'])만 고른다.
    const original = User.findByPk.bind(User);
    const spy = jest
      .spyOn(User, 'findByPk')
      .mockImplementation(((id: string, options?: { attributes?: string[] }) =>
        options?.attributes?.length === 1 && options.attributes[0] === 'name'
          ? Promise.reject(new Error('이름 조회 실패'))
          : original(id, options as never)) as typeof User.findByPk);

    try {
      const res = await send(userCookie, 'admin', '알림이 터져도 이건 남아야 한다');
      expect(res.status).toBe(201);
      await new Promise(r => setTimeout(r, 250));
      expect(await Message.count({ where: { content: '알림이 터져도 이건 남아야 한다' } })).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('메시지 알림을 끈 사람에게는 알림이 가지 않는다', async () => {
    await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ MESSAGE: false });

    await send(userCookie, 'admin', '조용히');
    await new Promise(r => setTimeout(r, 250));

    expect(await Notification.count({ where: { userId: 'admin', type: 'MESSAGE' } })).toBe(0);
  });
});

describe('대화 열기', () => {
  it('오래된 것부터 순서대로 준다', async () => {
    const { body } = await send(userCookie, 'admin', '첫 번째');
    await send(adminCookie, 'testuser', '두 번째');
    await send(userCookie, 'admin', '세 번째');

    const res = await openConversation(userCookie, body.data.conversationId);
    expect(res.status).toBe(200);
    expect(res.body.data.messages.map((m: { content: string }) => m.content)).toEqual([
      '첫 번째',
      '두 번째',
      '세 번째',
    ]);
  });

  it('내가 보낸 것과 받은 것을 구분해 준다', async () => {
    const { body } = await send(userCookie, 'admin', '내가 보냄');
    await send(adminCookie, 'testuser', '내가 받음');

    const res = await openConversation(userCookie, body.data.conversationId);
    expect(res.body.data.messages.map((m: { fromMe: boolean }) => m.fromMe)).toEqual([true, false]);
  });

  it('열면 상대가 보낸 메시지가 읽음 처리된다', async () => {
    const { body } = await send(adminCookie, 'testuser', '읽어 주세요');

    const before = await conversations(userCookie);
    expect(before.body.data[0].unreadCount).toBe(1);

    await openConversation(userCookie, body.data.conversationId);

    const after = await conversations(userCookie);
    expect(after.body.data[0].unreadCount).toBe(0);
  });

  it('내가 보낸 메시지는 내가 열어도 읽음이 되지 않는다', async () => {
    // 읽음은 받는 사람 기준이다 — 보낸 사람이 대화를 열었다고 상대가 읽은 것이 아니다
    const { body } = await send(userCookie, 'admin', '내 메시지');
    await openConversation(userCookie, body.data.conversationId);

    const adminSide = await conversations(adminCookie);
    expect(adminSide.body.data[0].unreadCount).toBe(1);
  });

  it('cursor 로 이전 메시지를 이어 받는다', async () => {
    const { body } = await send(userCookie, 'admin', 'm1');
    for (let i = 2; i <= 5; i++) await send(userCookie, 'admin', `m${i}`);

    const first = await openConversation(userCookie, body.data.conversationId + '?cursor=');
    expect(first.body.data.messages).toHaveLength(5);

    // 앞의 두 개만 남기고 그보다 오래된 것 요청
    const all = first.body.data.messages as Array<{ id: number; content: string }>;
    const res = await openConversation(
      userCookie,
      body.data.conversationId,
      `?cursor=${all[1].id}`
    );
    expect(res.body.data.messages.map((m: { content: string }) => m.content)).toEqual(['m1']);
  });

  it('남의 대화는 열리지 않는다', async () => {
    const { body } = await send(userCookie, 'admin', '둘만의 대화');

    const res = await openConversation(thirdCookie, body.data.conversationId);
    // 있는지 없는지도 알려 주지 않는다
    expect(res.status).toBe(404);
  });

  it('없는 대화는 404', async () => {
    expect((await openConversation(userCookie, 'nosuchconv1')).status).toBe(404);
  });
});

describe('안 읽은 수', () => {
  it('받은 메시지 수를 센다', async () => {
    await send(userCookie, 'admin', 'a');
    await send(userCookie, 'admin', 'b');

    const res = await request(app).get('/api/messages/unread-count').set('Cookie', adminCookie);
    expect(res.body.data.count).toBe(2);
  });

  it('내가 보낸 것은 내 안 읽은 수에 넣지 않는다', async () => {
    await send(userCookie, 'admin', 'a');

    const res = await request(app).get('/api/messages/unread-count').set('Cookie', userCookie);
    expect(res.body.data.count).toBe(0);
  });
});

describe('대화 숨기기', () => {
  it('내 목록에서만 사라지고 상대 쪽은 남는다', async () => {
    const { body } = await send(userCookie, 'admin', '지울 대화');

    const del = await request(app)
      .delete(`/api/messages/conversations/${body.data.conversationId}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);
    expect(del.status).toBe(200);

    expect((await conversations(userCookie)).body.data).toHaveLength(0);
    expect((await conversations(adminCookie)).body.data).toHaveLength(1);
  });

  it('숨긴 대화도 새 메시지가 오면 다시 나타난다', async () => {
    const { body } = await send(userCookie, 'admin', '처음');
    await request(app)
      .delete(`/api/messages/conversations/${body.data.conversationId}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);
    expect((await conversations(userCookie)).body.data).toHaveLength(0);

    await send(adminCookie, 'testuser', '다시 왔습니다');
    expect((await conversations(userCookie)).body.data).toHaveLength(1);
  });

  it('숨겨도 지난 내용은 그대로 남는다', async () => {
    const { body } = await send(userCookie, 'admin', '남아 있어야 함');
    await request(app)
      .delete(`/api/messages/conversations/${body.data.conversationId}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);

    // 숨김은 목록에서 빼는 것이지 삭제가 아니다
    const res = await openConversation(userCookie, body.data.conversationId);
    expect(res.status).toBe(200);
    expect(res.body.data.messages[0].content).toBe('남아 있어야 함');
  });

  it('남의 대화는 숨길 수 없다', async () => {
    const { body } = await send(userCookie, 'admin', '남의 것');

    const res = await request(app)
      .delete(`/api/messages/conversations/${body.data.conversationId}`)
      .set(CSRF_HEADER)
      .set('Cookie', thirdCookie);
    expect(res.status).toBe(404);
  });
});

describe('기능 스위치', () => {
  it('메시지를 끄면 목록도 대화도 열리지 않는다', async () => {
    const { body } = await send(userCookie, 'admin', '끄기 전');

    await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ 'social.dm': false });

    expect((await conversations(userCookie)).status).toBe(403);
    expect((await openConversation(userCookie, body.data.conversationId)).status).toBe(403);
    expect((await send(userCookie, 'admin', '보내기 시도')).status).toBe(403);
  });

  it('다시 켜면 대화가 그대로 돌아온다', async () => {
    const { body } = await send(userCookie, 'admin', '보존 확인');

    await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ 'social.dm': false });
    await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ 'social.dm': true });

    const res = await openConversation(userCookie, body.data.conversationId);
    expect(res.status).toBe(200);
    expect(res.body.data.messages[0].content).toBe('보존 확인');
  });
});

describe('인증', () => {
  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/messages/conversations')).status).toBe(401);
  });
});
