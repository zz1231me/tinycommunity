// client/src/api/social.ts
// 구독·팔로우, 알림 설정, 다른 사람 프로필.

import api from './axios';
import { unwrap } from './utils';

export type SubscriptionTarget = 'board' | 'user';

export interface SubscriptionItem {
  targetType: SubscriptionTarget;
  targetId: string;
  name: string;
  avatar: string | null;
  createdAt: string;
}

export interface NotificationKindSetting {
  key: string;
  label: string;
  description: string;
  /** false 면 사용자가 끌 수 없는 종류 (운영 공지) */
  configurable: boolean;
  enabled: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string | null;
  roleName: string | null;
  joinedAt: string;
  isSelf: boolean;
  isFollowing: boolean;
  followers: number;
  following: number;
  postCount: number;
  commentCount: number;
  recentPosts: Array<{
    id: string;
    title: string;
    boardType: string;
    boardName: string;
    viewCount: number;
    createdAt: string;
  }>;
}

export async function fetchSubscriptions(signal?: AbortSignal): Promise<SubscriptionItem[]> {
  const res = await api.get('/social/subscriptions', { signal });
  return unwrap(res);
}

export async function fetchSubscriptionStatus(
  targetType: SubscriptionTarget,
  targetId: string
): Promise<boolean> {
  // === true 로 좁힌다. 답에 subscribed 가 없으면 undefined 가 돌아가는데, React Query 는
  // undefined 를 '실패' 로 보아 구독 상태 조회가 오류 상태로 굳는다(경고도 남는다).
  const res = await api.get(`/social/subscriptions/${targetType}/${targetId}`);
  return unwrap<{ subscribed?: boolean }>(res).subscribed === true;
}

export async function toggleSubscription(
  targetType: SubscriptionTarget,
  targetId: string
): Promise<boolean> {
  const res = await api.post(`/social/subscriptions/${targetType}/${targetId}`);
  return unwrap<{ subscribed?: boolean }>(res).subscribed === true;
}

export async function fetchNotificationSettings(
  signal?: AbortSignal
): Promise<NotificationKindSetting[]> {
  const res = await api.get('/social/notification-settings', { signal });
  return unwrap<{ kinds: NotificationKindSetting[] }>(res).kinds;
}

export async function saveNotificationSettings(
  changes: Record<string, boolean>
): Promise<Record<string, boolean>> {
  const res = await api.put('/social/notification-settings', changes);
  return unwrap(res);
}

export async function fetchUserProfile(id: string, signal?: AbortSignal): Promise<UserProfile> {
  const res = await api.get(`/users/${id}/profile`, { signal });
  return unwrap(res);
}
