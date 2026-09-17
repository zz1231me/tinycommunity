// client/src/utils/roleUtils.ts - 역할 관련 공용 유틸리티

export type UserRole = 'admin' | 'manager' | 'user' | 'guest' | string;

/**
 * 역할에 따른 뱃지 CSS 클래스 반환
 */
export function getRoleBadgeClass(role: UserRole): string {
  switch (role) {
    case 'admin':
      // 빨강 — 최고 권한, 주의/강조
      return 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-800/40';
    case 'manager':
      // 인디고 — 중간 권한, 신뢰
      return 'bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/20 dark:text-primary-400 dark:ring-primary-800/40';
    case 'user':
      // 에메랄드 — 일반, 안전
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-800/40';
    case 'guest':
      // 슬레이트 — 제한됨
      return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:ring-slate-600/40';
    default:
      return 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:ring-slate-600/40';
  }
}

/**
 * 역할 한글 이름 반환
 */
export function getRoleName(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '관리자';
    case 'manager':
      return '매니저';
    case 'user':
      return '일반 사용자';
    case 'guest':
      return '게스트';
    default:
      return role;
  }
}
