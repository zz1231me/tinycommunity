// 기능 스위치는 서버에서 막는다.
//
// 화면에서 감추기만 하면 끈 기능을 API 로 그대로 쓸 수 있다. 새 기능을 더할 때 가장 쉽게
// 빠뜨리는 것이 이 가드라서, 선언된 스위치를 전부 훑어 하나라도 빠지면 여기서 잡는다.
//
// 막을 API 가 없는 스위치(저장된 마크업을 어떻게 그릴지 같은 것)는 clientOnly 로 적어 둔다 —
// 그것을 적는 행위 자체가 '서버에서 막을 수 없다' 는 판단을 남기는 일이다.

import fs from 'fs';
import path from 'path';
import { NOTIFICATION_KIND_KEYS } from '../config/notificationKinds';
import { FEATURES, type FeatureKey } from '../config/features';

const SERVER_SRC = path.join(__dirname, '..');

/** 테스트와 스위치 선언 자체를 빼고 서버 코드 전부를 한 덩어리로 읽는다 */
function readServerSources(): string {
  const chunks: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (full.endsWith(path.join('config', 'features.ts'))) continue;
      chunks.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(SERVER_SRC);
  return chunks.join('\n');
}

const sources = readServerSources();
const keys = Object.keys(FEATURES) as FeatureKey[];

describe('기능 스위치', () => {
  it('선언을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(keys.length).toBeGreaterThan(10);
    expect(sources.length).toBeGreaterThan(10_000);
  });

  it('하나도 빠짐없이 서버에서 막거나, 막을 수 없다고 적어 둔다', () => {
    const ungated = keys.filter(key => {
      if (FEATURES[key].clientOnly) return false;
      // 이름이 어딘가에 적혀 있기만 한 것으로는 모자란다 — 실제로 막는 두 가지 모양만 센다.
      // (검색 결과에서 걸러 내는 코드에도 스위치 이름이 나오기 때문이다)
      return !(
        sources.includes(`requireFeature('${key}')`) || sources.includes(`isEnabled('${key}')`)
      );
    });

    expect(ungated).toEqual([]);
  });

  it('clientOnly 는 막을 API 가 없는 것만 — 지금은 문단별 첨부 하나다', () => {
    // 늘어나면 정말 막을 수 없는 것인지 한 번 더 생각하게 만든다.
    const clientOnly = keys.filter(key => FEATURES[key].clientOnly);
    expect(clientOnly).toEqual(['post.inlineAttachments']);
  });

  it('필요 조건으로 적은 스위치는 실제로 있는 것이어야 한다', () => {
    // 오타가 나면 그 조건은 조용히 무시된다 — 끈 기능 위에 켜진 기능이 남는다.
    const unknown: string[] = [];
    for (const key of keys) {
      for (const need of FEATURES[key].requires ?? []) {
        if (!keys.includes(need as FeatureKey)) unknown.push(`${key} → ${need}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe('알림 종류', () => {
  it('선언한 종류는 모두 어딘가에서 만들어진다 — 아무도 안 보내는 종류는 설정만 늘린다', () => {
    const unused = NOTIFICATION_KIND_KEYS.filter(kind => {
      // notificationService.create({ type: 'X' }) 로 보낸다.
      return !sources.includes(`type: '${kind}'`);
    });
    expect(unused).toEqual([]);
  });
});
