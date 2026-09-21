// server/src/__tests__/indexHtmlRedeploy.test.ts
// 배포해도 열어 둔 사람들에게 예전 화면이 남던 자리.
//
// index.html 에는 빌드된 자산 이름(해시)이 들어 있다. 프로세스가 이 파일을 처음 한 번만
// 읽어 두면, 새로 빌드해도 서버를 다시 띄우기 전까지 옛 HTML 을 계속 내보낸다 —
// 사람들은 새로고침을 해도(no-store 라 HTML 은 새로 받는데) 그 안이 옛것이라 그대로였다.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { readAppVersion, renderIndexHtml, invalidateIndexHtmlCache } from '../utils/indexHtml';

jest.mock('../models/SiteSettings', () => ({
  SiteSettings: { findOne: jest.fn().mockResolvedValue(null) },
}));

const html = (asset: string) =>
  `<!doctype html><html><head><title>t</title></head><body><script src="/assets/${asset}"></script></body></html>`;

describe('새로 빌드한 index.html', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-'));
    file = path.join(dir, 'index.html');
    fs.writeFileSync(file, html('app-aaa.js'));
    invalidateIndexHtmlCache();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('다시 띄우지 않아도 새 자산 이름을 내보낸다', async () => {
    expect(await renderIndexHtml(file)).toContain('app-aaa.js');

    // 배포 — 같은 자리에 새 빌드가 들어온다
    fs.writeFileSync(file, html('app-bbb.js'));
    fs.utimesSync(file, new Date(Date.now() + 2000), new Date(Date.now() + 2000));

    expect(await renderIndexHtml(file)).toContain('app-bbb.js');
  });

  it('빌드가 바뀌면 표식도 바뀐다 — 화면이 이것으로 알아챈다', () => {
    const before = readAppVersion(file);

    fs.writeFileSync(file, html('app-bbb.js'));
    fs.utimesSync(file, new Date(Date.now() + 2000), new Date(Date.now() + 2000));

    const after = readAppVersion(file);
    expect(after).not.toBe(before);
    expect(readAppVersion(file)).toBe(after); // 안 바뀌면 그대로
  });

  it('그 표식을 HTML 에도 심는다 — 화면이 자기 버전을 안다', async () => {
    const rendered = await renderIndexHtml(file);
    expect(rendered).toContain(`<meta name="app-version" content="${readAppVersion(file)}"`);
  });
});
