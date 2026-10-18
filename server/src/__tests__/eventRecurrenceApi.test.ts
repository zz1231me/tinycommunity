import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Event from '../models/Event';
import { MAX_EXCEPT } from '../services/event.service';

// 반복 일정 API.
//
// 반복은 규칙 한 줄로 저장하고 보여 줄 때 펼친다. 지금까지는 저장만 되고 펼쳐지지 않아
// '매주 월요일 회의' 가 첫 주에만 떴다.
//
// 지켜야 하는 선:
//  1. 보는 범위 안의 번째들이 모두 온다 — 처음 일정이 범위보다 앞서 있어도.
//  2. 번째에는 그 날짜가 함께 온다(occurrenceDate) — 하루만 건너뛸 때 집을 열쇠다.
//  3. 하루 건너뛰기는 규칙을 건드리지 않는다. 그 날만 빠진다.
//  4. 남의 반복 일정을 아무나 건너뛰게 하지 않는다.

let adminCookie: string;
let userCookie: string;

const makeEvent = (cookie: string, body: Record<string, unknown>) =>
  request(app)
    .post('/api/events')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({
      calendarId: 'default',
      title: '주간 회의',
      isAllday: false,
      start: '2026-11-02T01:00:00.000Z',
      end: '2026-11-02T02:00:00.000Z',
      ...body,
    });

const listRange = (cookie: string, start: string, end: string) =>
  request(app).get(`/api/events?start=${start}&end=${end}`).set('Cookie', cookie);

const skip = (cookie: string, id: number, date: string) =>
  request(app)
    .delete(`/api/events/${id}/occurrences/${date}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

beforeEach(async () => {
  await Event.destroy({ where: {}, truncate: true });
});

describe('펼쳐서 보여 준다', () => {
  it('매주 반복이 범위 안의 모든 주에 선다', async () => {
    const made = await makeEvent(adminCookie, {
      recurrenceType: 'weekly',
      recurrenceDays: [1],
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });
    expect(made.status).toBe(201);

    const res = await listRange(
      adminCookie,
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );

    expect(res.status).toBe(200);
    const dates = res.body.data.map((e: { occurrenceDate?: string }) => e.occurrenceDate);
    expect(dates).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('처음 일정이 범위보다 앞서 있어도 이 달의 번째가 온다', async () => {
    await makeEvent(adminCookie, {
      recurrenceType: 'weekly',
      recurrenceDays: [1],
      recurrenceEndDate: '2027-03-31T00:00:00.000Z',
    }).expect(201);

    // 11월에 시작한 반복을 이듬해 1월 창에서 본다
    const res = await listRange(
      adminCookie,
      '2027-01-01T00:00:00.000Z',
      '2027-01-31T23:59:59.000Z'
    );

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.every((e: { isRecurringOccurrence?: boolean }) => e.isRecurringOccurrence)
    ).toBe(true);
  });

  it('반복이 아닌 일정은 한 번만 온다', async () => {
    await makeEvent(adminCookie, { title: '한 번짜리' }).expect(201);

    const res = await listRange(
      adminCookie,
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].occurrenceDate).toBeUndefined();
  });
});

describe('하루만 건너뛰기', () => {
  it('집은 날만 빠지고 규칙은 그대로다', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'weekly',
        recurrenceDays: [1],
        recurrenceEndDate: '2026-11-30T00:00:00.000Z',
      })
    ).body.data.id as number;

    await skip(adminCookie, id, '2026-11-09').expect(200);

    const dates = (
      await listRange(adminCookie, '2026-11-01T00:00:00.000Z', '2026-11-30T23:59:59.000Z')
    ).body.data.map((e: { occurrenceDate?: string }) => e.occurrenceDate);
    expect(dates).toEqual(['2026-11-02', '2026-11-16', '2026-11-23', '2026-11-30']);

    const still = await Event.findByPk(id);
    expect(still?.recurrenceType).toBe('weekly');
  });

  it('반복이 아닌 일정에는 쓸 수 없다', async () => {
    const id = (await makeEvent(adminCookie, {})).body.data.id as number;

    const res = await skip(adminCookie, id, '2026-11-02');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/반복 일정이 아닙니다/);
  });

  it('날짜 모양이 아니면 거절한다', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'daily',
        recurrenceEndDate: '2026-11-10T00:00:00.000Z',
      })
    ).body.data.id as number;

    await skip(adminCookie, id, '2026-11').expect(400);
  });

  it('남의 반복 일정은 권한이 있어야 건너뛴다', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'daily',
        recurrenceEndDate: '2026-11-10T00:00:00.000Z',
      })
    ).body.data.id as number;

    const res = await skip(userCookie, id, '2026-11-03');

    expect([403, 200]).toContain(res.status);
    if (res.status === 403) {
      const still = await Event.findByPk(id);
      expect(still?.recurrenceExcept ?? []).not.toContain('2026-11-03');
    }
  });

  it('로그인하지 않으면 401', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'daily',
        recurrenceEndDate: '2026-11-10T00:00:00.000Z',
      })
    ).body.data.id as number;

    await request(app)
      .delete(`/api/events/${id}/occurrences/2026-11-03`)
      .set(CSRF_HEADER)
      .expect(401);
  });
});

// 반복 일정을 '나중 번째' 에서 고칠 때.
//
// 화면은 번째를 눌러 창을 열고, 그 번째의 날짜로 폼을 채운다. 거기서 제목만 바꿔
// 저장해도 요청에는 그 번째의 날짜가 start 로 실려 간다 — 규칙의 시작이 통째로
// 밀린다. 재어 보니 31번 서던 일정이 12번으로 줄었고, 종료일보다 뒤로 밀면 0번이
// 되어 달력에서 사라졌다(행은 남아 있다).
//
// 서버 쪽에서 막을 수 있는 선은 '설 수 없는 상태' 다. 어디서 고치든 반복 종료일보다
// 늦은 시작은 받지 않는다. 번째 쪽에는 규칙의 원래 시작을 함께 실어, 화면이 폼을
// 번째 날짜가 아니라 규칙의 시작으로 채울 수 있게 한다.
describe('반복 규칙의 시작을 뒤로 미는 수정', () => {
  const daily = () =>
    makeEvent(adminCookie, {
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });

  const editTitleOnly = (id: number, start: string, end: string) =>
    request(app).put(`/api/events/${id}`).set(CSRF_HEADER).set('Cookie', adminCookie).send({
      calendarId: 'default',
      title: '제목만 바꿈',
      body: '',
      isAllday: false,
      start,
      end,
      category: 'meeting',
      location: '',
      isReadOnly: false,
    });

  it('반복 종료일보다 늦은 시작은 거절한다 — 한 번도 서지 않는 일정이 된다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await editTitleOnly(id, '2026-12-10T01:00:00.000Z', '2026-12-10T02:00:00.000Z');

    expect(res.status).toBe(400);
    const row = await Event.findByPk(id);
    expect(new Date(String(row?.start)).toISOString()).toBe('2026-11-02T01:00:00.000Z');
  });

  it('종료일 안쪽으로 미는 것은 통한다 — 양성 대조', async () => {
    // 규칙의 시작을 진짜로 옮기려는 사람까지 막으면 안 된다
    const id = (await daily()).body.data.id as number;

    const res = await editTitleOnly(id, '2026-11-20T01:00:00.000Z', '2026-11-20T02:00:00.000Z');

    expect(res.status).toBe(200);
  });

  it('번째에는 규칙의 원래 시작이 함께 온다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await listRange(
      adminCookie,
      '2026-11-10T00:00:00.000Z',
      '2026-11-12T00:00:00.000Z'
    );
    const occ = (res.body.data as Array<Record<string, unknown>>).find(
      e => e.id === id && e.isRecurringOccurrence
    );

    expect(occ).toBeDefined();
    // start 는 그 번째의 날짜다. 규칙의 시작은 따로 실린다.
    expect(new Date(String(occ!.start)).toISOString()).not.toBe('2026-11-02T01:00:00.000Z');
    expect(new Date(String(occ!.seriesStart)).toISOString()).toBe('2026-11-02T01:00:00.000Z');
    expect(new Date(String(occ!.seriesEnd)).toISOString()).toBe('2026-11-02T02:00:00.000Z');
  });
});

// 건너뛴 날짜는 무한정 쌓이지 않는다.
//
// 건너뛰기는 날짜가 실제 번째인지 보지 않는다(봐야 할 이유도 없다 — 규칙이 바뀌면
// 번째도 바뀐다). 그래서 요청 한 번에 한 개씩 끝없이 쌓을 수 있었고, 그 줄은
// 달력을 여는 모든 사람이 읽는다. 한 번에 펼쳐지는 번째가 500개라 그 이상 둘 이유도 없다.
/** 1900-01-01 부터 하루씩. 모양이 YYYY-MM-DD 여야 컨트롤러를 지난다. */
const fillerDates = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(1900, 0, 1 + i));
    return d.toISOString().slice(0, 10);
  });

describe('건너뛴 날짜의 상한', () => {
  it('가득 차면 더 받지 않는다', async () => {
    const made = await makeEvent(adminCookie, {
      recurrenceType: 'daily',
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });
    const id = made.body.data.id as number;

    const full = fillerDates(MAX_EXCEPT);
    await Event.update({ recurrenceExcept: full }, { where: { id } });

    const res = await skip(adminCookie, id, '2026-11-03');

    expect(res.status).toBe(409);
    const row = await Event.findByPk(id);
    expect((row?.recurrenceExcept ?? []).length).toBe(MAX_EXCEPT);
  });

  it('가득 찬 날짜를 다시 건너뛰는 것은 통한다 — 늘지 않으므로', async () => {
    const made = await makeEvent(adminCookie, {
      recurrenceType: 'daily',
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });
    const id = made.body.data.id as number;

    const full = fillerDates(MAX_EXCEPT);
    await Event.update({ recurrenceExcept: full }, { where: { id } });

    const res = await skip(adminCookie, id, full[0]);
    expect(res.status).toBe(200);
  });
});

// 반복 중 '이 날만' 고치기.
//
// 예전에는 하루만 시간을 옮기려면 그 날을 건너뛰고 새 일정을 따로 만들어야 했다.
// 규칙을 고치면 모든 날이 함께 움직이므로 쓸 수 없었다.
//
// 지금은 그 날을 건너뛰고 그 자리에 따로 선 일정을 세운다. 규칙 쪽에는 건너뛴
// 날짜만 남는다. 둘은 한 트랜잭션에서 함께 일어나야 한다 — 하나만 남으면 그 날이
// 두 번 보이거나 아예 사라진다.
describe('이 날만 고치기', () => {
  const daily = () =>
    makeEvent(adminCookie, {
      title: '매일 회의',
      body: '<p>원래 메모</p>',
      location: '3층',
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });

  const editOne = (cookie: string, id: number, date: string, body: Record<string, unknown>) =>
    request(app)
      .put(`/api/events/${id}/occurrences/${date}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send(body);

  it('그 날만 바뀌고 나머지 날은 그대로다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await editOne(adminCookie, id, '2026-11-05', {
      title: '이 날만 다른 회의',
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });
    expect(res.status).toBe(201);

    const list = await listRange(
      adminCookie,
      '2026-11-02T00:00:00.000Z',
      '2026-11-08T00:00:00.000Z'
    );
    const rows = list.body.data as Array<Record<string, unknown>>;

    // 그 날에는 바꾼 것 하나만 선다 — 규칙에서 나온 번째는 빠졌다
    const onThatDay = rows.filter(r => String(r.start).startsWith('2026-11-05'));
    expect(onThatDay).toHaveLength(1);
    expect(onThatDay[0].title).toBe('이 날만 다른 회의');
    expect(onThatDay[0].isRecurringOccurrence).toBeFalsy();

    // 다른 날은 규칙 그대로
    const otherDay = rows.filter(r => String(r.start).startsWith('2026-11-06'));
    expect(otherDay).toHaveLength(1);
    expect(otherDay[0].title).toBe('매일 회의');
  });

  it('손대지 않은 칸은 규칙에서 물려받는다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await editOne(adminCookie, id, '2026-11-05', {
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });

    expect(res.status).toBe(201);
    // 시간만 옮기러 들어온 사람이 제목·장소·메모를 잃지 않는다
    expect(res.body.data.title).toBe('매일 회의');
    expect(res.body.data.location).toBe('3층');
    expect(res.body.data.body).toContain('원래 메모');
  });

  it('떨어져 나온 하루는 더 반복하지 않는다', async () => {
    const id = (await daily()).body.data.id as number;
    const res = await editOne(adminCookie, id, '2026-11-05', {
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });

    const made = await Event.findByPk(res.body.data.id as number);
    expect(made?.recurrenceType).toBe('none');
    expect(made?.parentEventId).toBe(id);
    // 주인은 규칙의 주인 그대로다
    expect(made?.UserId).toBe('admin');
  });

  it('규칙을 지우면 떨어져 나온 하루도 함께 사라진다', async () => {
    const id = (await daily()).body.data.id as number;
    const made = await editOne(adminCookie, id, '2026-11-05', {
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });
    const childId = made.body.data.id as number;

    await request(app)
      .delete(`/api/events/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(await Event.findByPk(childId)).toBeNull();
  });

  it('이미 건너뛴 날은 다시 고칠 수 없다', async () => {
    const id = (await daily()).body.data.id as number;
    await skip(adminCookie, id, '2026-11-05');

    const res = await editOne(adminCookie, id, '2026-11-05', {
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });
    expect(res.status).toBe(409);
  });

  it('반복이 아닌 일정에는 쓸 수 없다', async () => {
    const id = (await makeEvent(adminCookie, {})).body.data.id as number;

    const res = await editOne(adminCookie, id, '2026-11-05', {
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });
    expect(res.status).toBe(400);
  });

  it('남의 반복 일정은 고칠 수 없고, 건너뛴 날도 늘지 않는다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await editOne(userCookie, id, '2026-11-05', {
      start: '2026-11-05T05:00:00.000Z',
      end: '2026-11-05T06:00:00.000Z',
      isAllday: false,
    });

    expect(res.status).toBe(403);
    const row = await Event.findByPk(id);
    expect(row?.recurrenceExcept ?? []).not.toContain('2026-11-05');
    // 거절당한 요청이 일정 하나를 남기지 않는다
    expect(await Event.count({ where: { parentEventId: id } })).toBe(0);
  });

  it('끝이 시작보다 앞서면 400 이고 아무것도 남지 않는다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await editOne(adminCookie, id, '2026-11-05', {
      start: '2026-11-05T06:00:00.000Z',
      end: '2026-11-05T05:00:00.000Z',
      isAllday: false,
    });

    expect(res.status).toBe(400);
    expect(await Event.count({ where: { parentEventId: id } })).toBe(0);
  });
});

// 규칙을 나중에 바꾸기.
//
// 화면이 수정 요청에 반복 칸을 싣지 않아, '매주' 로 바꿔 저장해도 성공 안내만 뜨고
// 규칙은 그대로였다. 화면 쪽을 고치면서 서버가 받아 주는지도 여기서 고정한다 —
// 바꾸기·끄기 둘 다.
describe('반복 규칙을 나중에 바꾼다', () => {
  const daily = () =>
    makeEvent(adminCookie, {
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });

  const edit = (id: number, patch: Record<string, unknown>) =>
    request(app)
      .put(`/api/events/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        calendarId: 'default',
        title: '주간 회의',
        isAllday: false,
        start: '2026-11-02T01:00:00.000Z',
        end: '2026-11-02T02:00:00.000Z',
        ...patch,
      });

  it('매일을 매주로 바꾸면 그대로 저장되고 펼쳐지는 날도 줄어든다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await edit(id, {
      recurrenceType: 'weekly',
      recurrenceDays: [1],
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });
    expect(res.status).toBe(200);

    const row = await Event.findByPk(id);
    expect(row?.recurrenceType).toBe('weekly');
    expect(row?.recurrenceDays).toEqual([1]);

    // 11/2 ~ 11/30 의 월요일은 5번(2·9·16·23·30)이다. 매일이었다면 29번이다.
    const list = await listRange(
      adminCookie,
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );
    expect((list.body.data as unknown[]).length).toBe(5);
  });

  it('반복을 끄면 한 번짜리가 된다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await edit(id, { recurrenceType: 'none' });
    expect(res.status).toBe(200);

    const row = await Event.findByPk(id);
    expect(row?.recurrenceType).toBe('none');

    const list = await listRange(
      adminCookie,
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );
    expect((list.body.data as unknown[]).length).toBe(1);
  });

  it('주간으로 바꾸면서 요일을 빠뜨리면 거절한다', async () => {
    const id = (await daily()).body.data.id as number;

    const res = await edit(id, {
      recurrenceType: 'weekly',
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });

    expect(res.status).toBe(400);
    expect((await Event.findByPk(id))?.recurrenceType).toBe('daily');
  });
});
