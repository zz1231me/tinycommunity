// 작성하다 만 글 목록. 서버에 저장되므로 다른 기기에서도 이어 쓸 수 있다.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileEdit, Trash2 } from 'lucide-react';
import { PageContainer } from '../components/common/PageContainer';
import { ListLoading, ListError, ListState } from '../components/common/ListState';
import { PageHeader } from '../components/common/PageHeader';
import { draftKeys } from '../api/queryKeys';
import { deleteDraft, fetchDrafts, type DraftSummary } from '../api/drafts';
import { getApiErrorMessage } from '../api/utils';
import { formatRelativeDate } from '../utils/date';
import { toast } from '../utils/toast';
import { useSiteSettings } from '../store/siteSettings';
import { useState } from 'react';
import { ConfirmationModal } from '../components/admin/common/ConfirmationModal';

function DraftRow({
  draft,
  stale,
  onDelete,
}: {
  draft: DraftSummary;
  stale: boolean;
  onDelete: (id: string) => void;
}) {
  // 게시판이 사라졌으면 이어쓰기 화면을 열 수 없어 내용만 보여 준다
  const orphaned = draft.boardName === null;

  return (
    <li className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
      <div className="min-w-0 flex-1">
        {orphaned ? (
          <div className="truncate text-sm font-medium text-slate-500 line-through dark:text-slate-400">
            {draft.title || '(제목 없음)'}
          </div>
        ) : (
          <Link
            to={`/dashboard/posts/${draft.boardType}/new?draft=${draft.id}`}
            className="block truncate text-sm font-medium text-slate-900 hover:text-primary-600 dark:text-slate-100 dark:hover:text-primary-400"
          >
            {draft.title || '(제목 없음)'}
          </Link>
        )}

        {draft.preview && (
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {draft.preview}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <span className="truncate">{draft.boardName ?? '삭제된 게시판'}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{formatRelativeDate(draft.updatedAt)} 저장</span>
          {stale && (
            // 서버는 초안을 지우지 않는다. 오래됐다는 표시만 하고 삭제는 사용자가 정한다.
            <span className="badge badge-warning shrink-0">오래됨</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(draft.id)}
        aria-label={`${draft.title || '제목 없는 초안'} 삭제`}
        className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

export default function Drafts() {
  const queryClient = useQueryClient();
  // 되돌릴 수 없는 삭제라 한 번 묻는다
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // 관리자가 정한 임시저장 만료 시간. 자동 삭제가 아니라 표시에만 쓴다.
  const expiryMinutes = useSiteSettings(s => s.settings.draftExpiryMinutes) ?? 60;

  const { data, isLoading, isError } = useQuery({
    queryKey: draftKeys.all,
    queryFn: ({ signal }) => fetchDrafts(signal),
    // 글쓰기 화면이 이 키를 무효화하지 않으므로 마운트마다 다시 읽는다.
    refetchOnMount: 'always',
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDraft(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all });
      toast.success('임시저장을 삭제했습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '삭제하지 못했습니다.')),
  });

  return (
    <PageContainer>
      <PageHeader
        title="임시저장"
        description="쓰다 만 글이 서버에 남아 있어 다른 기기에서도 이어 쓸 수 있습니다."
        icon={<FileEdit className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />

      <section className="card overflow-hidden">
        <div className="p-3">
          {isLoading ? (
            <ListLoading />
          ) : isError ? (
            <ListError what="임시저장 목록" />
          ) : (data?.length ?? 0) === 0 ? (
            <ListState size="roomy">
              쓰다 만 글이 없습니다.
              <br />
              글을 작성하는 동안 자동으로 여기에 저장됩니다.
            </ListState>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.map(draft => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  stale={Date.now() - new Date(draft.updatedAt).getTime() > expiryMinutes * 60_000}
                  onDelete={id => setPendingDelete(id)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <ConfirmationModal
        open={pendingDelete !== null}
        title="이 임시저장을 지울까요?"
        message="지우면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  );
}
