// client/src/components/Dashboard/UserDropdown.tsx
import { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, User, Settings, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { scaleIn } from '../../utils/animations';
import { Avatar } from '../Avatar';
import { useAuth } from '../../store/auth';
import { logout as logoutAPI } from '../../api/auth';
import { getRoleBadgeClass, getRoleName } from '../../utils/roleUtils';
import { ThemeToggle } from '../ThemeToggle';
import { useUIOverlays } from '../../store/uiOverlays';

export function UserDropdown() {
  const { getUserName, getUserRole, getUser, clearUser, isAdmin } = useAuth();
  const navigate = useNavigate();

  // 통합 overlay store — NotificationBell/GlobalSearch와 자동 배타.
  // setIsOpen은 안정 ref 유지 (getState로 호출 시점 최신값 사용)
  const isOpen = useUIOverlays(s => s.activeDropdown === 'userMenu');
  const setIsOpen = useCallback((value: boolean) => {
    const state = useUIOverlays.getState();
    if (value) state.openDropdown('userMenu');
    else state.closeDropdown('userMenu');
  }, []);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const userName = getUserName();
  const userRole = getUserRole();
  const currentUser = getUser();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  const handleLogout = async () => {
    try {
      await logoutAPI();
    } catch {
      /* ignore */
    } finally {
      clearUser();
      navigate('/');
    }
  };

  const handleProfileClick = () => {
    navigate('/profile');
    setIsOpen(false);
  };

  if (!userName || !userRole) return null;

  const user = {
    id: currentUser?.id || '',
    name: userName,
    avatar: currentUser?.avatar || null,
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 트리거 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1.5
                   text-slate-700 dark:text-slate-300
                   hover:bg-slate-100 dark:hover:bg-slate-800
                   rounded-lg transition-colors duration-150 active:scale-95"
        aria-label="사용자 메뉴"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Avatar user={user} size="sm" />
        <span className="hidden sm:block text-sm font-medium text-slate-700 dark:text-slate-200 max-w-24 truncate">
          {userName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 드롭다운 패널 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{ originX: 1, originY: 0 }}
            className="absolute right-0 top-full mt-2 w-60
                        bg-white dark:bg-slate-900
                        rounded-xl shadow-xl shadow-slate-200/60 dark:shadow-slate-950/60
                        border border-slate-200 dark:border-slate-800
                        overflow-hidden z-50"
          >
            {/* 사용자 정보 헤더 */}
            <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Avatar user={user} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {userName}
                  </p>
                  <span
                    className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${getRoleBadgeClass(userRole)}`}
                  >
                    {getRoleName(userRole)}
                  </span>
                </div>
              </div>
            </div>

            {/* 메뉴 */}
            <div className="p-1.5">
              <button
                onClick={handleProfileClick}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                         text-sm text-slate-600 dark:text-slate-400
                         hover:bg-slate-50 dark:hover:bg-slate-800
                         hover:text-slate-900 dark:hover:text-slate-200
                         transition-colors duration-150"
              >
                <User className="w-4 h-4 flex-shrink-0 text-slate-400" />
                <span>프로필 설정</span>
              </button>

              {isAdmin() && (
                <button
                  onClick={() => {
                    navigate('/admin');
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                           text-sm text-slate-600 dark:text-slate-400
                           hover:bg-slate-50 dark:hover:bg-slate-800
                           hover:text-slate-900 dark:hover:text-slate-200
                           transition-colors duration-150"
                >
                  <Settings className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <span>관리자 패널</span>
                </button>
              )}
            </div>

            {/* 테마 전환 */}
            <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">테마</p>
              <ThemeToggle />
            </div>

            {/* 로그아웃 */}
            <div className="p-1.5 pt-0 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  handleLogout();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                         text-sm text-red-600 dark:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-900/20
                         transition-colors duration-150 mt-1"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <span>로그아웃</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
