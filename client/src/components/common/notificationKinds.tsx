// 알림 종류별 모양. 벨 목록과 새 알림 팝업이 함께 쓴다.

import type { ReactNode } from 'react';
import {
  AtSign,
  Bell,
  BellRing,
  Heart,
  Mail,
  MessageSquare,
  Shield,
  Swords,
  UserCheck,
} from 'lucide-react';
import type { Notification } from '../../api/notifications';

export interface NotificationKind {
  icon: ReactNode;
  /** 아이콘 바탕 */
  bg: string;
  /** 아이콘 색 */
  color: string;
  /** 팝업 왼쪽 띠·남은 시간 막대 색 */
  accent: string;
  /** 팝업 제목 */
  title: string;
}

export const NOTIFICATION_KIND: Record<Notification['type'], NotificationKind> = {
  COMMENT: {
    icon: <MessageSquare className="w-4 h-4" />,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    color: 'text-blue-600 dark:text-blue-400',
    accent: 'bg-blue-500',
    title: '새 댓글',
  },
  LIKE: {
    icon: <Heart className="w-4 h-4" />,
    bg: 'bg-red-100 dark:bg-red-900/30',
    color: 'text-red-500 dark:text-red-400',
    accent: 'bg-red-500',
    title: '좋아요',
  },
  MENTION: {
    icon: <AtSign className="w-4 h-4" />,
    bg: 'bg-secondary-100 dark:bg-secondary-900/30',
    color: 'text-secondary-600 dark:text-secondary-400',
    accent: 'bg-secondary-500',
    title: '나를 언급했어요',
  },
  SUBSCRIPTION: {
    icon: <BellRing className="w-4 h-4" />,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    color: 'text-emerald-600 dark:text-emerald-400',
    accent: 'bg-emerald-500',
    title: '구독한 곳의 새 글',
  },
  ASSIGNMENT: {
    icon: <UserCheck className="w-4 h-4" />,
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    color: 'text-cyan-600 dark:text-cyan-400',
    accent: 'bg-cyan-500',
    title: '담당자로 지정됐어요',
  },
  MESSAGE: {
    icon: <Mail className="w-4 h-4" />,
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    color: 'text-sky-600 dark:text-sky-400',
    accent: 'bg-sky-500',
    title: '새 메시지',
  },
  DUEL: {
    icon: <Swords className="w-4 h-4" />,
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    color: 'text-violet-600 dark:text-violet-400',
    accent: 'bg-violet-500',
    title: '포인트 대결',
  },
  ATTACK: {
    icon: <Shield className="w-4 h-4" />,
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    color: 'text-rose-600 dark:text-rose-400',
    accent: 'bg-rose-500',
    title: '퇴근 공격!',
  },
  SYSTEM: {
    icon: <Bell className="w-4 h-4" />,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    color: 'text-amber-600 dark:text-amber-400',
    accent: 'bg-amber-500',
    title: '공지',
  },
};

/** 모르는 종류는 공지 모양으로 그린다. */
export function kindOf(type: string): NotificationKind {
  return NOTIFICATION_KIND[type as Notification['type']] ?? NOTIFICATION_KIND.SYSTEM;
}
