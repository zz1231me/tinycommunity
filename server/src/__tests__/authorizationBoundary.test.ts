import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';

// 권한 경계 — "남의 것이 읽히는가".
//
// 기능별 테스트도 각자 403 을 확인하지만, 새 기능이 빠져도 드러나지 않는다.
// 여기서는 접근하면 안 되는 자료를 한 자리에 모아 두고 읽기를 시도한다.
//
// 등장인물:
//   owner   자료의 주인
//   other   같은 사이트의 다른 일반 사용자 (권한 없음)
//   admin   관리자 (일부는 볼 수 있고, 일부는 관리자여도 안 된다)

let ownerCookie: string;
let otherCookie: string;
let adminCookie: string;

/** other 가 읽을 수 없는 게시판 */
const CLOSED = 'closedboard';

async function ensureUser(id: string, name: string, password: string) {
  const found = await User.findByPk(id);
  if (!found) {
    await User.create({
      id,
      password,
      name,
      email: `${id}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
}

beforeAll(async () => {
  await seedTestData();

  await ensureUser('owneruser', '주인', 'TestOwner123!');
  await ensureUser('otheruser', '남', 'TestOther123!');

  // 관리자만 읽을 수 있는 게시판
  await Board.findOrCreate({
    where: { id: CLOSED },
    defaults: {
      id: CLOSED,
      name: '닫힌 게시판',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 90,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: CLOSED, roleId: 'admin' },
    defaults: { boardId: CLOSED, roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
  });

  ownerCookie = await loginAs('owneruser', 'TestOwner123!');
  otherCookie = await loginAs('otheruser', 'TestOther123!');
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

/** 자료를 하나 만들어 주인만 아는 상태로 둔다 */
async function createPost(cookie: string, board: string, body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title: `경계 ${Date.now()}${Math.random()}`, content: '<p>비밀 내용</p>', ...body });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

describe('못 보는 게시판의 글', () => {
  let hidden: string;

  beforeAll(async () => {
    hidden = await createPost(adminCookie, CLOSED);
  });

  const paths = (id: string) => [
    `/api/posts/${CLOSED}/${id}`,
    `/api/posts/${CLOSED}/${id}/revisions`,
    `/api/posts/${CLOSED}/${id}/activity`,
    `/api/posts/${CLOSED}/${id}/readers`,
    `/api/posts/${CLOSED}/${id}/attachment-versions`,
    `/api/posts/${CLOSED}/${id}/tags`,
    `/api/posts/${CLOSED}/${id}/related`,
    `/api/comments/${CLOSED}/${id}`,
  ];

  it('본문도 이력도 기록도 열리지 않는다', async () => {
    for (const path of paths(hidden)) {
      const res = await request(app).get(path).set('Cookie', otherCookie);
      expect([401, 403, 404]).toContain(res.status);
    }
  });

  it('목록에도 제목이 새지 않는다', async () => {
    const res = await request(app).get(`/api/posts/${CLOSED}`).set('Cookie', otherCookie);
    expect([401, 403, 404]).toContain(res.status);
  });

  it('전체 검색 결과에도 섞이지 않는다', async () => {
    const res = await request(app).get('/api/posts/search?q=경계').set('Cookie', otherCookie);
    const ids = JSON.stringify(res.body.data ?? {});
    expect(ids).not.toContain(hidden);
  });

  it('인기글에도 오르지 않는다', async () => {
    const res = await request(app).get('/api/posts/popular?limit=30').set('Cookie', otherCookie);
    expect(JSON.stringify(res.body.data)).not.toContain(hidden);
  });

  it('다른 게시판 이름을 붙여도 읽히지 않는다 — 경로만 바꾸는 우회', async () => {
    const res = await request(app).get(`/api/posts/notice/${hidden}`).set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});

// 화면은 첨부 때문에 글 작성·수정을 multipart 로 보낸다. multipart 필드는 전부
// 문자열이라, 허용 사용자 목록도 JSON 문자열로 도착한다. 그걸 배열만 받도록 두면
// '지정한 사람만' 비밀글이 아예 만들어지지 않는다 — 읽을 사람을 제한하는 기능이
// 조용히 죽는 셈이라, 형식별로 고정해 둔다.
describe('허용 사용자 목록 전달 형식', () => {
  it('multipart 로 보낸 JSON 문자열을 받는다 (화면이 실제로 쓰는 형식)', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .field('title', `멀티파트 비밀 ${Date.now()}`)
      .field('content', '<p>x</p>')
      .field('isSecret', 'true')
      .field('secretType', 'users')
      .field('secretUserIds', JSON.stringify(['otheruser']));

    expect(res.status).toBe(201);

    // 지정된 사람은 읽을 수 있어야 한다
    const opened = await request(app)
      .get(`/api/posts/notice/${res.body.data.id}`)
      .set('Cookie', otherCookie);
    expect(opened.status).toBe(200);
  });

  it('JSON 본문의 배열도 그대로 받는다', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({
        title: `본문 비밀 ${Date.now()}`,
        content: '<p>x</p>',
        isSecret: true,
        secretType: 'users',
        secretUserIds: ['otheruser'],
      });
    expect(res.status).toBe(201);
  });

  it('빈 목록은 여전히 거절한다 — 아무도 못 보는 비밀글은 실수다', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .field('title', `빈 목록 ${Date.now()}`)
      .field('content', '<p>x</p>')
      .field('isSecret', 'true')
      .field('secretType', 'users')
      .field('secretUserIds', JSON.stringify([]));
    expect(res.status).toBe(400);
  });

  it('깨진 문자열은 목록이 없는 것으로 본다', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .field('title', `깨진 목록 ${Date.now()}`)
      .field('content', '<p>x</p>')
      .field('isSecret', 'true')
      .field('secretType', 'users')
      .field('secretUserIds', '{망가짐');
    expect(res.status).toBe(400);
  });
});

describe('남의 비밀글', () => {
  it('지정되지 않은 사람은 열 수 없다', async () => {
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser'],
    });
    const res = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });

  it('수정하면서 비밀글 유형을 빼도 잠금이 풀리지 않는다', async () => {
    // 수정 API 는 secretType 이 없으면 "기존 유형 유지" 로 해석해 검증을 건너뛴다.
    // 그런데 저장할 때는 null 로 덮어썼다 — isSecret=true 인데 유형이 없는 글이 되고,
    // 조회 경로의 password/users 분기가 둘 다 빗나가 본문이 그대로 나갔다.
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser'],
    });

    await request(app)
      .put(`/api/posts/notice/${secret}`)
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ title: '유형을 뺀 수정', content: '<p>비밀 내용</p>', isSecret: true });

    const res = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', otherCookie);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('비밀 내용');
  });

  it('유형 없이 비밀글로 바꾸려는 수정은 거부된다', async () => {
    const open = await createPost(ownerCookie, 'notice');
    const res = await request(app)
      .put(`/api/posts/notice/${open}`)
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ title: '유형 없는 비밀글', content: '<p>내용</p>', isSecret: true });
    expect(res.status).toBe(400);
  });

  it('유형을 생략한 수정으로 허용 목록을 비울 수 없다', async () => {
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser'],
    });
    const res = await request(app)
      .put(`/api/posts/notice/${secret}`)
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ title: '목록 비우기', content: '<p>내용</p>', isSecret: true, secretUserIds: [] });
    expect(res.status).toBe(400);
  });

  it('관리자가 남의 비밀글을 수정해도 유형과 허용 목록이 바뀌지 않는다', async () => {
    // 편집 화면은 상세 응답의 secretType 을 보고 어떤 잠금 방식인지 그린다.
    // 그 값이 가려져 오면 화면은 '비밀번호 방식' 으로 오해하고, 저장할 때 지정 방식 글을
    // 비밀번호 글로 바꿔 버린다 — 원래 허용된 사람들이 영영 못 읽게 된다.
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser'],
    });

    const seen = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', adminCookie);
    expect(seen.status).toBe(200);
    expect(seen.body.data.secretType).toBe('users');

    // 편집 화면이 비밀글 설정을 건드리지 않고 본문만 고친 경우
    const res = await request(app)
      .put(`/api/posts/notice/${secret}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '관리자 수정', content: '<p>고친 내용</p>' });
    expect(res.status).toBe(200);

    const after = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', adminCookie);
    expect(after.body.data.isSecret).toBe(true);
    expect(after.body.data.secretType).toBe('users');
    expect(after.body.data.isEncrypted).toBe(false);

    // 원래 허용된 사람은 그대로 읽을 수 있어야 한다
    const owner = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', ownerCookie);
    expect(owner.status).toBe(200);
  });

  it('허용 목록은 그 글을 고칠 수 있는 사람에게만 보인다', async () => {
    // 편집 화면이 지금 누가 볼 수 있는지 알아야, 한 명을 추가할 때 나머지가 조용히 빠지지 않는다.
    // 다만 "누가 이 비공개 글을 읽을 수 있는가" 자체가 민감하므로 그 목록을 바꿀 수 있는
    // 사람에게만 준다.
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser', 'otheruser'],
    });

    const owner = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', ownerCookie);
    expect(owner.body.data.secretAllowedUsers?.map((u: { id: string }) => u.id).sort()).toEqual([
      'otheruser',
      'owneruser',
    ]);

    const admin = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', adminCookie);
    expect(admin.body.data.secretAllowedUsers).toBeDefined();

    // 허용 목록에 든 것만으로는 목록 자체를 볼 수 없다 — 읽기와 관리는 다르다
    const reader = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', otherCookie);
    expect(reader.status).toBe(200);
    expect(reader.body.data.secretAllowedUsers).toBeUndefined();
  });

  it('비밀글이 아니면 허용 목록 자체가 없다', async () => {
    const open = await createPost(ownerCookie, 'notice');
    const res = await request(app).get(`/api/posts/notice/${open}`).set('Cookie', ownerCookie);
    expect(res.body.data.secretAllowedUsers).toBeUndefined();
  });

  it('목록에서 제목은 보이지만 작성자와 첨부는 가려진다', async () => {
    // 보호 대상은 내용이다. 제목까지 덮으면 자기가 쓴 글조차 목록에서 찾지 못하고,
    // 잠금 화면도 "무슨 글인지" 를 말해 줄 수 없다.
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser'],
    });
    const res = await request(app).get('/api/posts/notice').set('Cookie', otherCookie);
    const row = res.body.data.posts.find((p: { id: string }) => p.id === secret);
    expect(row?.title).not.toBe('🔒 비밀글입니다.');
    expect(row?.isSecret).toBe(true);
    expect(row?.author).toBeNull();
    expect(row?.attachmentCount).toBe(0);
  });

  it('제목이 보여도 내용은 여전히 잠겨 있다', async () => {
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['owneruser'],
    });
    const res = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });

  it('비밀번호 글은 잠금 상태만 알려 주고 본문을 주지 않는다', async () => {
    const secret = await createPost(ownerCookie, 'notice', {
      isSecret: true,
      secretType: 'password',
      secretPassword: 'pw12345',
    });
    const res = await request(app).get(`/api/posts/notice/${secret}`).set('Cookie', otherCookie);
    expect(res.body.data.isLocked).toBe(true);
    expect(res.body.data.content).toBeUndefined();
    // 잠긴 글은 작성자·작성 시각도 주지 않는다
    expect(res.body.data.author).toBeUndefined();
  });
});

describe('남의 개인 자료', () => {
  it('개인공간 게시판은 주인만 읽는다', async () => {
    const boards = await request(app).get('/api/boards/accessible').set('Cookie', ownerCookie);
    const personal = boards.body.data.find((b: { isPersonal: boolean }) => b.isPersonal);
    expect(personal).toBeDefined();

    const res = await request(app).get(`/api/posts/${personal.id}`).set('Cookie', otherCookie);
    expect([403, 404]).toContain(res.status);
  });

  it('임시저장은 남에게 보이지 않는다', async () => {
    const draft = await request(app)
      .post('/api/drafts')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ boardType: 'notice', title: '남의 초안', content: '<p>초안</p>' });
    expect(draft.status).toBe(201);

    const list = await request(app).get('/api/drafts').set('Cookie', otherCookie);
    expect(JSON.stringify(list.body.data ?? [])).not.toContain('남의 초안');
  });

  it('스크랩 목록은 각자의 것만 나온다', async () => {
    const post = await createPost(ownerCookie, 'notice');
    await request(app)
      .post(`/api/posts/notice/${post}/scrap`)
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie);

    const mine = await request(app).get('/api/posts/scraps/mine').set('Cookie', otherCookie);
    expect(JSON.stringify(mine.body.data ?? {})).not.toContain(post);
  });

  it('메모는 남에게 보이지 않는다', async () => {
    await request(app)
      .post('/api/memos')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ content: '남의 메모 내용' });

    const list = await request(app).get('/api/memos').set('Cookie', otherCookie);
    expect(JSON.stringify(list.body.data ?? [])).not.toContain('남의 메모 내용');
  });

  it('알림은 각자의 것만 나온다', async () => {
    const mine = await request(app).get('/api/notifications').set('Cookie', otherCookie);
    const rows = mine.body.data?.notifications ?? mine.body.data ?? [];
    for (const n of rows) {
      expect(n.userId === undefined || n.userId === 'otheruser').toBe(true);
    }
  });
});

describe('읽음 확인은 확인용이지 감시용이 아니다', () => {
  it('작성자·게시판 담당자가 아니면 볼 수 없다', async () => {
    const post = await createPost(ownerCookie, 'notice');
    const res = await request(app)
      .get(`/api/posts/notice/${post}/readers`)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });
});

describe('로그인하지 않은 사람', () => {
  const paths = [
    '/api/posts/notice',
    '/api/posts/tasks/mine',
    '/api/drafts',
    '/api/memos',
    '/api/notifications',
    '/api/messages/conversations',
    '/api/boards/accessible',
    '/api/users/search?q=a',
    '/api/admin/users',
    '/api/admin/stats',
  ];

  it.each(paths)('%s 는 401 또는 403', async path => {
    const res = await request(app).get(path);
    expect([401, 403]).toContain(res.status);
  });
});

describe('일반 사용자와 관리자 화면', () => {
  const adminPaths = [
    '/api/admin/users',
    '/api/admin/stats',
    '/api/admin/security-logs',
    '/api/admin/error-logs',
    '/api/admin/audit-logs',
    '/api/admin/boards',
    '/api/admin/roles',
    '/api/admin/ip-rules',
  ];

  it.each(adminPaths)('%s 는 일반 사용자에게 열리지 않는다', async path => {
    const res = await request(app).get(path).set('Cookie', otherCookie);
    expect([401, 403]).toContain(res.status);
  });

  it('사이트 설정 변경도 막힌다', async () => {
    const res = await request(app)
      .put('/api/site-settings')
      .set(CSRF_HEADER)
      .set('Cookie', otherCookie)
      .send({ siteName: '바꿔치기' });
    expect([401, 403]).toContain(res.status);
  });

  it('기능 스위치도 일반 사용자가 바꿀 수 없다', async () => {
    const res = await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', otherCookie)
      .send({ key: 'post.like', enabled: false });
    expect([401, 403]).toContain(res.status);
  });
});

describe('응답에 섞여 나가면 안 되는 것', () => {
  it('내 정보에 비밀번호·2FA 비밀·토큰이 없다', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', ownerCookie);
    const body = JSON.stringify(res.body);
    for (const key of ['password', 'twoFactorSecret', 'passwordResetToken', 'tokenVersion']) {
      expect(body).not.toContain(`"${key}"`);
    }
  });

  it('사용자 검색은 아이디와 이름만 준다 — 이메일·최근 접속 IP 가 새지 않게', async () => {
    const res = await request(app).get('/api/users/search?q=other').set('Cookie', ownerCookie);
    for (const user of res.body.data) {
      expect(Object.keys(user).sort()).toEqual(['id', 'name']);
    }
  });

  it('남의 프로필에 이메일이 붙어 나오지 않는다', async () => {
    const res = await request(app).get('/api/users/owneruser/profile').set('Cookie', otherCookie);
    expect(JSON.stringify(res.body)).not.toContain('owneruser@test.com');
  });

  it('비밀글이 아닌 글의 응답에는 secretSalt 가 null 이다', async () => {
    const post = await createPost(ownerCookie, 'notice');
    const res = await request(app).get(`/api/posts/notice/${post}`).set('Cookie', ownerCookie);
    expect(res.body.data.secretSalt).toBeNull();
  });
});

describe('첨부 파일', () => {
  /** 파일을 붙인 글을 만들고 저장 파일명을 돌려준다.
   *  생성 응답은 최소 정보만 주므로(민감 필드 제외) 상세를 다시 읽어 파일명을 얻는다. */
  async function postWithFile(cookie: string, board: string): Promise<string> {
    const created = await request(app)
      .post(`/api/posts/${board}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .field('title', `첨부경계 ${Date.now()}${Math.random()}`)
      .field('content', '<p>x</p>')
      .field('originalFilenames', JSON.stringify(['비밀자료.txt']))
      .attach('files', Buffer.from('대외비'), '비밀자료.txt');
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/posts/${board}/${created.body.data.id}`)
      .set('Cookie', cookie);
    return detail.body.data.attachments[0].storedName as string;
  }

  it('못 보는 게시판의 첨부는 파일명을 알아도 못 받는다', async () => {
    // 파일명만 알면 받아지는 구조라면, 목록에 뜬 파일명 하나로 대외비가 새어 나간다
    const stored = await postWithFile(adminCookie, CLOSED);
    const res = await request(app)
      .get(`/api/uploads/download/${stored}`)
      .set('Cookie', otherCookie);
    expect([403, 404]).toContain(res.status);
  });

  it('썸네일 경로로도 우회되지 않는다', async () => {
    const stored = await postWithFile(adminCookie, CLOSED);
    const res = await request(app).get(`/api/uploads/thumb/${stored}`).set('Cookie', otherCookie);
    expect([403, 404]).toContain(res.status);
  });

  it('지정되지 않은 사람은 비밀글 첨부를 못 받는다', async () => {
    const created = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .field('title', `비밀첨부 ${Date.now()}`)
      .field('content', '<p>x</p>')
      .field('isSecret', 'true')
      .field('secretType', 'users')
      .field('secretUserIds', JSON.stringify(['owneruser']))
      .field('originalFilenames', JSON.stringify(['대외비.txt']))
      .attach('files', Buffer.from('대외비'), '대외비.txt');
    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/posts/notice/${created.body.data.id}`)
      .set('Cookie', ownerCookie);
    const stored = detail.body.data.attachments[0].storedName;

    const res = await request(app)
      .get(`/api/uploads/download/${stored}`)
      .set('Cookie', otherCookie);
    expect([403, 404]).toContain(res.status);
  });

  it('로그인하지 않으면 아무 파일도 못 받는다', async () => {
    const stored = await postWithFile(ownerCookie, 'notice');
    const res = await request(app).get(`/api/uploads/download/${stored}`);
    expect([401, 403]).toContain(res.status);
  });
});

describe('다이렉트 메시지', () => {
  it('대화에 끼지 않은 사람은 대화를 열 수 없다', async () => {
    const sent = await request(app)
      .post('/api/messages')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ recipientId: 'admin', content: '둘만의 이야기' });
    expect(sent.status).toBe(201);
    const conversationId = sent.body.data.conversationId;

    const res = await request(app)
      .get(`/api/messages/conversations/${conversationId}`)
      .set('Cookie', otherCookie);
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('둘만의 이야기');
  });

  it('남의 대화를 지울 수도 없다', async () => {
    const sent = await request(app)
      .post('/api/messages')
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send({ recipientId: 'admin', content: '지우기 시도' });
    const res = await request(app)
      .delete(`/api/messages/conversations/${sent.body.data.conversationId}`)
      .set(CSRF_HEADER)
      .set('Cookie', otherCookie);
    expect([403, 404]).toContain(res.status);
  });
});

describe('업무 상태·담당자', () => {
  it('상관없는 사람은 남의 글 상태를 바꿀 수 없다', async () => {
    await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
    try {
      const post = await createPost(ownerCookie, 'notice');
      const res = await request(app)
        .patch(`/api/posts/notice/${post}/task`)
        .set(CSRF_HEADER)
        .set('Cookie', otherCookie)
        .send({ workStatus: 'done' });
      expect(res.status).toBe(403);
    } finally {
      await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
    }
  });
});

describe('공개 사이트 설정은 보안 설정을 흘리지 않는다', () => {
  // 로그인 화면·회원가입 화면이 브랜딩과 비밀번호 정책을 읽어야 하므로 이 엔드포인트는 공개다.
  // 그래서 "몇 번 틀리면 잠기는지, 얼마나 기다리면 풀리는지, rate limit 상한이 얼마인지"까지
  // 같이 나가면 무차별 대입을 정확히 설계할 수 있게 된다 — 그 값들은 관리자만 받는다.
  const SECRETS = [
    'maxLoginAttempts',
    'accountLockMinutes',
    'bcryptRounds',
    'jwtAccessTokenHours',
    'jwtRefreshTokenDays',
    'passwordResetTokenHours',
    'securityLogRetentionDays',
    'errorLogRetentionDays',
    'deletedPostRetentionDays',
  ];

  it('로그인하지 않은 사람이 받는 설정에는 보안 값이 없다', async () => {
    const res = await request(app).get('/api/site-settings');
    expect(res.status).toBe(200);
    for (const key of SECRETS) {
      expect(res.body.data).not.toHaveProperty(key);
    }
  });

  it('그래도 화면이 쓰는 값은 그대로 나온다', async () => {
    const res = await request(app).get('/api/site-settings');
    expect(res.body.data).toHaveProperty('siteName');
    expect(res.body.data).toHaveProperty('minPasswordLength');
    expect(res.body.data).toHaveProperty('maxFileSizeMb');
    expect(res.body.data).toHaveProperty('allowRegistration');
  });

  it('일반 사용자는 관리자용 전체 설정을 볼 수 없다', async () => {
    const res = await request(app).get('/api/site-settings/admin').set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });

  it('관리자는 보안 값까지 받는다', async () => {
    const res = await request(app).get('/api/site-settings/admin').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    for (const key of SECRETS) {
      expect(res.body.data).toHaveProperty(key);
    }
  });
});
