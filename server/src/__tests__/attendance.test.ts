import request from 'supertest';
import { app, seedTestData, loginAs, relaxRateLimits, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import { AttendanceRecord } from '../models/AttendanceRecord';

// 출퇴근 기록.
//
// 지켜야 하는 것: 하루 한 건, 필수 확인 항목을 건너뛴 출근은 없음,
// 그리고 출근할 때 찍은 확인 내용이 나중에 항목을 고쳐도 그대로 남는 것.

let adminCookie: string;
const cookies: Record<string, string> = {};

const PASSWORD = 'TestUser123!';
const WORKERS = ['attworker1', 'attworker2', 'attworker3', 'attworker4', 'attnight'];

async function setPolicy(patch: Record<string, unknown>) {
  const res = await request(app)
    .put('/api/admin/attendance/policy')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send(patch);
  expect(res.status).toBe(200);
  return res.body.data;
}

async function addItem(label: string, required = true) {
  const res = await request(app)
    .post('/api/admin/attendance/checklist')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ label, required });
  expect(res.status).toBe(201);
  return res.body.data as { id: number; label: string };
}

const checkIn = (cookie: string, body: unknown) =>
  request(app).post('/api/attendance/check-in').set(CSRF_HEADER).set('Cookie', cookie).send(body);

const checkOut = (cookie: string) =>
  request(app).post('/api/attendance/check-out').set(CSRF_HEADER).set('Cookie', cookie).send({});

let requiredItem: { id: number; label: string };
let optionalItem: { id: number; label: string };

beforeAll(async () => {
  await seedTestData();
  await relaxRateLimits();
  adminCookie = await loginAs('admin', 'TestAdmin123!');

  for (const id of WORKERS) {
    if (!(await User.findByPk(id))) {
      await User.create({
        id,
        password: PASSWORD,
        name: `직원${id.slice(-1)}`,
        email: `${id}@test.com`,
        roleId: 'user',
        isActive: true,
      });
    }
    cookies[id] = await loginAs(id, PASSWORD);
  }

  await setPolicy({ requireChecklist: true, standardWorkMinutes: 480 });
  requiredItem = await addItem('보안 수칙을 확인했습니다.', true);
  optionalItem = await addItem('건강 상태에 이상이 없습니다.', false);
});

describe('접근 권한', () => {
  it('비로그인은 오늘 상태를 볼 수 없다', async () => {
    expect((await request(app).get('/api/attendance/me')).status).toBe(401);
  });

  it('일반 사용자는 남의 기록을 볼 수 없다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/records')
      .set('Cookie', cookies.attworker1);
    expect(res.status).toBe(403);
  });

  it('일반 사용자는 확인 항목을 고칠 수 없다', async () => {
    const res = await request(app)
      .post('/api/admin/attendance/checklist')
      .set(CSRF_HEADER)
      .set('Cookie', cookies.attworker1)
      .send({ label: '마음대로 추가' });
    expect(res.status).toBe(403);
  });
});

describe('오늘 상태', () => {
  it('출근 전에는 기록이 비어 있고 확인 항목이 함께 온다', async () => {
    const res = await request(app).get('/api/attendance/me').set('Cookie', cookies.attworker1);
    expect(res.status).toBe(200);
    expect(res.body.data.record).toBeNull();
    expect(res.body.data.checklist.map((i: { id: number }) => i.id)).toEqual(
      expect.arrayContaining([requiredItem.id, optionalItem.id])
    );
    expect(res.body.data.policy.standardWorkMinutes).toBe(480);
  });
});

describe('출근', () => {
  it('필수 항목을 체크하지 않으면 기록되지 않는다', async () => {
    const res = await checkIn(cookies.attworker1, {
      responses: [{ itemId: optionalItem.id, checked: true }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(requiredItem.label);
  });

  it('아무것도 보내지 않아도 필수 항목 때문에 막힌다', async () => {
    expect((await checkIn(cookies.attworker1, {})).status).toBe(400);
  });

  it('필수 항목을 체크하면 기록되고, 확인 내용이 함께 저장된다', async () => {
    const res = await checkIn(cookies.attworker1, {
      responses: [
        { itemId: requiredItem.id, checked: true },
        { itemId: optionalItem.id, checked: false },
      ],
      note: '정상 출근',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.checkOutAt).toBeNull();
    expect(res.body.data.note).toBe('정상 출근');
    expect(res.body.data.checklist).toEqual(
      expect.arrayContaining([
        { itemId: requiredItem.id, label: requiredItem.label, required: true, checked: true },
        { itemId: optionalItem.id, label: optionalItem.label, required: false, checked: false },
      ])
    );
  });

  it('같은 날 두 번은 기록되지 않는다', async () => {
    const res = await checkIn(cookies.attworker1, {
      responses: [{ itemId: requiredItem.id, checked: true }],
    });
    expect(res.status).toBe(409);
  });

  it('동시에 두 번 눌러도 한 건만 남는다', async () => {
    const body = { responses: [{ itemId: requiredItem.id, checked: true }] };
    const results = await Promise.all([
      checkIn(cookies.attworker2, body),
      checkIn(cookies.attworker2, body),
    ]);
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(1);
  });

  it('세 번째 직원도 따로 기록된다', async () => {
    const res = await checkIn(cookies.attworker3, {
      responses: [{ itemId: requiredItem.id, checked: true }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe('attworker3');
  });
});

describe('퇴근', () => {
  it('출근하지 않았으면 퇴근할 수 없다', async () => {
    const res = await checkOut(cookies.attworker4);
    expect(res.status).toBe(400);
  });

  it('퇴근하면 재실 시간이 계산된다', async () => {
    const res = await checkOut(cookies.attworker1);
    expect(res.status).toBe(200);
    expect(res.body.data.checkOutAt).not.toBeNull();
    expect(res.body.data.workMinutes).toBeGreaterThanOrEqual(0);
  });

  it('두 번 찍히지 않는다', async () => {
    expect((await checkOut(cookies.attworker1)).status).toBe(409);
  });
});

describe('확인 항목을 고쳐도', () => {
  it('이미 찍힌 기록의 문구는 그대로다', async () => {
    const renamed = await request(app)
      .put(`/api/admin/attendance/checklist/${requiredItem.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ label: '문구를 통째로 바꿨습니다.' });
    expect(renamed.status).toBe(200);

    const mine = await request(app).get('/api/attendance/me').set('Cookie', cookies.attworker1);
    const labels = mine.body.data.record.checklist.map((c: { label: string }) => c.label);
    expect(labels).toContain(requiredItem.label);
    expect(labels).not.toContain('문구를 통째로 바꿨습니다.');

    await request(app)
      .put(`/api/admin/attendance/checklist/${requiredItem.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ label: requiredItem.label });
  });
});

describe('내 기록', () => {
  it('이번 달 기록과 요약을 준다', async () => {
    const res = await request(app)
      .get('/api/attendance/me/history')
      .set('Cookie', cookies.attworker1);
    expect(res.status).toBe(200);
    expect(res.body.data.records.length).toBeGreaterThan(0);
    expect(res.body.data.summary.days).toBe(res.body.data.records.length);
  });

  it('기록이 없는 달은 빈 목록이다', async () => {
    const res = await request(app)
      .get('/api/attendance/me/history?month=1999-01')
      .set('Cookie', cookies.attworker1);
    expect(res.body.data.records).toEqual([]);
    expect(res.body.data.summary.days).toBe(0);
  });
});

describe('관리자 조회', () => {
  it('기록에 누가 찍었는지가 함께 온다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/records')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const mine = res.body.data.records.find(
      (r: { userId: string }) => r.userId === 'attworker1'
    );
    expect(mine.userName).toBe('직원1');
  });

  it('사용자로 걸러진다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/records?userId=attworker3')
      .set('Cookie', adminCookie);
    expect(res.body.data.records.every((r: { userId: string }) => r.userId === 'attworker3')).toBe(
      true
    );
  });

  it('지난 날짜만 조회하면 오늘 기록은 빠진다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/records?from=1999-01-01&to=1999-01-31')
      .set('Cookie', adminCookie);
    expect(res.body.data.total).toBe(0);
  });

  it('인원별 집계에는 한 번도 안 찍은 사람도 들어간다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/summary')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ userId: string; days: number; openDays: number }>;
    expect(rows.find(r => r.userId === 'attworker4')?.days).toBe(0);
    expect(rows.find(r => r.userId === 'attworker3')?.days).toBe(1);
  });
});

describe('자정을 넘긴 퇴근', () => {
  // 밤 늦게 일하면 출근과 퇴근이 서로 다른 날이 된다. 어제 찍은 것을 못 닫으면
  // 자정을 넘긴 순간 퇴근 버튼이 막히고, 그날 근무 시간이 영영 안 잡힌다.
  const yesterday = () => {
    const d = new Date(Date.now() - 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('오늘 상태에 어제 안 닫힌 기록이 함께 온다', async () => {
    await AttendanceRecord.create({
      UserId: 'attnight',
      workDate: yesterday(),
      checkInAt: new Date(Date.now() - 3 * 3600_000),
      checklist: '[]',
    });

    const res = await request(app).get('/api/attendance/me').set('Cookie', cookies.attnight);
    expect(res.status).toBe(200);
    expect(res.body.data.record).toBeNull();
    expect(res.body.data.openPrevious?.workDate).toBe(yesterday());
  });

  it('어제 찍은 출근을 오늘 퇴근으로 닫는다', async () => {
    const res = await checkOut(cookies.attnight);
    expect(res.status).toBe(200);
    expect(res.body.data.workDate).toBe(yesterday());
    expect(res.body.data.workMinutes).toBeGreaterThan(100);
  });

  it('다 닫히고 나면 다시 퇴근할 수 없다', async () => {
    expect((await checkOut(cookies.attnight)).status).toBe(400);
  });
});

describe('설정 변경 기록', () => {
  it('확인 항목을 고치면 누가 무엇을 바꿨는지 감사 로그에 남는다', async () => {
    // 이 기능은 "무엇을 확인하고 출근했는가" 를 근거로 남긴다.
    // 그 항목을 몰래 바꿀 수 있으면 지난 기록의 뜻이 흐려진다.
    const created = await addItem('감사 로그 확인용 항목', false);

    const logs = await request(app)
      .get('/api/admin/audit-logs?action=update_attendance_settings')
      .set('Cookie', adminCookie);
    expect(logs.status).toBe(200);
    const rows = (logs.body.data.logs ?? logs.body.data) as Array<{
      adminId: string;
      targetType: string;
      targetName: string;
    }>;
    const hit = rows.find(r => r.targetName?.includes(created.label));
    expect(hit).toBeDefined();
    expect(hit?.adminId).toBe('admin');
    expect(hit?.targetType).toBe('attendance');

    await request(app)
      .delete(`/api/admin/attendance/checklist/${created.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
  });
});

describe('조회 기간', () => {
  it('1년을 넘는 집계 요청은 거절한다 — 표 전체를 읽게 된다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/summary?from=2000-01-01&to=2026-12-31')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('기간을 안 주면 이번 달로 본다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/summary')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('시작일이 종료일보다 뒤면 거절한다', async () => {
    const res = await request(app)
      .get('/api/admin/attendance/summary?from=2026-05-01&to=2026-04-01')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });
});

describe('오늘 현황', () => {
  it('근무 중·퇴근·미출근을 구분해서 명단 전체를 준다', async () => {
    const res = await request(app).get('/api/admin/attendance/today').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as Array<{
      userId: string;
      state: string;
      minutes: number | null;
    }>;
    const byId = new Map(rows.map(r => [r.userId, r]));
    expect(byId.get('attworker1')?.state).toBe('done');
    expect(byId.get('attworker2')?.state).toBe('working');
    expect(byId.get('attworker4')?.state).toBe('absent');
    // 근무 중인 사람도 지금까지 흐른 시간이 보여야 한다
    expect(byId.get('attworker2')?.minutes).toBeGreaterThanOrEqual(0);
    expect(byId.get('attworker4')?.minutes).toBeNull();
  });
});

describe('확인 항목 순서', () => {
  it('보낸 순서대로 다시 매긴다', async () => {
    const before = await request(app)
      .get('/api/admin/attendance/settings')
      .set('Cookie', adminCookie);
    const ids = (before.body.data.checklist as Array<{ id: number }>).map(i => i.id);

    const res = await request(app)
      .put('/api/admin/attendance/checklist/reorder')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ ids: [...ids].reverse() });
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: number }>).map(i => i.id)).toEqual([...ids].reverse());

    // 원래대로 돌려놓는다
    await request(app)
      .put('/api/admin/attendance/checklist/reorder')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ ids });
  });

  it('빠진 항목이 있으면 거절한다 — 조용히 순서가 뒤엉키면 안 된다', async () => {
    const res = await request(app)
      .put('/api/admin/attendance/checklist/reorder')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ ids: [requiredItem.id] });
    expect(res.status).toBe(400);
  });
});

describe('기준 설정', () => {
  it('기준 근무 시간이 범위를 벗어나면 거절한다', async () => {
    const res = await request(app)
      .put('/api/admin/attendance/policy')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ standardWorkMinutes: 5000 });
    expect(res.status).toBe(400);
  });

  it('필수 확인을 끄면 체크 없이도 출근된다', async () => {
    await setPolicy({ requireChecklist: false });
    const res = await checkIn(cookies.attworker4, {});
    expect(res.status).toBe(201);
    // 체크하지 않은 사실은 기록에 남는다
    expect(res.body.data.checklist.every((c: { checked: boolean }) => !c.checked)).toBe(true);
    await setPolicy({ requireChecklist: true });
  });
});
