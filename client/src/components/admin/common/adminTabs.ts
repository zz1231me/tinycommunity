// 관리자 메뉴의 뼈대. 화면이 아니라 자료라 따로 둔다(컴포넌트 파일에서 내보내면
// fast refresh 가 깨진다). 머리글도 여기 적힌 이름을 그대로 쓴다.

import {
  Bomb,
  Bookmark,
  Bug,
  Calendar,
  ClipboardList,
  Clock,
  Code,
  FileText,
  Files,
  Flag,
  Globe,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Palette,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tag,
  ToggleLeft,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { TabType } from '../../../types/admin.types';

export interface TabItem {
  id: TabType;
  label: string;
  icon: LucideIcon;
}
export interface TabGroup {
  label: string;
  tabs: TabItem[];
}

export const GROUPS: TabGroup[] = [
  {
    label: '개요',
    tabs: [{ id: 'dashboard', label: '통계', icon: LayoutDashboard }],
  },
  {
    label: '사용자 · 권한',
    tabs: [
      { id: 'users', label: '사용자', icon: Users },
      { id: 'roles', label: '역할', icon: ShieldCheck },
      { id: 'permissions', label: '권한', icon: KeyRound },
      { id: 'password-reset-requests', label: '초기화 요청', icon: Inbox },
    ],
  },
  {
    label: '게시판 · 콘텐츠',
    tabs: [
      { id: 'boards', label: '게시판', icon: LayoutGrid },
      { id: 'board-managers', label: '게시판 담당자', icon: UserCog },
      { id: 'tags', label: '태그', icon: Tag },
      { id: 'files', label: '파일', icon: Files },
      { id: 'custom-pages', label: '커스텀 페이지', icon: Code },
      { id: 'post-templates', label: '글 템플릿', icon: FileText },
    ],
  },
  {
    label: '활동',
    tabs: [
      { id: 'announcements', label: '공지사항', icon: Megaphone },
      { id: 'events', label: '이벤트', icon: Calendar },
      { id: 'bookmarks', label: '북마크', icon: Bookmark },
      { id: 'reports', label: '신고', icon: Flag },
      { id: 'attendance', label: '출퇴근', icon: Clock },
    ],
  },
  {
    label: '보안 · 로그',
    tabs: [
      { id: 'security-logs', label: '보안 로그', icon: ShieldAlert },
      { id: 'error-logs', label: '에러 로그', icon: Bug },
      { id: 'login-history', label: '로그인 이력', icon: History },
      { id: 'audit-logs', label: '감사 로그', icon: ClipboardList },
      { id: 'point-attacks', label: '포인트 공격', icon: Bomb },
      { id: 'ip-management', label: 'IP 관리', icon: Globe },
    ],
  },
  {
    label: '시스템',
    tabs: [
      { id: 'site-settings', label: '사이트 설정', icon: Settings },
      { id: 'features', label: '기능 설정', icon: ToggleLeft },
      { id: 'appearance', label: '테마', icon: Palette },
    ],
  },
];

/**
 * 지금 보고 있는 관리자 화면의 이름. 머리글이 쓴다.
 *
 * 머리글이 스물다섯 화면에서 모두 '관리자 페이지' 였다. 어디에 있는지 제목으로는 알 수
 * 없었고, 화면마다 제 이름을 다는 사용자 쪽과도 어긋났다. 메뉴에 적힌 이름을 그대로
 * 쓴다 — 두 이름으로 부르면 같은 곳을 다른 곳으로 읽는다(constants/menus.ts 의 규칙).
 */
export function adminTabTitle(pathname: string): { group: string; label: string } | null {
  const slug = pathname.split('/').filter(Boolean).pop();
  for (const group of GROUPS) {
    const tab = group.tabs.find(t => t.id === slug);
    if (tab) return { group: group.label, label: tab.label };
  }
  return null;
}
