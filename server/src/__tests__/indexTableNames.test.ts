// 인덱스 스크립트가 적어 둔 테이블 이름이 실제 모델과 대소문자까지 같은지 확인한다.
//
// SQLite 는 테이블 이름의 대소문자를 가리지 않아 'posts' 라고 적어도 Posts 를 찾아 준다.
// 리눅스의 MySQL/MariaDB 는 가린다 — 못 찾으면 add-indexes 가 "테이블 없음" 으로 건너뛰고
// "실패: 0" 이라고 보고하므로, 로그만 봐서는 멀쩡해 보인다.
// 실제로 posts·events·notifications 가 소문자로 적혀 있어 인덱스 8개가 운영에서
// 만들어지지 않고 있었다(느린 목록 조회의 원인).

import fs from 'fs';
import path from 'path';
import '../models';
import { sequelize } from '../config/sequelize';

describe('인덱스 스크립트의 테이블 이름', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'add-indexes.ts'), 'utf-8');
  const used = [...script.matchAll(/table:\s*'([^']+)'/g)].map(m => m[1]);
  const real = new Set(Object.values(sequelize.models).map(m => m.getTableName() as string));

  it('스크립트에서 테이블 이름을 읽어 왔다', () => {
    expect(used.length).toBeGreaterThan(10);
    expect(real.size).toBeGreaterThan(20);
  });

  it('모두 실제 모델의 tableName 과 대소문자까지 일치한다', () => {
    const wrong = used
      .filter(t => !real.has(t))
      .map(t => {
        const near = [...real].find(r => r.toLowerCase() === t.toLowerCase());
        return near ? `'${t}' → 실제로는 '${near}'` : `'${t}' → 그런 테이블이 없음`;
      });
    expect([...new Set(wrong)]).toEqual([]);
  });
});
