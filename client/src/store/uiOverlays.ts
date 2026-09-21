// 헤더 dropdown과 모바일 사이드바의 open 상태. 한 번에 하나만 열리도록 한 곳에서 관리한다.

import { create } from 'zustand';

export type OverlayKey =
  | 'sidebar' // 모바일 사이드바
  | 'notifications' // NotificationBell 패널
  | 'userMenu' // UserDropdown 패널
  | 'search' // GlobalSearch 모달
  | 'recentPosts' // RecentPostsMenu 패널
  | 'commandPalette'; // CommandPalette (⌘⇧P)

interface UIOverlaysState {
  // dropdown은 한 번에 하나만 활성. sidebar는 독립이지만 모바일에서 열릴 때 dropdown을 닫는다.
  activeDropdown: OverlayKey | null;
  sidebarOpen: boolean;

  openDropdown: (key: Exclude<OverlayKey, 'sidebar'>) => void;
  closeDropdown: (key?: Exclude<OverlayKey, 'sidebar'>) => void;
  toggleDropdown: (key: Exclude<OverlayKey, 'sidebar'>) => void;
  isDropdownOpen: (key: Exclude<OverlayKey, 'sidebar'>) => boolean;

  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;

  closeAll: () => void;
}

export const useUIOverlays = create<UIOverlaysState>((set, get) => ({
  activeDropdown: null,
  sidebarOpen: false,

  openDropdown: key => {
    set({ activeDropdown: key, sidebarOpen: false });
  },
  closeDropdown: key => {
    set(state => {
      if (key === undefined || state.activeDropdown === key) {
        return { activeDropdown: null };
      }
      return state;
    });
  },
  toggleDropdown: key => {
    set(state => {
      if (state.activeDropdown === key) return { activeDropdown: null };
      return { activeDropdown: key, sidebarOpen: false };
    });
  },
  isDropdownOpen: key => get().activeDropdown === key,

  openSidebar: () => {
    set({ sidebarOpen: true, activeDropdown: null });
  },
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => {
    set(state => {
      const willOpen = !state.sidebarOpen;
      return {
        sidebarOpen: willOpen,
        activeDropdown: willOpen ? null : state.activeDropdown,
      };
    });
  },

  closeAll: () => set({ activeDropdown: null, sidebarOpen: false }),
}));
