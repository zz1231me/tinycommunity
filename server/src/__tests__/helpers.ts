import request from 'supertest';
import { app } from '../index';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Board } from '../models/Board';
import { BoardAccess } from '../models/BoardAccess';
import { SiteSettings } from '../models/SiteSettings';
import { refreshSettingsCache } from '../utils/settingsCache';

export { app };

/**
 * 테스트용 기본 데이터 생성
 * - 역할 4개 (admin, manager, user, guest)
 * - admin 계정 1개
 * - 일반 게시판 1개 (notice)
 * - 사이트 설정 1개
 */
export async function seedTestData() {
  // 역할 생성
  await Role.bulkCreate(
    [
      { id: 'admin', name: '관리자', description: '관리자', isActive: true },
      { id: 'manager', name: '매니저', description: '매니저', isActive: true },
      { id: 'user', name: '일반 사용자', description: '사용자', isActive: true },
      { id: 'guest', name: '게스트', description: '게스트', isActive: true },
    ],
    { ignoreDuplicates: true }
  );

  // admin 계정 생성 (beforeCreate 훅에서 bcrypt 해시 처리)
  const admin = await User.findByPk('admin');
  if (!admin) {
    await User.create({
      id: 'admin',
      password: 'TestAdmin123!',
      name: '관리자',
      email: 'admin@test.com',
      roleId: 'admin',
      isActive: true,
    });
  }

  // 테스트용 일반 사용자
  const testUser = await User.findByPk('testuser');
  if (!testUser) {
    await User.create({
      id: 'testuser',
      password: 'TestUser123!',
      name: '테스트사용자',
      email: 'user@test.com',
      roleId: 'user',
      isActive: true,
    });
  }

  // 일반 게시판 + 접근 권한
  const [board] = await Board.findOrCreate({
    where: { id: 'notice' },
    defaults: {
      id: 'notice',
      name: '공지사항',
      description: '공지사항',
      isPersonal: false,
      isActive: true,
      order: 1,
    },
  });

  await BoardAccess.findOrCreate({
    where: { boardId: board.id, roleId: 'admin' },
    defaults: {
      boardId: board.id,
      roleId: 'admin',
      canRead: true,
      canWrite: true,
      canDelete: true,
    },
  });

  await BoardAccess.findOrCreate({
    where: { boardId: board.id, roleId: 'user' },
    defaults: {
      boardId: board.id,
      roleId: 'user',
      canRead: true,
      canWrite: true,
      canDelete: false,
    },
  });

  // 사이트 설정
  await SiteSettings.findOrCreate({
    where: {},
    defaults: {
      siteName: '테스트',
      siteTitle: '테스트 사이트',
      allowRegistration: true,
      requireApproval: false,
      maintenanceMode: false,
    },
  });
}

/**
 * 테스트에서 요청 수 제한이 방해가 되지 않게 한도를 올린다.
 *
 * 글 작성은 IP 당 시간당 20건으로 묶여 있고(uploadLimiter) 테스트는 한 프로세스·
 * 한 IP 에서 돌아 모든 스위트가 이 예산을 나눠 쓴다. 스위트가 늘거나 순서가 바뀌면
 * 뒤쪽 테스트가 429 로 실패한다.
 *
 * 리미터를 끄지 않고 설정값만 올린다. 리미터 자체는 그대로 돌아서 제한 동작을
 * 확인하는 테스트는 자기 한도로 검증된다.
 */
export async function relaxRateLimits() {
  await SiteSettings.update(
    {
      rateLimitApiMax: 1000,
      rateLimitUploadMax: 1000,
      rateLimitDownloadMax: 500,
    },
    { where: {} }
  );
  await refreshSettingsCache();
}

/** CSRF 보호 헤더 (테스트에서 공통으로 사용) */
export const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

/**
 * 로그인하여 쿠키 반환
 */
export async function loginAs(id: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').set(CSRF_HEADER).send({ id, password });

  const rawCookies = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  return cookies.join('; ');
}
