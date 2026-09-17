// client/src/components/Avatar.test.tsx
// 프로필 사진을 눌러 크게 보는 동작.
//
// 세 가지가 조용히 어긋날 수 있어 고정해 둔다.
//  · 사진이 없는데 버튼이 되면, 눌러도 아무 일이 없는 자리가 생긴다(글자·무늬 대체 표시).
//  · 켜지 않은 자리까지 버튼이 되면, 목록 행처럼 바깥이 클릭 대상인 곳에서 원래 동작을 가로챈다.
//  · 켠 자리에서 바깥 클릭을 막지 않으면 같은 문제가 그대로 생긴다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Avatar } from './Avatar';

const PHOTO = '/uploads/avatars/avatar_alice.jpg';
const user = { id: 'alice', name: '앨리스', avatar: PHOTO };

describe('언제 눌러서 볼 수 있는가', () => {
  it('사진이 있고 켜 두면 버튼이 된다', () => {
    render(<Avatar user={user} enlargeable />);

    expect(
      screen.getByRole('button', { name: /앨리스님의 프로필 사진 크게 보기/ })
    ).toBeInTheDocument();
  });

  it('켜지 않으면 버튼이 아니다', () => {
    render(<Avatar user={user} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('사진이 없으면 켜 두어도 버튼이 아니다 — 확대할 것이 없다', () => {
    render(<Avatar user={{ id: 'bob', name: '바비', avatar: null }} enlargeable />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('주소가 수상하면 사진으로 치지 않으므로 버튼도 아니다', () => {
    render(
      <Avatar user={{ id: 'eve', name: '이브', avatar: 'javascript:alert(1)' }} enlargeable />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('열고 닫기', () => {
  it('누르면 사진과 이름이 있는 화면이 열린다', async () => {
    render(<Avatar user={user} enlargeable />);

    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }));

    const dialog = await screen.findByRole('dialog', { name: '앨리스님의 프로필 사진' });
    expect(dialog).toBeInTheDocument();
    // Avatar 가 캐시 버스팅용 ?v=... 를 붙이므로 정확히 일치하지는 않는다
    expect(screen.getByAltText('앨리스님의 프로필 사진').getAttribute('src')).toContain(PHOTO);
  });

  it('Escape 로 닫힌다', async () => {
    render(<Avatar user={user} enlargeable />);
    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }));
    await screen.findByRole('dialog');

    // ModalShell 의 키 처리도 effect 에서 붙는다 — 목록이 보인다고 키가 바로 먹지 않는다.
    // 한 번 누르고 기다리는 대신 먹을 때까지 누른다(MentionAutocomplete 테스트와 같은 이유).
    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('바깥 동작을 가로채지 않는다', () => {
  it('행 전체가 클릭 대상이어도 그쪽으로 클릭이 새지 않는다', () => {
    const onRowClick = vi.fn();
    render(
      // 메시지 목록처럼 아바타가 클릭 가능한 행 안에 들어간 상황
      <button type="button" onClick={onRowClick}>
        <Avatar user={user} enlargeable />
      </button>
    );

    fireEvent.click(screen.getByRole('button', { name: /크게 보기/ }));

    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '앨리스님의 프로필 사진' })).toBeInTheDocument();
  });
});
