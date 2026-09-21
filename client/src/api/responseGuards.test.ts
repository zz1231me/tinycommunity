// client/src/api/responseGuards.test.ts
//
// 서버 답의 '안쪽' 을 확인하지 않고 바로 쓰는 자리를 막는다.
//
// data?.posts.length 는 data 만 지켜 준다. posts 가 없으면(서버가 모양을 바꾸거나 오류 봉투가
// 오거나, 배열 하나만 돌려주면) 그 자리에서 터진다. 이 앱에는 화면별 오류 울타리가 없어서
// 곁다리 목록 하나가 페이지 전체를 하얗게 만든다 — 실제로 관련 글·스크랩에서 그렇게 됐다.
//
// 브라우저로 페이지를 띄워 보다 찾은 유형이라 테스트 환경에서는 잘 드러나지 않는다.
// 그래서 코드를 읽어 막는다.

import { describe, expect, it } from 'vitest';

const modules = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** a?.b.length / a?.b.map — 앞만 지키고 안쪽은 지키지 않은 자리 */
const HALF_GUARDED = /[A-Za-z_$][\w$]*\?\.[A-Za-z_$][\w$]*\.(length|map)\b/g;

describe('서버 답을 쓰기 전에', () => {
  it('원본을 읽었다 — 비어 있으면 아래 검사가 헛돈다', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(100);
  });

  it('안쪽까지 확인하지 않고 length·map 을 부르지 않는다', () => {
    const offenders = Object.entries(modules).flatMap(([path, text]) =>
      [...text.matchAll(HALF_GUARDED)].map(m => `${path}: ${m[0]}`)
    );
    expect(offenders).toEqual([]);
  });

  it('제대로 지킨 모양은 걸리지 않는다 — 대조', () => {
    expect('data?.posts?.length ?? 0'.match(HALF_GUARDED)).toBeNull();
    expect('(data?.posts ?? []).map(x => x)'.match(HALF_GUARDED)).toBeNull();
    expect('data?.posts.length'.match(HALF_GUARDED)).not.toBeNull();
  });
});
