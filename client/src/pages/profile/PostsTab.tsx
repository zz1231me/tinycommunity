// client/src/pages/profile/PostsTab.tsx
// 마이페이지 · 내가 쓴 글.
//
// 목록·로딩·에러·페이지 상태를 직접 들지 않고 React Query 에 맡긴다.
// 탭을 오갈 때 캐시가 남아 매번 다시 부르지 않는다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Lock } from 'lucide-react';
import { getMyPosts } from '../../api/users';
import { profileKeys } from '../../api/queryKeys';
import { formatRelativeDate } from '../../utils/date';
import { EmptyState, LoadingRows, Pagination, RetryState, TabCard } from './parts';

interface MyPost {
  id: string;
  title: string;
  boardType: string;
  createdAt: string;
  isSecret?: boolean;
  commentCount?: number;
  viewCount?: number;
}

export function PostsTab() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: profileKeys.posts(page),
    queryFn: () => getMyPosts(page, 10),
    // 글은 다른 화면에서 쓰고 지운다. 전역 staleTime(5분)을 따르면 방금 쓴 글이
    // 이 목록에 없다.
    refetchOnMount: 'always',
    // 쪽을 넘길 때 이전 쪽 내용을 유지한다. 없으면 건수가 0건으로,
    // 쪽수가 1로 잠깐 떨어지면서 아래 페이지 막대가 사라졌다 다시 나타난다.
    placeholderData: prev => prev,
  });

  const posts = (data?.posts ?? []) as MyPost[];
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <TabCard title="내가 작성한 게시글" count={data?.pagination?.totalCount ?? 0}>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <RetryState onRetry={() => void refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} text="아직 작성한 게시글이 없습니다." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {posts.map(post => (
            <li
              key={post.id}
              onClick={() => navigate(`/dashboard/posts/${post.boardType}/${post.id}`)}
              className="cursor-pointer px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {post.isSecret && <Lock className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />}
                    {post.title}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{post.boardType}</span>
                    <span>댓글 {post.commentCount ?? 0}</span>
                    <span>조회 {post.viewCount ?? 0}</span>
                  </div>
                </div>
                <span className="flex-shrink-0 text-xs text-slate-400">
                  {formatRelativeDate(post.createdAt)}
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
