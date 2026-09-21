// 테스트용 도메인 객체 팩토리. 기본값을 모아 두고 각 테스트는 필요한 필드만 덮어쓴다.

import type { User } from '../store/auth';

type BoardPermission = User['permissions']['boards'][number];
type PersonalBoard = NonNullable<User['permissions']['personalBoard']>;

export function makeBoardPermission(overrides: Partial<BoardPermission> = {}): BoardPermission {
  return {
    boardId: 'notice',
    canRead: true,
    canWrite: false,
    canDelete: false,
    ...overrides,
  };
}

export function makePersonalBoard(overrides: Partial<PersonalBoard> = {}): PersonalBoard {
  return {
    boardId: 'personal-tester',
    boardName: '내 폴더',
    canRead: true,
    canWrite: true,
    canDelete: true,
    ...overrides,
  };
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'tester',
    name: '테스터',
    role: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    roleInfo: { id: 'user', name: '일반 사용자', description: '', isActive: true },
    permissions: {
      events: { canCreate: false, canRead: true, canUpdate: false, canDelete: false },
      boards: [],
      personalBoard: null,
    },
    ...overrides,
  };
}
