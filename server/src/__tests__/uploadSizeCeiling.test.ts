// 파일 상한을 2GB 까지 올릴 수 있는가, 그리고 올려도 조용히 깨지는 곳이 없는가.
//
// 상한 하나를 올리는 일이 아니다. 네 층이 함께 맞아야 한다.
//  1. 관리자 설정의 검증 범위 (여기)
//  2. 크기를 담는 컬럼 — 부호 있는 INTEGER 는 2,147,483,647 바이트(2047.99MiB)에서 넘친다
//  3. nginx client_max_body_size — 더 작으면 Express 에 닿기도 전에 413
//  4. express.json 의 본문 상한 — 파일과 달리 통째로 메모리에 담긴다
//
// 3번은 설정 파일이라 여기서 못 돌린다. 대신 '두 값이 어긋나지 않았는지' 를 읽어서 본다.

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { SiteSettings } from '../models/SiteSettings';
import { TempShare } from '../models/TempShare';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { refreshSettingsCache, getFileSizeLimits } from '../utils/settingsCache';

let adminCookie: string;

const put = (body: Record<string, unknown>) =>
  request(app).put('/api/site-settings').set(CSRF_HEADER).set('Cookie', adminCookie).send(body);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

afterAll(async () => {
  const [row] = await SiteSettings.findOrCreate({ where: {} });
  await row.update({ maxFileSizeMb: 100 });
  await refreshSettingsCache();
});

describe('파일 상한 2GB', () => {
  it('관리자가 2048MB 까지 올릴 수 있다', async () => {
    const res = await put({ maxFileSizeMb: 2048 });
    expect(res.status).toBe(200);

    await refreshSettingsCache();
    // 업로더가 실제로 쓰는 바이트 값까지 따라와야 한다
    expect(getFileSizeLimits().DOCUMENT).toBe(2048 * 1024 * 1024);
  });

  it('2048MB 를 넘기면 거절한다 — 받을 수 없는 값을 저장해 두지 않는다', async () => {
    const res = await put({ maxFileSizeMb: 4096 });
    expect(res.status).toBe(400);
  });

  it('크기 컬럼이 BIGINT 다 — SQLite 는 타입이 느슨해 값만 보면 통과하는 척한다', () => {
    for (const model of [TempShare, PostAttachmentVersion]) {
      const type = String(model.getAttributes().size.type).toUpperCase();
      expect(type).toContain('BIGINT');
    }
  });

  it('2GB 짜리 크기를 적어 둘 수 있다 — INTEGER 였다면 넘친다', async () => {
    const twoGb = 2 * 1024 * 1024 * 1024; // 2,147,483,648 — 부호 있는 INT 상한 + 1
    const row = await TempShare.create({
      id: `size-${Date.now()}`,
      originalName: '큰파일.zip',
      storedName: 'stored',
      size: twoGb,
      mimetype: 'application/zip',
      uploadedBy: 'admin',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const read = await TempShare.findByPk(row.id);
    expect(read?.size).toBe(twoGb);
    // 숫자로 돌려줘야 한다 — BIGINT 는 드라이버에 따라 문자열로 온다
    expect(typeof read?.size).toBe('number');
    await row.destroy();
  });
});

describe('층 사이가 어긋나지 않는다', () => {
  it('nginx 가 관리자 상한보다 작지 않다', () => {
    const root = path.resolve(__dirname, '../../..');
    for (const file of ['nginx.conf', 'nginx.docker.conf']) {
      const conf = fs.readFileSync(path.join(root, file), 'utf-8');
      const m = conf.match(/client_max_body_size\s+(\d+)m;/);
      expect(m).not.toBeNull();
      // 여기가 더 작으면 관리자가 한도를 올려도 nginx 가 먼저 413 으로 끊는다
      expect(Number(m?.[1])).toBeGreaterThanOrEqual(2048);
    }
  });
});
