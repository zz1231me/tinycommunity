import api from './axios';
import { getVisitorId } from '../utils/fingerprint';
import type { Theme } from '../contexts/ThemeContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) console.info(...args);
};

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

// api 인스턴스 사용: 419(토큰 만료)는 인터셉터가 갱신 후 재시도하고, 401 은 리다이렉트 없이 전파된다.
export async function getCurrentUser() {
  const res = await api.get('/auth/me');
  return res.data;
}

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

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post('/auth/change-password', {
    currentPassword,
    newPassword,
  });

  return res.data;
}

export async function register(id: string, password: string, name: string, email?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: any = { id, password, name };

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

// 비밀번호 초기화 요청. 6자리 인증번호를 만들고 발급은 관리자를 통한다.
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

// 비밀번호 재설정 (아이디 + 6자리 인증번호 + 새 비밀번호)
export async function verifyPasswordReset(
  loginId: string,
  code: string,
  password: string
): Promise<{ message: string }> {
  const res = await fetch('/api/auth/password-reset-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ loginId, code, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || '비밀번호 재설정 실패');
  }

  return res.json().catch(() => {
    throw new Error('응답 처리 중 오류가 발생했습니다');
  });
}

export async function updateProfile(name: string) {
  const res = await api.patch('/auth/me/profile', { name });
  return res.data;
}

export async function updateTheme(theme: Theme) {
  const res = await api.patch('/auth/theme', { theme });
  return res.data;
}

// api 인스턴스를 써서 토큰 만료 시 자동 갱신 인터셉터를 탄다.
export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('avatar', file);

  const res = await api.post('/auth/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  // sendSuccess 봉투 언래핑
  return (res.data.data ?? res.data) as { avatarUrl: string };
}

// api 인스턴스를 써서 토큰 만료 시 자동 갱신 인터셉터를 탄다.
export async function deleteAvatar() {
  const res = await api.delete('/auth/avatar');
  return res.data;
}

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
