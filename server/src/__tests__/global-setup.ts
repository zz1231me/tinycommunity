// 검사 한 판을 시작할 때 한 번 돈다(jest globalSetup).
//
// 검사 DB 는 임시 폴더의 `tinycommunity-test-<pid>.sqlite` 파일이고 끝난 뒤 지우지 않는다.
// 그런데 OS 는 pid 를 돌려 쓴다. 예전 판이 같은 번호를 썼다면 그 판이 남긴 자료를 그대로
// 물려받아, 아무 코드도 바뀌지 않았는데 검사 수십 개가 실패했다가 다시 돌리면 통과한다
// (실제로 그렇게 1,219개 중 19개가 한 번 실패했다).
//
// 그래서 시작할 때 이 판이 쓸 파일을 먼저 지운다. -wal·-shm 까지 함께 지워야 한다.

import fs from 'fs';
import os from 'os';
import path from 'path';

export default function globalSetup(): void {
  const base = path.join(os.tmpdir(), `tinycommunity-test-${process.pid}.sqlite`);
  for (const file of [base, `${base}-wal`, `${base}-shm`]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // 지우지 못해도 검사를 막지 않는다. 최악의 경우 예전처럼 물려받는다.
    }
  }
}
