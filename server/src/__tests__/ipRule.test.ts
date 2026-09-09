import { matchesIpRule } from '../services/ipRule.service';

// IP 규칙 매칭 — 관리자 페이지의 마지막 문지기.
//
// 여기서 한 칸만 어긋나도 결과가 둘 중 하나다: 관리자가 자기 화면에서 잠기거나,
// 막았다고 생각한 대역이 그대로 들어온다. 둘 다 조용히 벌어지는 종류라 경계값을 박아 둔다.

describe('단일 IP', () => {
  it('같은 주소만 통과한다', () => {
    expect(matchesIpRule('203.0.113.5', '203.0.113.5')).toBe(true);
    expect(matchesIpRule('203.0.113.6', '203.0.113.5')).toBe(false);
  });

  it('IPv6 로 감싼 IPv4 도 같은 주소로 본다', () => {
    // 노드가 이중 스택 소켓에서 IPv4 를 ::ffff:x.x.x.x 로 준다
    expect(matchesIpRule('::ffff:203.0.113.5', '203.0.113.5')).toBe(true);
  });

  it('IPv6 루프백은 문자 그대로 맞춘다', () => {
    expect(matchesIpRule('::1', '::1')).toBe(true);
  });
});

describe('CIDR 대역', () => {
  it('/24 는 마지막 옥텟만 다른 주소를 포함한다', () => {
    expect(matchesIpRule('192.168.0.1', '192.168.0.0/24')).toBe(true);
    expect(matchesIpRule('192.168.0.255', '192.168.0.0/24')).toBe(true);
    expect(matchesIpRule('192.168.1.0', '192.168.0.0/24')).toBe(false);
  });

  it('/32 는 그 주소 하나만이다', () => {
    expect(matchesIpRule('10.0.0.7', '10.0.0.7/32')).toBe(true);
    expect(matchesIpRule('10.0.0.8', '10.0.0.7/32')).toBe(false);
  });

  it('/0 은 전부 포함한다', () => {
    expect(matchesIpRule('1.2.3.4', '0.0.0.0/0')).toBe(true);
  });

  it('/16 경계 — 세 번째 옥텟이 달라도 포함, 두 번째가 다르면 제외', () => {
    expect(matchesIpRule('172.16.99.1', '172.16.0.0/16')).toBe(true);
    expect(matchesIpRule('172.17.0.1', '172.16.0.0/16')).toBe(false);
  });

  it('최상위 비트가 있는 대역도 부호 없이 다룬다', () => {
    // (~0 << n) 은 음수라, >>> 0 을 빠뜨리면 128.0.0.0/1 같은 대역이 어긋난다
    expect(matchesIpRule('200.0.0.1', '128.0.0.0/1')).toBe(true);
    expect(matchesIpRule('127.255.255.255', '128.0.0.0/1')).toBe(false);
    expect(matchesIpRule('255.255.255.255', '255.255.255.255/32')).toBe(true);
  });
});

describe('맞지 않는 입력은 열어주지 않는다', () => {
  it('프리픽스가 범위를 벗어나면 거절', () => {
    expect(matchesIpRule('10.0.0.1', '10.0.0.0/33')).toBe(false);
    expect(matchesIpRule('10.0.0.1', '10.0.0.0/-1')).toBe(false);
    expect(matchesIpRule('10.0.0.1', '10.0.0.0/abc')).toBe(false);
  });

  it('망가진 주소는 거절', () => {
    expect(matchesIpRule('10.0.0.1', '10.0.0/24')).toBe(false);
    expect(matchesIpRule('10.0.0.1', '999.0.0.0/8')).toBe(false);
    expect(matchesIpRule('', '10.0.0.0/8')).toBe(false);
  });

  it('IPv4 대역 규칙에 IPv6 주소가 걸리지 않는다 — 막는 쪽이 기본값', () => {
    expect(matchesIpRule('2001:db8::1', '0.0.0.0/0')).toBe(false);
    expect(matchesIpRule('2001:db8::1', '192.168.0.0/24')).toBe(false);
  });

  it("'localhost' 규칙은 어떤 실제 IP 와도 맞지 않는다", () => {
    // 규칙 등록은 허용되지만 req.ip 가 'localhost' 인 경우는 없다.
    // 화이트리스트를 '전체 허용'에서 '목록만 허용'으로 뒤집는 효과만 남는다.
    expect(matchesIpRule('127.0.0.1', 'localhost')).toBe(false);
    expect(matchesIpRule('::1', 'localhost')).toBe(false);
  });
});
