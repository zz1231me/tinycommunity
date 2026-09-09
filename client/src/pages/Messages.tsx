// client/src/pages/Messages.tsx
// 메시지함 — 왼쪽 대화 목록, 오른쪽 선택한 대화.
//
// 좁은 화면에서는 두 칸을 나란히 둘 수 없어, 대화를 고르면 목록을 감춘다.
// 별도 화면으로 나누지 않은 이유: 목록과 대화가 같은 데이터(안 읽은 수, 마지막
// 메시지)를 공유해서, 화면을 나누면 한쪽에서 읽은 뒤 다른 쪽이 낡은 값을 보인다.

import { useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessagesSquare, Send, Trash2 } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ListError, ListLoading, ListState } from '../components/common/ListState';
import { PageContainer } from '../components/common/PageContainer';
import { PageHeader } from '../components/common/PageHeader';
import { MessageBody } from '../components/messages/MessageBody';
import { NewConversationButton } from '../components/messages/NewConversationButton';
import { messageKeys } from '../api/queryKeys';
import { getApiErrorMessage } from '../api/utils';
import {
  fetchConversation,
  fetchConversations,
  hideConversation,
  sendMessage,
  MESSAGE_MAX_LENGTH,
  type ChatMessage,
  type ConversationPage,
  type ConversationSummary,
} from '../api/messages';
import { formatFullDateTime, formatRelativeDate } from '../utils/date';
import { toast } from '../utils/toast';

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${
          selected
            ? 'bg-primary-50 dark:bg-primary-900/20'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <Avatar
          user={{
            id: conversation.partner.id,
            name: conversation.partner.name,
            avatar: conversation.partner.avatar,
          }}
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {conversation.partner.name}
            </span>
            {conversation.unreadCount > 0 && (
              <span className="ml-auto flex-shrink-0 rounded-full bg-primary-600 px-1.5 py-0.5 text-2xs font-bold text-white">
                {conversation.unreadCount}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {conversation.lastFromMe && '나: '}
            {conversation.lastMessagePreview ?? '(내용 없음)'}
          </p>
          {conversation.lastMessageAt && (
            <p className="mt-0.5 text-2xs text-slate-400">
              {formatRelativeDate(conversation.lastMessageAt)}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

function Chat({ conversationId, onClosed }: { conversationId: string; onClosed: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // 서버는 커서로 이전 메시지를 더 주는데 화면에는 그것을 불러올 방법이 없었다.
  // useInfiniteQuery 로 "이전 대화 불러오기" 를 실제로 눌리게 만든다.
  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: messageKeys.conversation(conversationId),
      queryFn: ({ pageParam, signal }) =>
        fetchConversation(conversationId, pageParam as number | undefined, signal),
      initialPageParam: undefined as number | undefined,
      getNextPageParam: last => last.nextCursor ?? undefined,
      // 전역 기본값(5분)을 대화창에는 쓸 수 없다. 캐시를 그대로 쓰면 요청이 나가지 않아
      // 그동안 도착한 메시지가 보이지 않고 서버의 읽음 처리도 일어나지 않는다.
      staleTime: 0,
      refetchOnMount: 'always',
    });

  // 첫 페이지가 최신 묶음이고 뒤로 갈수록 오래된 묶음이다.
  // 화면은 위에서 아래로 시간순이라 페이지를 뒤집어 이어 붙인다.
  const partner = data?.pages[0]?.partner;
  const messages: ChatMessage[] = data
    ? [...data.pages].reverse().flatMap(page => page.messages)
    : [];
  const newestId = data?.pages[0]?.messages.at(-1)?.id ?? null;

  // 대화를 열면 서버가 읽음 처리하므로 목록·배지를 다시 받는다. 단 그 응답이 온 뒤에
  // 물어본다. 마운트 시점에 무효화하면 읽음 처리(UPDATE 가 붙어 가장 늦게 끝난다)보다
  // 목록·배지 응답이 먼저 도착해 낡은 수를 받는다.
  //
  // 한 번만 맞춘다. 매번 걸면 이전 대화를 불러올 때마다 목록·배지까지 다시 받는다.
  // Chat 은 conversationId 를 key 로 다시 마운트되므로 대화를 바꾸면 ref 도 초기화된다.
  const readSyncedRef = useRef(false);
  useEffect(() => {
    if (isFetching || !data || readSyncedRef.current) return;
    readSyncedRef.current = true;
    queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
    queryClient.invalidateQueries({ queryKey: messageKeys.unread });
  }, [isFetching, data, queryClient]);

  // 새 메시지가 왔을 때만 끝으로 내린다.
  // 전체 길이에 걸면 "이전 대화 불러오기" 로 위쪽이 늘어날 때도 아래로 튀어,
  // 방금 읽으려던 옛 메시지를 놓치게 된다.
  useEffect(() => {
    if (newestId === null) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [newestId]);

  const send = useMutation({
    mutationFn: (content: string) => sendMessage(partner!.id, content),
    onSuccess: sent => {
      setDraft('');
      // 통째로 무효화하면 지금까지 불러온 페이지를 전부 다시 받는다 —
      // 옛 대화를 다섯 페이지 펼쳐 둔 상태에서 한 통 보내면 다섯 번을 왕복한다.
      // 서버가 방금 보낸 메시지를 목록과 같은 모양으로 돌려주므로 첫 페이지에 이어 붙인다.
      queryClient.setQueryData<InfiniteData<ConversationPage>>(
        messageKeys.conversation(conversationId),
        old => {
          if (!old) return old;
          const [newest, ...rest] = old.pages;
          return {
            ...old,
            pages: [{ ...newest, messages: [...newest.messages, sent.message] }, ...rest],
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
    },
    onError: err => toast.error(getApiErrorMessage(err, '메시지를 보내지 못했습니다.')),
  });

  const hide = useMutation({
    mutationFn: () => hideConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
      toast.success('대화를 목록에서 지웠습니다. 상대에게는 그대로 남습니다.');
      onClosed();
    },
    onError: err => toast.error(getApiErrorMessage(err, '대화를 지우지 못했습니다.')),
  });

  if (isLoading) {
    return <ListLoading />;
  }
  if (isError || !data || !partner) {
    return <ListError what="대화" />;
  }

  const tooLong = draft.length > MESSAGE_MAX_LENGTH;
  const canSend = draft.trim().length > 0 && !tooLong && !send.isPending && partner.active;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <button
          type="button"
          onClick={onClosed}
          aria-label="대화 목록으로"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar user={{ id: partner.id, name: partner.name, avatar: partner.avatar }} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {partner.name}
        </span>
        <button
          type="button"
          onClick={() => hide.mutate()}
          disabled={hide.isPending}
          aria-label="대화 지우기"
          title="내 목록에서만 지웁니다"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {hasNextPage && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="btn-secondary px-3 py-1 text-xs"
            >
              {isFetchingNextPage ? '불러오는 중…' : '이전 대화 불러오기'}
            </button>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                m.fromMe
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              <MessageBody content={m.content} />
              <div
                className={`mt-1 text-2xs ${m.fromMe ? 'text-white/70' : 'text-slate-400'}`}
                title={formatFullDateTime(m.createdAt)}
              >
                {formatRelativeDate(m.createdAt)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-700">
        {!partner.active ? (
          <ListState>더 이상 활동하지 않는 사용자입니다. 답장을 보낼 수 없습니다.</ListState>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (canSend) send.mutate(draft.trim());
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                // Enter 로 보내고 Shift+Enter 로 줄바꿈 — 대화창의 관례
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) send.mutate(draft.trim());
                }
              }}
              rows={2}
              placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
              aria-label="메시지 내용"
              className="min-h-0 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="메시지 보내기"
              className="btn-primary flex-shrink-0 px-3 py-2 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
        {tooLong && (
          <p className="mt-1 text-xs text-red-500">
            {MESSAGE_MAX_LENGTH.toLocaleString()}자를 넘을 수 없습니다 (
            {draft.length.toLocaleString()}자).
          </p>
        )}
      </div>
    </div>
  );
}

export default function Messages() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: messageKeys.conversations,
    queryFn: ({ signal }) => fetchConversations(signal),
    // 헤더 배지는 60초마다 다시 센다. 목록만 전역 기본값(5분)을 따르면 배지에는
    // 안 읽은 수가 떠 있는데 목록에는 그 대화가 보이지 않는다.
    staleTime: 0,
  });

  const selectedId = routeId ?? null;

  return (
    <PageContainer>
      <PageHeader
        title="다이렉트 메시지"
        description="회원끼리 1:1로 주고받습니다."
        icon={<MessagesSquare className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />

      <div className="card grid min-h-[32rem] grid-cols-1 overflow-hidden lg:grid-cols-[20rem_1fr]">
        {/* 좁은 화면에서는 대화를 고르면 목록을 감춘다 */}
        <aside
          className={`flex min-h-0 flex-col border-slate-200 dark:border-slate-700 lg:border-r ${
            selectedId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">대화</span>
            <NewConversationButton />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <ListLoading />
            ) : isError ? (
              <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                대화 목록을 불러오지 못했습니다.
              </p>
            ) : (data?.length ?? 0) === 0 ? (
              <ListState size="roomy">
                주고받은 메시지가 없습니다.
                <br />
                위의 &quot;새 대화&quot; 로 시작해 보세요.
              </ListState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.map(c => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    selected={c.id === selectedId}
                    onSelect={() => navigate(`/dashboard/messages/${c.id}`)}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className={`min-h-0 ${selectedId ? 'block' : 'hidden lg:block'}`}>
          {selectedId ? (
            <Chat
              key={selectedId}
              conversationId={selectedId}
              onClosed={() => navigate('/dashboard/messages')}
            />
          ) : (
            <p className="flex h-full items-center justify-center p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              왼쪽에서 대화를 고르세요.
            </p>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
