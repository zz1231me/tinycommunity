// client/src/store/auth.ts
import { create } from 'zustand';

// ✅ 서버 응답 구조에 맞게 타입 수정 + 아바타 필드 추가
interface User {
  id: string;
  name: string;
  role: string;
  theme?: string; // ✅ 테마 필드 추가
  avatar?: string | null; // ✅ 아바타 필드 추가
  createdAt: string; // ✅ 계정 생성일 추가
  mustChangePassword?: boolean; // 관리자 초기화 후 강제 비밀번호 변경 필요
  roleInfo: {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
  };
  permissions: {
    events: {
      canCreate: boolean;
      canRead: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    };
    boards: Array<{
      boardId: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    }>;
    personalBoard: {
      boardId: string;
      boardName: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    } | null;
  };
}

interface TokenInfo {
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tokenInfo: TokenInfo | null;

  setUser: (user: User, tokenInfo?: TokenInfo) => void;
  updateUser: (updates: Partial<User>) => void; // ✅ 사용자 정보 업데이트 함수 추가
  clearUser: () => void;
  setLoading: (loading: boolean) => void;

  updateTokenInfo: (tokenInfo: TokenInfo) => void;
  isAccessTokenExpired: () => boolean;
  isRefreshTokenExpired: () => boolean;
  isTokenExpiringSoon: (minutesBefore?: number) => boolean;

  getUserId: () => string | null;
  getUserName: () => string | null;
  getUserRole: () => string | null;
  getUser: () => User | null; // ✅ 전체 사용자 정보 반환 함수 추가
  isAdmin: () => boolean;
  canAccessBoard: (boardId: string, action: 'read' | 'write' | 'delete') => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  tokenInfo: null,

  setUser: (user, tokenInfo) => {
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      tokenInfo: tokenInfo || null,
    });

    if (tokenInfo) {
      localStorage.setItem('tokenInfo', JSON.stringify(tokenInfo));
      if (import.meta.env.DEV)
        console.info('토큰 정보 저장:', new Date(tokenInfo.accessTokenExpiry));
    }
  },

  // ✅ 사용자 정보 부분 업데이트 함수
  updateUser: updates => {
    const { user } = get();
    if (user) {
      const updatedUser = { ...user, ...updates };
      set({ user: updatedUser });
    }
  },

  clearUser: () => {
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      tokenInfo: null,
    });

    localStorage.removeItem('tokenInfo');
  },

  setLoading: isLoading => set({ isLoading }),

  updateTokenInfo: tokenInfo => {
    set({ tokenInfo });
    localStorage.setItem('tokenInfo', JSON.stringify(tokenInfo));
    if (import.meta.env.DEV)
      console.info('토큰 정보 업데이트:', new Date(tokenInfo.accessTokenExpiry));
  },

  isAccessTokenExpired: () => {
    const { tokenInfo } = get();
    if (!tokenInfo) return true;

    const now = Date.now();
    return now >= tokenInfo.accessTokenExpiry;
  },

  isRefreshTokenExpired: () => {
    const { tokenInfo } = get();
    if (!tokenInfo) return true;

    const now = Date.now();
    return now >= tokenInfo.refreshTokenExpiry;
  },

  isTokenExpiringSoon: (minutesBefore = 5) => {
    const { tokenInfo } = get();
    if (!tokenInfo) return true;

    const now = Date.now();
    const threshold = minutesBefore * 60 * 1000;
    return now >= tokenInfo.accessTokenExpiry - threshold;
  },

  getUserId: () => {
    const { user } = get();
    return user?.id || null;
  },

  getUserName: () => {
    const { user } = get();
    return user?.name || null;
  },

  getUserRole: () => {
    const { user } = get();
    return user?.role || null;
  },

  // ✅ 전체 사용자 정보 반환 함수 추가
  getUser: () => {
    const { user } = get();
    return user;
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role === 'admin' && user?.roleInfo?.isActive !== false;
  },

  // ✅ permissions.boards 배열 + personalBoard에서 검색
  canAccessBoard: (boardId: string, action: 'read' | 'write' | 'delete') => {
    const { user } = get();
    if (!user?.permissions) return false;

    // 개인 폴더 확인
    const personal = user.permissions.personalBoard;
    if (personal?.boardId === boardId) {
      switch (action) {
        case 'read':
          return personal.canRead;
        case 'write':
          return personal.canWrite;
        case 'delete':
          return personal.canDelete;
      }
    }

    const boardPermission = user.permissions.boards?.find(p => p.boardId === boardId);
    if (!boardPermission) return false;

    switch (action) {
      case 'read':
        return boardPermission.canRead;
      case 'write':
        return boardPermission.canWrite;
      case 'delete':
        return boardPermission.canDelete;
      default:
        return false;
    }
  },
}));

// ✅ 편의 함수 export
export const useAuthStore = useAuth;
