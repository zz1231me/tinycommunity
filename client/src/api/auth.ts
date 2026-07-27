// client/src/api/auth.ts - 보안 강화된 회원가입 시스템 지원
import api from './axios';
import { getVisitorId } from '../utils/fingerprint';

// DEV 환경에서만 로그 출력
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) console.info(...args);
};

// 🔐 로그인 - 쿠키 기반
export async function login(id: string, password: string) {
  const fingerprint = await getVisitorId();
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ id, password, fingerprint }),
    credentials: 'include', // ✅ 쿠키 포함
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || '로그인 실패');
  }

  const data = await res.json().catch(() => {
    throw new Error('응답 처리 중 오류가 발생했습니다');
  });
  return data;
}

// 🚪 로그아웃 - 쿠키 삭제
export async function logout() {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!res.ok) {
    throw new Error('로그아웃 실패');
  }

  // 204 No Content는 본문이 없으므로 JSON 파싱 없이 반환
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

// 👤 현재 사용자 정보 조회
// ✅ api 인스턴스 사용: 419(토큰 만료) 시 axios 인터셉터가 자동으로 갱신 후 재시도
//    401(토큰 없음)은 AUTH_ENDPOINT 예외 처리로 리다이렉트 없이 에러 전파 → useAuthInit에서 수동 처리
export async function getCurrentUser() {
  const res = await api.get('/auth/me');
  return res.data;
}

// 🔄 토큰 갱신
export async function refreshToken() {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    // 401 = 리프레시 토큰 없음/만료(로그아웃 상태의 정상 경로) — 조용한 info로만 기록해
    // 초기화 시 콘솔에 빨간 에러처럼 보이는 노이즈를 줄인다. 그 외 상태만 상세 로그.
    if (res.status === 401) {
      devLog('ℹ️ /api/auth/refresh: 유효한 세션 없음 (401)');
    } else {
      devLog('❌ /api/auth/refresh 에러 응답:', errorText);
    }
    const err = Object.assign(new Error(`토큰 갱신 실패: ${res.status}`), {
      status: res.status,
    });
    throw err;
  }

  return res.json();
}

// 🔒 비밀번호 변경
export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post('/auth/change-password', {
    currentPassword,
    newPassword,
  });

  return res.data;
}

// 👤 회원가입 (보안 강화) - ✅ role 필드 완전 제거, email 추가
export async function register(id: string, password: string, name: string, email?: string) {
  // ✅ role 필드 완전 제거
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: any = { id, password, name };

  // ✅ 이메일 추가 (선택사항)
  if (email) {
    requestBody.email = email;
  }

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || '회원가입 실패');
  }

  const data = await res.json().catch(() => {
    throw new Error('응답 처리 중 오류가 발생했습니다');
  });
  return data;
}

// 🔑 비밀번호 초기화 요청 (아이디로 요청 → 관리자 승인)
export async function requestPasswordReset(loginId: string): Promise<{ message: string }> {
  const res = await fetch('/api/auth/password-reset-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ loginId }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || '비밀번호 초기화 요청 실패');
  }

  return res.json().catch(() => {
    throw new Error('응답 처리 중 오류가 발생했습니다');
  });
}

// 🔑 비밀번호 재설정 (토큰 + 새 비밀번호)
export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ token, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || '비밀번호 재설정 실패');
  }

  return res.json().catch(() => {
    throw new Error('응답 처리 중 오류가 발생했습니다');
  });
}

// 🧑 프로필(이름) 변경
export async function updateProfile(name: string) {
  const res = await api.patch('/auth/me/profile', { name });
  return res.data;
}

// 🎨 테마 업데이트
export async function updateTheme(theme: 'light' | 'dark' | 'system') {
  const res = await api.patch('/auth/theme', { theme });
  return res.data;
}

// 📸 아바타 업로드 (api 인스턴스 사용 → 토큰 만료 시 자동 갱신 인터셉터 적용)
export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('avatar', file);

  const res = await api.post('/auth/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  // sendSuccess 봉투 언래핑: { success, data: { avatarUrl } } → { avatarUrl }
  return (res.data.data ?? res.data) as { avatarUrl: string };
}

// 🗑️ 아바타 삭제 (api 인스턴스 사용 → 토큰 만료 시 자동 갱신 인터셉터 적용)
export async function deleteAvatar() {
  const res = await api.delete('/auth/avatar');
  return res.data;
}

// 🖥️ 본인 활성 세션
export interface MySession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export async function fetchMySessions(): Promise<MySession[]> {
  const res = await api.get('/auth/sessions');
  return (res.data.data ?? res.data ?? []) as MySession[];
}

export async function terminateMySession(sessionId: string): Promise<void> {
  await api.delete(`/auth/sessions/${sessionId}`);
}
