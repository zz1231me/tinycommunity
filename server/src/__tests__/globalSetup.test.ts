import fs from 'fs';
import os from 'os';
import path from 'path';
import globalSetup from './global-setup';

// 검사 DB 파일을 판 시작 때 지우는지.
//
// 파일 이름에 pid 가 들어가고 끝난 뒤 지우지 않는데, OS 는 pid 를 돌려 쓴다. 예전 판이
// 남긴 자료를 물려받으면 코드가 그대로인데도 검사가 무더기로 실패했다가 다시 돌리면
// 통과한다(실제로 1,219개 중 19개가 그렇게 한 번 실패했다). 그 자리를 막아 둔다.

const dbPath = path.join(os.tmpdir(), `tinycommunity-test-${process.pid}.sqlite`);

describe('globalSetup', () => {
  it('이 판이 쓸 DB 파일과 곁딸린 파일을 지운다', () => {
    const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const f of files) fs.writeFileSync(f, 'stale');
    expect(files.every(f => fs.existsSync(f))).toBe(true);

    globalSetup();

    expect(files.some(f => fs.existsSync(f))).toBe(false);
  });

  it('파일이 없어도 그냥 지나간다 — 첫 판에서 터지지 않게', () => {
    expect(() => globalSetup()).not.toThrow();
  });
});
