// client/src/store/auth.test.ts
// 권한 판정(canAccessBoard·isAdmin)과 토큰 만료 계산은 화면 전반의 접근 제어를
// 좌우하는 순수 로직이라 단위 테스트로 고정해 둔다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './auth';
import { makeBoardPermission, makePersonalBoard, makeUser } from '../test/factories';

const initialState = useAuth.getState();

beforeEach(() => {
  useAuth.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    tokenInfo: null,
  });
  vi.useRealTimers();
});

describe('canAccessBoard', () => {
  it('로그인하지 않았으면 어떤 게시판도 접근 불가', () => {
    expect(useAuth.getState().canAccessBoard('notice', 'read')).toBe(false);
  });

  it('권한 목록에 없는 게시판은 거부', () => {
    initialState.setUser(
      makeUser({
        permissions: {
          events: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
          boards: [makeBoardPermission({ boardId: 'notice' })],
          personalBoard: null,
        },
      })
    );
    expect(useAuth.getState().canAccessBoard('secret-board', 'read')).toBe(false);
  });

  it('게시판별 read/write/delete 를 각각 구분해서 판정', () => {
    initialState.setUser(
      makeUser({
        permissions: {
          events: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
          boards: [
            makeBoardPermission({
              boardId: 'notice',
              canRead: true,
              canWrite: false,
              canDelete: false,
            }),
          ],
          personalBoard: null,
        },
      })
    );

    const { canAccessBoard } = useAuth.getState();
    expect(canAccessBoard('notice', 'read')).toBe(true);
    expect(canAccessBoard('notice', 'write')).toBe(false);
    expect(canAccessBoard('notice', 'delete')).toBe(false);
  });

  it('개인 폴더는 boards 목록에 없어도 personalBoard 권한으로 통과', () => {
    initialState.setUser(
      makeUser({
        permissions: {
          events: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
          boards: [],
          personalBoard: makePersonalBoard({ boardId: 'personal-tester' }),
        },
      })
    );

    const { canAccessBoard } = useAuth.getState();
    expect(canAccessBoard('personal-tester', 'read')).toBe(true);
    expect(canAccessBoard('personal-tester', 'write')).toBe(true);
    expect(canAccessBoard('personal-tester', 'delete')).toBe(true);
  });

  it('개인 폴더라도 해당 액션 권한이 false 면 거부', () => {
    initialState.setUser(
      makeUser({
        permissions: {
          events: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
          boards: [],
          personalBoard: makePersonalBoard({ canDelete: false }),
        },
      })
    );
    expect(useAuth.getState().canAccessBoard('personal-tester', 'delete')).toBe(false);
  });
});

describe('isAdmin', () => {
  it('role 이 admin 이면 true', () => {
    initialState.setUser(
      makeUser({
        role: 'admin',
        roleInfo: { id: 'admin', name: '관리자', description: '', isActive: true },
      })
    );
    expect(useAuth.getState().isAdmin()).toBe(true);
  });

  it('role 이 admin 이어도 역할이 비활성이면 false', () => {
    initialState.setUser(
      makeUser({
        role: 'admin',
        roleInfo: { id: 'admin', name: '관리자', description: '', isActive: false },
      })
    );
    expect(useAuth.getState().isAdmin()).toBe(false);
  });

  it('일반 사용자는 false', () => {
    initialState.setUser(makeUser());
    expect(useAuth.getState().isAdmin()).toBe(false);
  });
});

describe('토큰 만료 판정', () => {
  const NOW = new Date('2026-09-06T00:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('tokenInfo 가 없으면 만료된 것으로 간주(안전측 기본값)', () => {
    const s = useAuth.getState();
    expect(s.isAccessTokenExpired()).toBe(true);
    expect(s.isRefreshTokenExpired()).toBe(true);
    expect(s.isTokenExpiringSoon()).toBe(true);
  });

  it('만료 시각이 미래면 유효', () => {
    initialState.updateTokenInfo({
      accessTokenExpiry: NOW + 60 * 60 * 1000,
      refreshTokenExpiry: NOW + 7 * 24 * 60 * 60 * 1000,
    });
    const s = useAuth.getState();
    expect(s.isAccessTokenExpired()).toBe(false);
    expect(s.isRefreshTokenExpired()).toBe(false);
  });

  it('만료 시각과 정확히 같은 순간은 만료로 취급', () => {
    initialState.updateTokenInfo({ accessTokenExpiry: NOW, refreshTokenExpiry: NOW });
    expect(useAuth.getState().isAccessTokenExpired()).toBe(true);
  });

  it('isTokenExpiringSoon 은 기본 5분 임계값을 사용', () => {
    initialState.updateTokenInfo({
      accessTokenExpiry: NOW + 4 * 60 * 1000,
      refreshTokenExpiry: NOW + 60 * 60 * 1000,
    });
    const s = useAuth.getState();
    expect(s.isTokenExpiringSoon()).toBe(true);
    expect(s.isTokenExpiringSoon(3)).toBe(false);
    expect(s.isAccessTokenExpired()).toBe(false);
  });
});

describe('세션 상태 전이', () => {
  it('clearUser 는 사용자와 인증 플래그를 모두 초기화', () => {
    initialState.setUser(makeUser());
    expect(useAuth.getState().isAuthenticated).toBe(true);

    initialState.clearUser();
    const s = useAuth.getState();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.tokenInfo).toBeNull();
  });

  it('updateUser 는 기존 필드를 보존한 채 일부만 갱신', () => {
    initialState.setUser(makeUser({ name: '테스터', avatar: null }));
    initialState.updateUser({ avatar: '/uploads/avatars/a.png' });

    const user = useAuth.getState().getUser();
    expect(user?.name).toBe('테스터');
    expect(user?.avatar).toBe('/uploads/avatars/a.png');
  });

  it('로그인하지 않은 상태에서 updateUser 는 아무 일도 하지 않음', () => {
    initialState.updateUser({ name: '해커' });
    expect(useAuth.getState().user).toBeNull();
  });
});
