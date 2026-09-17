// 기능 스위치가 서버에서 실제로 막히는지 확인한다.
//
// 가드는 세 군데에 흩어져 있다 — index.ts 의 마운트(app.use('/api/memos',
// requireFeature(...), ...)), 라우트 파일, 서비스 안의 isEnabled 분기.
// 라우트 파일만 훑어서는 누락을 찾을 수 없다.
//
// 새 기능을 카탈로그에 올리면서 가드를 잊으면 여기서 걸린다.

import fs from 'fs';
import path from 'path';
import type { FeatureDefinition } from '../config/features';
import { FEATURES, type FeatureKey } from '../config/features';

const SRC = path.join(__dirname, '..');

/** 서버 코드 전체에서 이 키를 실제로 막고 있는 자리를 찾는다 */
function guardSites(key: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const text = fs.readFileSync(full, 'utf-8');
      // requireFeature('key') 로 라우트를 막거나, isEnabled('key') 로 코드 안에서 갈라진다
      if (text.includes(`requireFeature('${key}')`) || text.includes(`isEnabled('${key}')`)) {
        found.push(path.relative(SRC, full));
      }
    }
  };
  walk(SRC);
  return found;
}

describe('기능 스위치 서버 강제', () => {
  const keys = Object.keys(FEATURES) as FeatureKey[];

  it('카탈로그가 비어 있지 않다', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('%s — clientOnly 가 아니면 서버에도 가드가 있다', key => {
    if ((FEATURES[key] as FeatureDefinition).clientOnly) return;
    const sites = guardSites(key);
    expect(sites.length).toBeGreaterThan(0);
  });

  it('clientOnly 로 적어 둔 기능은 정말 서버 가드가 없다', () => {
    // 서버에서 막으면서 "화면에만 적용" 이라고 적어 두면 관리자 화면이 거짓말을 한다
    for (const key of keys) {
      if (!(FEATURES[key] as FeatureDefinition).clientOnly) continue;
      expect(guardSites(key)).toEqual([]);
    }
  });
});
