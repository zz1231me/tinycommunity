// 같은 (type, ip) IP 규칙이 두 건 저장될 수 있는가.
//
// createIpRule 은 findOrCreate 로 먼저 조회하고 없으면 만든 뒤, 이미 있으면 409 를
// 낸다. 그 가드는 요청이 하나씩 들어올 때만 성립한다 — 동시에 들어오면 둘 다
// '없음' 을 보고 각자 INSERT 한다. 쌍둥이가 남으면 나중에 관리자가 그 IP 를
// 화이트리스트에서 지워도 남은 행 때문에 접근이 계속 허용된다.
//
// 경쟁을 흉내내는 테스트로는 이걸 잡을 수 없다. 테스트 DB 인 SQLite 는 쓰기 잠금이
// 거칠어 임계구역을 대신 직렬화해 주기 때문에, 제약이 없어도 늘 한 건만 남는다
// (실측: 동시 5건 1205ms / 순차 5건 17ms — 경합은 실제로 일어나지만 결과는 동일).
// 운영 대상인 MySQL·MariaDB 는 행 수준 잠금이라 사정이 다르다. 그래서 여기서는
// 경쟁을 흉내내지 않고 '제약이 실제로 존재하는가' 를 방언과 무관하게 단언한다.
//
// 이 테스트가 공허하지 않다는 근거: 제약을 넣기 전에는 같은 값을 직접 두 번
// 넣어도 그대로 2행이 남았다(실측). 이제는 두 번째가 거절되어야 한다.

import { UniqueConstraintError } from 'sequelize';
import { createIpRule } from '../services/ipRule.service';
import { IpRule } from '../models/IpRule';

const row = (over: Record<string, unknown> = {}) =>
  ({
    type: 'whitelist',
    ip: '203.0.113.5',
    description: null,
    createdBy: 'admin',
    isActive: true,
    ...over,
  }) as never;

describe('IP 규칙의 (type, ip) 유일성', () => {
  beforeEach(async () => {
    await IpRule.destroy({ where: {}, force: true });
  });

  it('DB 가 같은 종류·같은 IP 의 두 번째 행을 거부한다', async () => {
    await IpRule.create(row());

    await expect(IpRule.create(row({ createdBy: 'other' }))).rejects.toBeInstanceOf(
      UniqueConstraintError
    );

    expect(await IpRule.count({ where: { type: 'whitelist', ip: '203.0.113.5' } })).toBe(1);
  });

  it('종류가 다르면 같은 IP 라도 각각 남는다 — 과잉 제약이 아니다', async () => {
    await IpRule.create(row({ type: 'whitelist' }));
    await IpRule.create(row({ type: 'blacklist' }));

    expect(await IpRule.count({ where: { ip: '203.0.113.5' } })).toBe(2);
  });

  it('서비스는 중복 요청을 500 이 아니라 409 로 돌려준다', async () => {
    await createIpRule({ type: 'whitelist', ip: '203.0.113.6', createdBy: 'admin' });

    await expect(
      createIpRule({ type: 'whitelist', ip: '203.0.113.6', createdBy: 'admin' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await IpRule.count({ where: { ip: '203.0.113.6' } })).toBe(1);
  });

  it('앞뒤 공백이 있어도 같은 규칙으로 본다', async () => {
    await createIpRule({ type: 'whitelist', ip: '203.0.113.7', createdBy: 'admin' });

    await expect(
      createIpRule({ type: 'whitelist', ip: '  203.0.113.7  ', createdBy: 'admin' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await IpRule.count({ where: { ip: '203.0.113.7' } })).toBe(1);
  });
});
