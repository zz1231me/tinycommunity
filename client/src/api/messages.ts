// client/src/api/messages.ts
// 1:1 메시지.

import api from './axios';
import { unwrap } from './utils';

/** 메시지 한 통의 최대 길이 — 서버 message.service 와 같은 값 */
export const MESSAGE_MAX_LENGTH = 2000;

export interface ConversationPartner {
  id: string;
  name: string;
  avatar: string | null;
  /** 탈퇴·비활성 사용자면 false — 대화는 남지만 답장은 할 수 없다 */
  active: boolean;
}

export interface ConversationSummary {
  id: string;
  partner: ConversationPartner;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastFromMe: boolean;
  unreadCount: number;
}

export interface ChatMessage {
  id: number;
  senderId: string;
  fromMe: boolean;
  content: string;
  createdAt: string;
}

export interface ConversationPage {
  conversationId: string;
  partner: ConversationPartner;
  messages: ChatMessage[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface SentMessage {
  conversationId: string;
  message: ChatMessage;
  recipient: { id: string; name: string; avatar: string | null };
}

export async function fetchConversations(signal?: AbortSignal): Promise<ConversationSummary[]> {
  const res = await api.get('/messages/conversations', { signal });
  return unwrap(res);
}

export async function fetchConversation(
  id: string,
  cursor?: number,
  signal?: AbortSignal
): Promise<ConversationPage> {
  const query = cursor !== undefined ? `?cursor=${cursor}` : '';
  const res = await api.get(`/messages/conversations/${id}${query}`, { signal });
  return unwrap(res);
}

export async function sendMessage(recipientId: string, content: string): Promise<SentMessage> {
  const res = await api.post('/messages', { recipientId, content });
  return unwrap(res);
}

export async function hideConversation(id: string): Promise<void> {
  await api.delete(`/messages/conversations/${id}`);
}

export async function fetchUnreadMessageCount(signal?: AbortSignal): Promise<number> {
  const res = await api.get('/messages/unread-count', { signal });
  return unwrap<{ count: number }>(res).count;
}
