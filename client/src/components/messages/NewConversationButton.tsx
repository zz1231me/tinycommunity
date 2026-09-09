// client/src/components/messages/NewConversationButton.tsx
// 메시지함에서 새 대화 시작하기.
//
// 상대의 프로필을 거치지 않고 메시지함에서 바로 받는 사람을 찾아 첫 통을 보낸다.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { searchUsers, type UserSuggestion } from '../../api/users';
import { sendMessage } from '../../api/messages';
import { messageKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { toast } from '../../utils/toast';
import { ComposeDialog } from './ComposeDialog';
import { ModalShell } from '../common/ModalShell';
import { ListState } from '../common/ListState';

export function NewConversationButton() {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [recipient, setRecipient] = useState<UserSuggestion | null>(null);
  const [draft, setDraft] = useState('');

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const debounced = useDebouncedValue(query, 200);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['messages', 'recipient-search', debounced],
    queryFn: ({ signal }) => searchUsers(debounced, signal),
    enabled: picking,
  });

  const send = useMutation({
    mutationFn: () => sendMessage(recipient!.id, draft.trim()),
    onSuccess: sent => {
      close();
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
      toast.success('메시지를 보냈습니다.');
      navigate(`/dashboard/messages/${sent.conversationId}`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '메시지를 보내지 못했습니다.')),
  });

  const close = () => {
    setPicking(false);
    setRecipient(null);
    setQuery('');
    setDraft('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />새 대화
      </button>

      {/* 받는 사람 고르기 */}
      {picking && !recipient && (
        <ModalShell label="받는 사람 고르기" onClose={close} align="top">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="아이디나 이름으로 검색"
              aria-label="받는 사람 검색"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <ul className="max-h-72 overflow-y-auto" role="listbox" aria-label="검색 결과">
            {results.length === 0 ? (
              <li>
                <ListState>{isFetching ? '찾는 중…' : '검색 결과가 없습니다.'}</ListState>
              </li>
            ) : (
              results.map(user => (
                <li key={user.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => setRecipient(user)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {user.name}
                    </span>
                    <span className="truncate text-xs text-slate-400">@{user.id}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </ModalShell>
      )}

      {/* 내용 쓰기 */}
      {recipient && (
        <ComposeDialog
          recipientName={recipient.name}
          value={draft}
          onChange={setDraft}
          onSubmit={() => send.mutate()}
          onClose={close}
          submitting={send.isPending}
        />
      )}
    </>
  );
}
