// client/src/components/discovery/DiscoveryPostRow.tsx
// 탐색·스크랩 목록의 글 한 줄. 게시판을 가로지르는 목록이라
// 게시판 이름을 함께 보여주지 않으면 어디 글인지 알 수 없다.

import { Link } from 'react-router-dom';
import { Eye, Heart, MessageCircle } from 'lucide-react';
import { formatRelativeDate } from '../../utils/date';

interface Props {
  post: {
    id: string;
    title: string;
    boardType: string;
    boardName: string;
    author: string;
    viewCount: number;
    likeCount?: number;
    commentCount: number;
    createdAt: string;
  };
  /** 순위 목록에서만 쓰는 번호 */
  rank?: number;
}

export function DiscoveryPostRow({ post, rank }: Props) {
  return (
    <li>
      <Link
        to={`/dashboard/posts/${post.boardType}/${post.id}`}
        className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        {rank !== undefined && (
          <span
            className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
              rank <= 3 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'
            }`}
          >
            {rank}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {post.title}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {/* 게시판 이름이 길어도 작성자를 먹지 않게 폭을 제한한다 */}
            <span className="max-w-32 truncate">{post.boardName}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{post.author}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{formatRelativeDate(post.createdAt)}</span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-3 text-xs text-slate-500 dark:text-slate-400 sm:flex">
          {post.likeCount !== undefined && (
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">좋아요</span>
              {post.likeCount}
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">댓글</span>
            {post.commentCount}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">조회</span>
            {post.viewCount}
          </span>
        </div>
      </Link>
    </li>
  );
}
