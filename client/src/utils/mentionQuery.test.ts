import { describe, expect, it } from 'vitest';
import { buildMentionText, findMentionQuery, isMentionable } from './mentionQuery';

// 자동완성이 "언제 뜨는가"가 곧 사용성이자 오작동 지점이다.
// 이메일 입력 중에 뜨거나, 멘션을 치는데 안 뜨면 둘 다 실패다.

describe('findMentionQuery', () => {
  it('@ 만 입력해도 빈 검색어로 연다', () => {
    expect(findMentionQuery('안녕 @')).toEqual({ query: '', replaceLength: 1 });
  });

  it('@ 뒤 검색어를 뽑고 치환 길이를 함께 준다', () => {
    expect(findMentionQuery('안녕 @ali')).toEqual({ query: 'ali', replaceLength: 4 });
  });

  it('문장 맨 앞의 @ 도 인식한다', () => {
    expect(findMentionQuery('@bob')).toEqual({ query: 'bob', replaceLength: 4 });
  });

  it('이메일 입력 중에는 열지 않는다', () => {
    expect(findMentionQuery('user@example')).toBeNull();
    expect(findMentionQuery('a@b')).toBeNull();
  });

  it('@@ 는 멘션으로 보지 않는다', () => {
    expect(findMentionQuery('@@x')).toBeNull();
  });

  it('공백이 오면 멘션 입력이 끝난 것으로 본다', () => {
    expect(findMentionQuery('@alice ')).toBeNull();
  });

  it('허용되지 않는 문자가 오면 닫는다', () => {
    expect(findMentionQuery('@alice님')).toBeNull();
    expect(findMentionQuery('@alice!')).toBeNull();
  });

  it('20자를 넘어가면 더 이상 멘션으로 보지 않는다', () => {
    expect(findMentionQuery(`@${'a'.repeat(20)}`)).not.toBeNull();
    expect(findMentionQuery(`@${'a'.repeat(21)}`)).toBeNull();
  });

  it('여러 멘션이 있으면 캐럿 바로 앞의 것만 본다', () => {
    expect(findMentionQuery('@alice 님과 @bo')).toEqual({ query: 'bo', replaceLength: 3 });
  });

  it('빈 문자열·앞에 @가 없으면 null', () => {
    expect(findMentionQuery('')).toBeNull();
    expect(findMentionQuery('그냥 텍스트')).toBeNull();
  });

  it('줄바꿈 직후의 @ 도 인식한다', () => {
    expect(findMentionQuery('앞줄\n@carol')).toEqual({ query: 'carol', replaceLength: 6 });
  });
});

describe('buildMentionText', () => {
  it('@아이디 뒤에 공백을 붙여 바로 이어 쓸 수 있게 한다', () => {
    expect(buildMentionText('alice')).toBe('@alice ');
  });
});

describe('isMentionable', () => {
  it('서버가 인식하는 4~20자 아이디만 true', () => {
    expect(isMentionable('abc')).toBe(false); // 3자 — 서버 정규식에 안 걸린다
    expect(isMentionable('abcd')).toBe(true);
    expect(isMentionable('a'.repeat(20))).toBe(true);
    expect(isMentionable('a'.repeat(21))).toBe(false);
  });

  it('허용되지 않는 문자가 있으면 false', () => {
    expect(isMentionable('한글아이디')).toBe(false);
    expect(isMentionable('with-dash')).toBe(false);
    expect(isMentionable('with_under')).toBe(true);
  });
});

// 아이디를 모르는 상대도 멘션할 수 있어야 하므로 이름으로도 후보가 떠야 한다.
describe('findMentionQuery — 한글 이름', () => {
  it('한글 이름으로도 검색어를 만든다', () => {
    expect(findMentionQuery('안녕 @홍길')).toEqual({ query: '홍길', replaceLength: 3 });
    expect(findMentionQuery('@김')).toEqual({ query: '김', replaceLength: 2 });
  });

  it('멘션을 끝내고 조사를 붙인 것은 검색어로 보지 않는다', () => {
    expect(findMentionQuery('@alice님')).toBeNull();
    expect(findMentionQuery('@alice님이')).toBeNull();
  });

  it('한글 뒤에 붙은 @ 는 멘션이 아니다 (이메일 등)', () => {
    expect(findMentionQuery('홍길동@abc')).toBeNull();
  });
});
