// 마이페이지의 내가 쓴 글 목록.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: profileKeys.posts(page),
    queryFn: () => getMyPosts(page, 10),
    // 전역 staleTime(5분)을 따르면 방금 쓴 글이 목록에 없다.
    refetchOnMount: 'always',
    // 쪽을 넘길 때 이전 내용을 유지한다. 없으면 페이지 막대가 잠깐 사라진다.
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
            <li key={post.id}>
              {/* 키보드 접근과 새 탭 열기를 위해 클릭 핸들러가 아니라 링크를 쓴다. */}
              <Link
                to={`/dashboard/posts/${post.boardType}/${post.id}`}
                className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
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
              </Link>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
    </TabCard>
  );
}
