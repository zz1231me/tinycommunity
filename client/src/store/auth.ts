import { create } from 'zustand';
import { safeStorage } from '../utils/safeStorage';

export interface User {
  id: string;
  name: string;
  role: string;
  theme?: string;
  avatar?: string | null;
  createdAt: string;
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
  updateUser: (updates: Partial<User>) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;

  updateTokenInfo: (tokenInfo: TokenInfo) => void;
  isAccessTokenExpired: () => boolean;
  isRefreshTokenExpired: () => boolean;
  isTokenExpiringSoon: (minutesBefore?: number) => boolean;

  getUserId: () => string | null;
  getUserName: () => string | null;
  getUserRole: () => string | null;
  getUser: () => User | null;
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

    // 다른 탭이 '사람이 바뀌었다' 를 알아채는 표식
    safeStorage.set('authUserId', user.id);

    if (tokenInfo) {
      safeStorage.set('tokenInfo', JSON.stringify(tokenInfo));
      if (import.meta.env.DEV)
        console.info('토큰 정보 저장:', new Date(tokenInfo.accessTokenExpiry));
    }
  },

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

    safeStorage.remove('tokenInfo');
    safeStorage.remove('authUserId');
  },

  setLoading: isLoading => set({ isLoading }),

  updateTokenInfo: tokenInfo => {
    set({ tokenInfo });
    safeStorage.set('tokenInfo', JSON.stringify(tokenInfo));
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

  getUser: () => {
    const { user } = get();
    return user;
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role === 'admin' && user?.roleInfo?.isActive !== false;
  },

  canAccessBoard: (boardId: string, action: 'read' | 'write' | 'delete') => {
    const { user } = get();
    if (!user?.permissions) return false;

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

export const useAuthStore = useAuth;
