import {
  DEFAULT_EVENT_CATEGORIES,
  MAX_EVENT_CATEGORIES,
  parseEventCategories,
  sanitizeEventCategories,
} from '../config/eventCategory';
import fs from 'fs';
import path from 'path';

const ok = { key: 'remote', label: '재택', emoji: '🏠', color: '#2dd4bf' };

describe('일정 분류 설정', () => {
  it('쓸 수 있는 줄은 그대로 남는다', () => {
    expect(sanitizeEventCategories([ok])).toEqual([ok]);
  });

  it('앞뒤 공백은 떼고 저장한다', () => {
    expect(sanitizeEventCategories([{ ...ok, label: '  재택  ' }])[0].label).toBe('재택');
  });

  it.each([
    ['이름이 비면', { ...ok, label: '  ' }],
    ['이름이 20자를 넘으면', { ...ok, label: '가'.repeat(21) }],
    ['색이 hex 가 아니면', { ...ok, color: 'red' }],
    ['색이 없으면', { ...ok, color: '' }],
    ['키에 쓸 수 없는 글자가 있으면', { ...ok, key: 'a b' }],
    ['키가 비면', { ...ok, key: '' }],
    ['그림문자가 8자를 넘으면', { ...ok, emoji: '🙂'.repeat(5) }],
  ])('%s 그 줄을 버린다', (_label, row) => {
    expect(sanitizeEventCategories([row, { ...ok, key: 'keep' }])).toEqual([
      { ...ok, key: 'keep' },
    ]);
  });

  it('#rgb 짧은 색도 받는다', () => {
    expect(sanitizeEventCategories([{ ...ok, color: '#abc' }])).toHaveLength(1);
  });

  it('같은 키가 둘이면 먼저 온 것만 남는다', () => {
    const out = sanitizeEventCategories([ok, { ...ok, label: '나중' }]);
    expect(out).toEqual([ok]);
  });

  it('상한을 넘게 보내면 앞에서 끊는다', () => {
    const many = Array.from({ length: MAX_EVENT_CATEGORIES + 5 }, (_, i) => ({
      ...ok,
      key: `k${i}`,
    }));
    expect(sanitizeEventCategories(many)).toHaveLength(MAX_EVENT_CATEGORIES);
  });

  // 분류가 하나도 없으면 폼이 분류를 필수로 받으므로 일정을 아예 만들 수 없다.
  it.each([
    ['빈 배열', []],
    ['모두 못 쓰는 줄', [{ label: '' }]],
    ['배열이 아닌 값', { key: 'x' }],
    ['null', null],
  ])('%s 이면 기본 목록으로 돌린다', (_label, input) => {
    expect(sanitizeEventCategories(input)).toEqual(DEFAULT_EVENT_CATEGORIES);
  });

  it('깨진 JSON 은 기본 목록으로 읽는다', () => {
    expect(parseEventCategories('{nope')).toEqual(DEFAULT_EVENT_CATEGORIES);
    expect(parseEventCategories(null)).toEqual(DEFAULT_EVENT_CATEGORIES);
  });

  it('저장된 JSON 을 되읽는다', () => {
    expect(parseEventCategories(JSON.stringify([ok]))).toEqual([ok]);
  });

  it('기본 목록 자체가 검사를 통과한다', () => {
    expect(sanitizeEventCategories(DEFAULT_EVENT_CATEGORIES)).toEqual(DEFAULT_EVENT_CATEGORIES);
  });

  // 화면은 이 수를 넘으면 '추가' 단추를 감춘다. 두 값이 어긋나면 관리자가 더 넣을 수 있는데
  // 서버가 말없이 자르거나, 넣을 수 있는데 단추가 사라진다.
  it('클라이언트가 쓰는 상한과 같다', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../client/src/api/siteSettings.ts'),
      'utf-8'
    );
    const m = src.match(/MAX_EVENT_CATEGORIES\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(MAX_EVENT_CATEGORIES);
  });
});
