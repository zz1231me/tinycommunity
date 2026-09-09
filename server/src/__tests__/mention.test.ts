// server/src/__tests__/mention.test.ts
// 멘션 파싱 경계 검증. 오탐은 곧 알림 스팸이고, 누락은 기능이 동작하지 않는 것이라
// 어디까지를 멘션으로 볼지 명시적으로 고정한다.

import { extractMentions } from '../services/mention.service';

describe('extractMentions', () => {
  it('평문에서 멘션을 찾는다', () => {
    expect(extractMentions('@alice 확인 부탁드립니다')).toEqual(['alice']);
  });

  it('HTML 본문에서도 태그를 걷어내고 찾는다', () => {
    expect(extractMentions('<p>안녕하세요 <strong>@bobby</strong>님</p>')).toEqual(['bobby']);
  });

  it('여러 명을 순서대로 찾고 중복은 제거한다', () => {
    expect(extractMentions('@alice @bobby 그리고 다시 @alice')).toEqual(['alice', 'bobby']);
  });

  it('문장 부호가 붙어도 아이디만 잘라낸다', () => {
    expect(extractMentions('@alice, @bobby! @carol_1?')).toEqual(['alice', 'bobby', 'carol_1']);
  });

  it('이메일 주소는 멘션으로 보지 않는다', () => {
    expect(extractMentions('연락처는 user@example.com 입니다')).toEqual([]);
  });

  it('아이디 규칙(4~20자)에 맞지 않으면 무시한다', () => {
    expect(extractMentions('@abc')).toEqual([]); // 3자 — 너무 짧다
    expect(extractMentions(`@${'a'.repeat(21)}`)).toEqual([]); // 21자 — 너무 길다
    expect(extractMentions(`@${'a'.repeat(20)}`)).toEqual(['a'.repeat(20)]);
  });

  it('허용되지 않는 문자가 섞이면 허용 구간까지만 인식한다', () => {
    // 한글은 아이디에 쓸 수 없으므로 영문 부분만 잡힌다
    expect(extractMentions('@alice님')).toEqual(['alice']);
  });

  it('@ 만 있거나 본문이 비어도 안전하다', () => {
    expect(extractMentions('@')).toEqual([]);
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions('  ')).toEqual([]);
  });

  it('한 번에 10명까지만 인식한다(알림 폭주 방지)', () => {
    const many = Array.from({ length: 15 }, (_, i) => `@user${String(i).padStart(3, '0')}`).join(
      ' '
    );
    expect(extractMentions(many)).toHaveLength(10);
  });

  it('줄바꿈·연속 공백이 있어도 찾는다', () => {
    expect(extractMentions('<p>@alice</p>\n<p>@bobby</p>')).toEqual(['alice', 'bobby']);
  });

  it('Tiptap JSON 본문에서도 찾는다', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '@alice 확인 부탁' }] }],
    });
    expect(extractMentions(doc)).toEqual(['alice']);
  });
});
