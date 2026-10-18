// 검증이 거절할 때 쓰는 말.
//
// 스키마마다 한글 메시지를 달아 두었지만, 달지 않은 규칙은 zod 의 기본 문구가 그대로
// 나간다. 실제로 써 보다 발견했다 — 대결 판돈에 큰 수를 넣으면
//   "stake: Too big: expected number to be <=1000000"
// 이 그대로 사용자에게 간다. 한글 화면에 영어 문장이 뜨는 자리다.
//
// 규칙마다 메시지를 다는 대신, 기본 문구 자체를 한글로 바꾼다 — 앞으로 새로 쓰는
// 스키마도 자동으로 한글이 된다.

import request from 'supertest';
import { z } from 'zod';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

let cookie: string;

/** 라틴 문자가 섞여 있으면 번역되지 않은 기본 문구다(필드 이름 앞머리는 뺀다). */
const hasEnglishSentence = (message: string) => {
  const withoutField = message.replace(/^[A-Za-z0-9_.]+:\s*/, '');
  return /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(withoutField);
};

beforeAll(async () => {
  await seedTestData();
  for (const key of ['tools.lottery', 'tools.pointDuel']) {
    await FeatureFlag.destroy({ where: { key } });
    await FeatureFlag.create({ key, enabled: true });
  }
  featureFlagService.invalidate();
  cookie = await loginAs('testuser', 'TestUser123!');
});

describe('스키마가 내는 말은 한글이다', () => {
  it('대결 판돈이 한계를 넘으면 한글로 알려 준다', async () => {
    const res = await request(app)
      .post('/api/points/duels')
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send({ opponentId: 'admin', stake: 9_999_999, hand: 'rock' });

    expect(res.status).toBe(400);
    expect(hasEnglishSentence(res.body.message)).toBe(false);
  });

  it('고를 수 없는 값을 보내도 한글로 알려 준다', async () => {
    const res = await request(app)
      .post('/api/points/duels')
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send({ opponentId: 'admin', stake: 100, hand: '바위' });

    expect(res.status).toBe(400);
    expect(hasEnglishSentence(res.body.message)).toBe(false);
  });

  it('적어 둔 한글 메시지는 그대로 쓴다 — 양성 대조', async () => {
    // 기본 문구만 바꾸고, 스키마가 직접 적은 말은 건드리지 않는다
    const res = await request(app)
      .post('/api/points/duels')
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send({ opponentId: 'admin', stake: 1.5, hand: 'rock' });

    expect(res.body.message).toContain('건 포인트는 정수여야 합니다.');
  });

  it('흔한 거절들이 모두 한글이다', () => {
    const cases: Array<[string, z.ZodType, unknown]> = [
      ['숫자 자리에 글자', z.object({ n: z.number() }), { n: 'x' }],
      ['너무 큼', z.object({ n: z.number().max(10) }), { n: 99 }],
      ['너무 작음', z.object({ n: z.number().min(10) }), { n: 1 }],
      ['정수 아님', z.object({ n: z.number().int() }), { n: 1.5 }],
      ['글자 수 넘침', z.object({ s: z.string().max(3) }), { s: '가나다라' }],
      ['빈 글자', z.object({ s: z.string().min(1) }), { s: '' }],
      ['목록 밖의 값', z.object({ e: z.enum(['a', 'b']) }), { e: 'c' }],
      ['참·거짓 자리에 글자', z.object({ b: z.boolean() }), { b: 'yes' }],
      ['빠진 칸', z.object({ s: z.string() }), {}],
      ['전자우편 모양', z.object({ s: z.email() }), { s: 'not-an-email' }],
      ['배열 자리에 글자', z.object({ a: z.array(z.string()) }), { a: 'x' }],
    ];

    for (const [label, schema, value] of cases) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      for (const issue of result.error!.issues) {
        // 어느 경우가 깨졌는지 보이게 라벨을 붙여 단언한다
        expect(`${label} → ${issue.message}`).toBe(
          hasEnglishSentence(issue.message) ? '한글이어야 한다' : `${label} → ${issue.message}`
        );
      }
    }
  });
});
