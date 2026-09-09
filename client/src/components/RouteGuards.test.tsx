// client/src/components/RouteGuards.test.tsx
// 라우트 가드는 "누가 어느 화면을 볼 수 있는가"를 결정하는 마지막 방어선이라
// 리다이렉트 목적지까지 함께 검증한다.

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import RoleProtectedRoute from './RoleProtectedRoute';
import { useAuth } from '../store/auth';
import { makeUser } from '../test/factories';

// 가드가 어디로 보냈는지 확인하기 위해 리다이렉트 목적지마다 표식 화면을 둔다.
function renderAt(initialPath: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>로그인 화면</div>} />
        <Route path="/unauthorized" element={<div>권한 없음 화면</div>} />
        <Route path="/change-password" element={<div>비밀번호 변경 화면</div>} />
        <Route path={initialPath} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAuth.setState({ user: null, isAuthenticated: false, isLoading: false, tokenInfo: null });
});

describe('ProtectedRoute', () => {
  it('인증 확인 중에는 자식 대신 로딩을 보여준다', () => {
    useAuth.setState({ isLoading: true });
    renderAt(
      '/dashboard',
      <ProtectedRoute>
        <div>보호된 내용</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('인증 확인 중...')).toBeInTheDocument();
    expect(screen.queryByText('보호된 내용')).not.toBeInTheDocument();
  });

  it('미인증 사용자는 로그인 화면으로 보낸다', () => {
    renderAt(
      '/dashboard',
      <ProtectedRoute>
        <div>보호된 내용</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('로그인 화면')).toBeInTheDocument();
    expect(screen.queryByText('보호된 내용')).not.toBeInTheDocument();
  });

  it('인증된 사용자는 자식을 렌더한다', () => {
    useAuth.getState().setUser(makeUser());
    renderAt(
      '/dashboard',
      <ProtectedRoute>
        <div>보호된 내용</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('보호된 내용')).toBeInTheDocument();
  });

  it('mustChangePassword 사용자는 비밀번호 변경 화면으로 강제 이동', () => {
    useAuth.getState().setUser(makeUser({ mustChangePassword: true }));
    renderAt(
      '/dashboard',
      <ProtectedRoute>
        <div>보호된 내용</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('비밀번호 변경 화면')).toBeInTheDocument();
    expect(screen.queryByText('보호된 내용')).not.toBeInTheDocument();
  });

  it('비밀번호 변경 화면 자신은 예외 처리되어 무한 리다이렉트가 없다', () => {
    useAuth.getState().setUser(makeUser({ mustChangePassword: true }));
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/" element={<div>로그인 화면</div>} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <div>변경 폼</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('변경 폼')).toBeInTheDocument();
  });
});

describe('RoleProtectedRoute', () => {
  it('허용된 역할이면 통과', () => {
    useAuth.getState().setUser(
      makeUser({
        role: 'admin',
        roleInfo: { id: 'admin', name: '관리자', description: '', isActive: true },
      })
    );
    renderAt(
      '/admin',
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>관리자 화면</div>
      </RoleProtectedRoute>
    );

    expect(screen.getByText('관리자 화면')).toBeInTheDocument();
  });

  it('허용되지 않은 역할은 권한 없음으로 보낸다', () => {
    useAuth.getState().setUser(makeUser({ role: 'user' }));
    renderAt(
      '/admin',
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>관리자 화면</div>
      </RoleProtectedRoute>
    );

    expect(screen.getByText('권한 없음 화면')).toBeInTheDocument();
    expect(screen.queryByText('관리자 화면')).not.toBeInTheDocument();
  });

  it('역할 이름이 맞아도 roleInfo.isActive 가 false 면 차단', () => {
    useAuth.getState().setUser(
      makeUser({
        role: 'admin',
        roleInfo: { id: 'admin', name: '관리자', description: '', isActive: false },
      })
    );
    renderAt(
      '/admin',
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>관리자 화면</div>
      </RoleProtectedRoute>
    );

    expect(screen.getByText('권한 없음 화면')).toBeInTheDocument();
  });

  it('미인증 사용자는 권한 없음이 아니라 로그인 화면으로 보낸다', () => {
    renderAt(
      '/admin',
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>관리자 화면</div>
      </RoleProtectedRoute>
    );

    expect(screen.getByText('로그인 화면')).toBeInTheDocument();
  });
});
