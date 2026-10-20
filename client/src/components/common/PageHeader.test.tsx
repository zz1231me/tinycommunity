// 페이지 머리글이 같은 말을 두 번 하지 않는가, 그리고 사이트 머리글 행세를
// 하지 않는가.
//
// 1) 빵부스러기의 마지막 조각은 바로 아래 제목과 같은 문자열이다. 쓰는 쪽
//    두 군데가 모두 그렇게 넘긴다(게시판 목록·마이페이지). 실측(1512px):
//    빵부스러기 y=80, 제목 y=113 — 같은 이름이 33px 간격으로 두 번 나오고
//    그만큼 목록이 밀린다. 부스러기가 실어 나르는 정보는 '대시보드로 올라가는
//    길' 하나뿐인데, 그건 왼쪽 메뉴 맨 위에 늘 떠 있다.
//
// 2) role="banner" 가 달려 있다. banner 는 사이트 전체 머리글 하나를 가리키는
//    이정표다. 위쪽 진짜 머리글이 이미 그것이므로, 페이지마다 하나씩 더 생기면
//    보조도구에서 '머리글' 로 건너뛸 때 어디로 갈지 알 수 없게 된다.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

const draw = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('빵부스러기', () => {
  it('제목과 같은 마지막 조각은 그리지 않는다', () => {
    draw(
      <PageHeader
        breadcrumbs={[{ label: '대시보드', to: '/dashboard' }, { label: 'QA직원게시판' }]}
        title="QA직원게시판"
      />
    );

    // 이름이 화면에 한 번만 나와야 한다
    expect(screen.getAllByText('QA직원게시판')).toHaveLength(1);
  });

  it('올라가는 길은 남는다 — 그게 부스러기의 쓸모다', () => {
    draw(
      <PageHeader
        breadcrumbs={[{ label: '대시보드', to: '/dashboard' }, { label: 'QA직원게시판' }]}
        title="QA직원게시판"
      />
    );

    expect(screen.getByRole('link', { name: '대시보드' }).getAttribute('href')).toBe('/dashboard');
  });

  it('제목과 다른 마지막 조각은 그대로 둔다 — 양성 대조', () => {
    draw(
      <PageHeader
        breadcrumbs={[{ label: '대시보드', to: '/dashboard' }, { label: '상위 문서' }]}
        title="하위 문서"
      />
    );

    expect(screen.getByText('상위 문서')).toBeTruthy();
    expect(screen.getByText('하위 문서')).toBeTruthy();
  });
});

describe('이정표', () => {
  // 브라우저는 main·section·article·aside·nav 안의 header 를 banner 로 치지 않는다
  // (HTML-AAM). 그러니 여기서 없애야 할 건 손으로 달아 둔 role="banner" 뿐이다.
  //
  // jsdom 은 그 범위 규칙을 구현하지 않아서(확인: main 안 header 도 banner 1개로
  // 센다) queryByRole('banner') 로는 둘을 가를 수 없다. 그래서 역할 속성 자체를
  // 본다 — 그게 우리가 쥐고 있는 것이다.
  it('머리글에 손으로 단 역할이 없다 — banner 는 위쪽 진짜 머리글 몫이다', () => {
    const { container } = draw(<PageHeader title="내 업무" />);

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.getAttribute('role')).toBeNull();
  });

  it('제목은 그대로 h1 으로 읽힌다 — 양성 대조', () => {
    draw(<PageHeader title="내 업무" />);

    expect(screen.getByRole('heading', { level: 1, name: '내 업무' })).toBeTruthy();
  });
});
