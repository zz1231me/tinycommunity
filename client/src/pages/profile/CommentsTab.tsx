// client/src/pages/profile/CommentsTab.tsx
// 마이페이지 · 내가 쓴 댓글. PostsTab 과 같은 구조다(같은 형태의 상태 7개를 쓰던 자리).

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { getMyComments } from '../../api/users';
import { profileKeys } from '../../api/queryKeys';
import { formatRelativeDate } from '../../utils/date';
import { EmptyState, LoadingRows, Pagination, RetryState, TabCard } from './parts';

interface MyComment {
  id: string;
  content: string;
  createdAt: string;
  PostId?: string;
  postTitle?: string;
  boardType?: string;
}

/** 본문의 HTML 을 걷어내 한 줄 미리보기로 만든다 */
function preview(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function CommentsTab() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: profileKeys.comments(page),
    queryFn: () => getMyComments(page, 10),
    // 댓글은 글 상세에서 달고 지운다. 전역 staleTime(5분)을 따르면 방금 단 댓글이
    // 이 목록에 없다.
    refetchOnMount: 'always',
    // 쪽을 넘길 때 이전 쪽 내용을 유지한다. 없으면 건수가 0건으로,
    // 쪽수가 1로 잠깐 떨어지면서 아래 페이지 막대가 사라졌다 다시 나타난다.
    placeholderData: prev => prev,
  });

  const comments = (data?.comments ?? []) as MyComment[];
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <TabCard title="내가 작성한 댓글" count={data?.pagination?.totalCount ?? 0}>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <RetryState onRetry={() => void refetch()} />
      ) : comments.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          text="아직 작성한 댓글이 없습니다."
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {comments.map(comment => (
            <li
              key={comment.id}
              onClick={() =>
                comment.PostId &&
                comment.boardType &&
                navigate(`/dashboard/posts/${comment.boardType}/${comment.PostId}`)
              }
              className="cursor-pointer px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 truncate text-xs font-medium text-primary-600 dark:text-primary-400">
                    {comment.postTitle ?? '게시글'}
                  </p>
                  <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
                    {preview(comment.content)}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs text-slate-400">
                  {formatRelativeDate(comment.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
    </TabCard>
  );
}
