// client/src/utils/linkifyText.test.ts
// 메시지 본문에서 링크를 찾는 규칙.
//
// 여기서 중요한 것은 "링크를 잘 찾는가" 보다 "링크가 아닌 것을 링크로 만들지
// 않는가" 이다. javascript: 같은 것을 링크로 만들면 그 자리가 곧 공격 표면이 된다.

import { describe, expect, it } from 'vitest';
import { linkifyText } from './linkifyText';

describe('링크 찾기', () => {
  it('http/https 주소를 찾는다', () => {
    expect(linkifyText('보세요 https://example.com 여기')).toEqual([
      { type: 'text', value: '보세요 ' },
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ' 여기' },
    ]);
  });

  it('www. 로 시작하면 https 를 붙인다', () => {
    // 스킴이 없으면 브라우저가 상대 경로로 해석해 엉뚱한 곳으로 간다
    const [seg] = linkifyText('www.example.com');
    expect(seg).toEqual({
      type: 'link',
      value: 'www.example.com',
      href: 'https://www.example.com',
    });
  });

  it('한 줄에 여러 링크를 모두 찾는다', () => {
    const links = linkifyText('https://a.com 과 https://b.com').filter(s => s.type === 'link');
    expect(links).toHaveLength(2);
  });

  it('문장 끝 마침표는 링크에서 뺀다', () => {
    const segs = linkifyText('여기 https://example.com/page.');
    expect(segs[1]).toMatchObject({ type: 'link', value: 'https://example.com/page' });
    expect(segs[2]).toEqual({ type: 'text', value: '.' });
  });

  it('괄호로 감싼 링크에서 닫는 괄호를 뺀다', () => {
    const segs = linkifyText('(https://example.com)');
    expect(segs.find(s => s.type === 'link')).toMatchObject({ value: 'https://example.com' });
  });
});

describe('링크로 만들지 않는 것', () => {
  it('javascript: 는 링크가 아니다', () => {
    const segs = linkifyText('javascript:alert(1)');
    expect(segs.every(s => s.type === 'text')).toBe(true);
  });

  it('data: 는 링크가 아니다', () => {
    const segs = linkifyText('data:text/html,<script>x</script>');
    expect(segs.every(s => s.type === 'text')).toBe(true);
  });

  it('file: 이나 임의 스킴도 링크가 아니다', () => {
    expect(linkifyText('file:///etc/passwd').every(s => s.type === 'text')).toBe(true);
    expect(linkifyText('myapp://open').every(s => s.type === 'text')).toBe(true);
  });

  it('평범한 문장은 통째로 텍스트다', () => {
    expect(linkifyText('오늘 회의 3시입니다')).toEqual([
      { type: 'text', value: '오늘 회의 3시입니다' },
    ]);
  });

  it('꺾쇠는 링크에 포함하지 않는다', () => {
    // <a href="https://x"> 처럼 붙어 들어와도 태그 문자를 링크로 삼키지 않는다
    const link = linkifyText('<https://example.com>').find(s => s.type === 'link');
    expect(link).toMatchObject({ value: 'https://example.com' });
  });
});

describe('경계값', () => {
  it('빈 문자열은 빈 배열', () => {
    expect(linkifyText('')).toEqual([]);
  });

  it('링크만 있는 줄', () => {
    expect(linkifyText('https://example.com')).toEqual([
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
    ]);
  });

  it('줄바꿈은 텍스트로 보존된다', () => {
    // 화면에서 whitespace-pre-wrap 으로 그대로 보여야 한다
    const segs = linkifyText('첫 줄\n둘째 줄');
    expect(segs).toEqual([{ type: 'text', value: '첫 줄\n둘째 줄' }]);
  });
});
