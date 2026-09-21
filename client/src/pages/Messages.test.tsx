// client/src/pages/Messages.test.tsx
//
// 메시지함에서 두 가지를 고정한다.
//
// 1) 대화창은 전역 staleTime(5분)을 따르지 않는다. 캐시를 신선하다고 보면 요청이
//    나가지 않아 그동안 도착한 메시지가 보이지 않고 읽음 처리도 일어나지 않는다.
// 2) 목록·배지 무효화는 대화 응답이 온 뒤에 한다. 먼저 무효화하면 읽음 처리보다
//    응답이 빨라 낡은 안 읽은 수를 받는다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Messages from './Messages';
import type { ConversationPage, ConversationSummary } from '../api/messages';

const fetchConversations = vi.hoisted(() => vi.fn());
const fetchConversation = vi.hoisted(() => vi.fn());
vi.mock('../api/messages', async () => {
  const actual = await vi.importActual<typeof import('../api/messages')>('../api/messages');
  return {
    ...actual,
    fetchConversations,
    fetchConversation,
    sendMessage: vi.fn(),
    hideConversation: vi.fn(),
  };
});

vi.mock('../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// 목록 옆의 "새 대화" 는 사용자 검색까지 끌고 온다 — 여기서 볼 대상이 아니다.
vi.mock('../components/messages/NewConversationButton', () => ({
  NewConversationButton: () => null,
}));

// PageContainer 의 등장 애니메이션은 happy-dom 에서 언마운트할 때 취소되며
// 잡히지 않는 AbortError 를 남긴다. 여기서 볼 것과 무관하므로 평범한 div 로 바꾼다.
// 확인 대화상자(ConfirmationModal)가 AnimatePresence 도 쓴다 — 함께 대신해 둔다
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children?: unknown }) => children,
}));

const CONVERSATION_ID = 'CONV1';

const summary = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: CONVERSATION_ID,
  partner: { id: 'other', name: '상대', avatar: null, active: true },
  lastMessagePreview: '안녕하세요',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  lastFromMe: false,
  unreadCount: 1,
  ...over,
});

const page = (contents: string[]): ConversationPage => ({
  conversationId: CONVERSATION_ID,
  partner: { id: 'other', name: '상대', avatar: null, active: true },
  messages: contents.map((content, i) => ({
    id: i + 1,
    senderId: 'other',
    fromMe: false,
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
  })),
  nextCursor: null,
  hasMore: false,
});

/** 운영과 같은 기본값 — 전역 staleTime 5분(QueryProvider) */
function renderMessages() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/messages/${CONVERSATION_ID}`]}>
        <Routes>
          <Route path="/dashboard/messages/:id" element={<Messages />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, ...view };
}

describe('Messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchConversations.mockResolvedValue([summary()]);
  });

  it('대화를 다시 열면 캐시가 신선해도 새로 받아 온다 (그동안 온 메시지가 보여야 한다)', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(['처음 메시지']))
      .mockResolvedValueOnce(page(['처음 메시지', '나중에 온 메시지']));

    const first = renderMessages();
    expect(await screen.findByText('처음 메시지')).toBeInTheDocument();
    first.unmount();

    // 같은 QueryClient 가 아니어도 재현되지 않는다 — 캐시를 이어받아야 의미가 있다.
    render(
      <QueryClientProvider client={first.queryClient}>
        <MemoryRouter initialEntries={[`/dashboard/messages/${CONVERSATION_ID}`]}>
          <Routes>
            <Route path="/dashboard/messages/:id" element={<Messages />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // staleTime 5분을 그대로 따르면 여기서 요청이 나가지 않아 새 메시지가 영영 안 보인다.
    expect(await screen.findByText('나중에 온 메시지')).toBeInTheDocument();
    expect(fetchConversation).toHaveBeenCalledTimes(2);
  });

  it('목록·배지 무효화는 대화 응답이 온 뒤에 일어난다', async () => {
    const order: string[] = [];
    fetchConversations.mockImplementation(() => {
      order.push('목록');
      return Promise.resolve([summary()]);
    });

    let resolveConversation: (p: ConversationPage) => void = () => {};
    fetchConversation.mockImplementation(
      () =>
        new Promise<ConversationPage>(resolve => {
          resolveConversation = p => {
            order.push('대화(읽음처리)');
            resolve(p);
          };
        })
    );

    renderMessages();

    // 목록은 화면이 뜨면서 한 번 받는다. 대화가 아직 안 끝났으므로 다시 받으면 안 된다.
    await waitFor(() => expect(order).toContain('목록'));
    expect(order.filter(o => o === '목록')).toHaveLength(1);

    resolveConversation(page(['처음 메시지']));
    await screen.findByText('처음 메시지');

    // 읽음 처리가 끝난 뒤에야 목록을 다시 받는다.
    await waitFor(() => expect(order.filter(o => o === '목록')).toHaveLength(2));
    expect(order).toEqual(['목록', '대화(읽음처리)', '목록']);
  });
});
