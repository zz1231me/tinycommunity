// client/src/store/uiOverlays.ts
// 헤더 dropdown들과 모바일 사이드바의 open 상태를 통합 관리한다.
// 이전에는 각 컴포넌트가 독립된 useState로 관리하여
//   - 모바일에서 사이드바 열고 알림벨을 누르면 두 패널이 겹쳐서 떠 묘한 레이어
//   - 알림 패널이 열린 상태에서 사용자 메뉴 클릭 시 두 패널이 동시에 노출
// 같은 UX 문제가 있었다. 이 store가 한 번에 하나의 dropdown만 보이도록 보장한다.

import { create } from 'zustand';

export type OverlayKey =
  | 'sidebar' // 모바일 사이드바
  | 'notifications' // NotificationBell 패널
  | 'userMenu' // UserDropdown 패널
  | 'search' // GlobalSearch 모달
  | 'commandPalette'; // CommandPalette (⌘⇧P)

interface UIOverlaysState {
  // 한 번에 하나의 dropdown(notifications/userMenu/search/commandPalette)만 활성.
  // sidebar는 별도(독립) — 다른 dropdown과 공존 가능하지만 모바일에서 열릴 때 dropdown은 닫는다.
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
    // 사이드바가 열려있고 모바일이면 사이드바도 함께 닫는다 (시각 우선순위)
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
    // 사이드바를 열 때 다른 dropdown을 모두 닫는다 (레이어 충돌 방지)
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
