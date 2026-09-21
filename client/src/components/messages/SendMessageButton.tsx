import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { sendMessage } from '../../api/messages';
import { messageKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import { useFeature } from '../../store/features';
import { toast } from '../../utils/toast';
import { ComposeDialog } from './ComposeDialog';
import { useSubmitLock } from '../../hooks/useSubmitLock';

interface Props {
  recipientId: string;
  recipientName: string;
}

export function SendMessageButton({ recipientId, recipientName }: Props) {
  const enabled = useFeature('social.dm');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const runOnce = useSubmitLock();

  const send = useMutation({
    mutationFn: () => sendMessage(recipientId, draft.trim()),
    onSuccess: sent => {
      setOpen(false);
      setDraft('');
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
      toast.success('메시지를 보냈습니다.');
      navigate(`/dashboard/messages/${sent.conversationId}`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '메시지를 보내지 못했습니다.')),
  });

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${recipientName}님에게 메시지 보내기`}
        className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
      >
        <Send className="h-3.5 w-3.5" />
        메시지
      </button>

      {open && (
        <ComposeDialog
          recipientName={recipientName}
          value={draft}
          onChange={setDraft}
          onSubmit={() => runOnce(() => send.mutateAsync().catch(() => {}))}
          onClose={() => setOpen(false)}
          submitting={send.isPending}
        />
      )}
    </>
  );
}
