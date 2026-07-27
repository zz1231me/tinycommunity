import React from 'react';
import { Avatar } from '../Avatar';
import { PinIcon, LockIcon, EyeIcon, HeartIcon, ChatIcon } from '../common/Icons';
import { Post } from '../../types/board.types';

const isSafeColor = (color: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(color) ||
  /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color) ||
  /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/.test(color);

interface PostListItemProps {
  post: Post;
  index: number;
  onPostClick: (postId: string) => void;
  formatDate: (dateString: string) => string;
}

export const PostListItem: React.FC<PostListItemProps> = ({
  post,
  index: _index,
  onPostClick,
  formatDate,
}) => {
  const isNewPost = () => {
    const diffInDays = Math.floor(
      (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffInDays < 3;
  };

  return (
    <div
      onClick={() => onPostClick(post.id)}
      className={`
        px-4 sm:px-6 py-4 sm:py-5 cursor-pointer transition-all duration-150 group
        border-l-4 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0
        ${
          post.isPinned
            ? 'bg-amber-50/70 dark:bg-amber-900/10 border-l-amber-400 dark:border-l-amber-500'
            : 'bg-white dark:bg-slate-800 border-l-transparent'
        }
        hover:bg-primary-50/60 dark:hover:bg-primary-900/10
        hover:border-l-primary-500 dark:hover:border-l-primary-400
      `}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPostClick(post.id);
        }
      }}
      aria-label={`${post.title} - ${post.author} 작성`}
    >
      <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center">
        {/* 제목 영역 */}
        <div className="col-span-12 sm:col-span-8">
          <div className="flex items-center gap-2 min-w-0">
            {/* 고정 아이콘 */}
            {post.isPinned && <PinIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />}

            {/* 비밀글 아이콘 */}
            {post.isSecret && (
              <span className="flex-shrink-0" title="비밀글" aria-label="비밀글">
                <LockIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </span>
            )}

            {/* 읽지 않은 표시 */}
            {post.isRead === false && (
              <span className="relative flex-shrink-0" title="읽지 않음" aria-label="읽지 않음">
                <span className="w-2 h-2 bg-primary-500 rounded-full block" />
                <span className="absolute inset-0 w-2 h-2 bg-primary-400 rounded-full animate-ping opacity-75" />
              </span>
            )}

            {/* 제목 */}
            <h3
              title={post.title}
              className={`
              text-base text-slate-900 dark:text-slate-100 truncate min-w-0 flex-1
              group-hover:text-primary-700 dark:group-hover:text-primary-400
              transition-colors duration-100
              ${!post.isRead ? 'font-semibold' : 'font-medium'}
            `}
            >
              {post.title}
            </h3>

            {/* 태그 */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {post.tags.slice(0, 3).map((tag, idx) => {
                  const safeColor = isSafeColor(tag.color) ? tag.color : '#6366f1';
                  return (
                    <span
                      key={tag.id}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${idx > 0 ? 'hidden sm:inline' : ''}`}
                      style={{
                        backgroundColor: safeColor + '18',
                        color: safeColor,
                        border: `1px solid ${safeColor}35`,
                      }}
                    >
                      #{tag.name}
                    </span>
                  );
                })}
              </div>
            )}

            {/* 댓글 수 */}
            {post.commentCount > 0 && (
              <span className="badge badge-primary flex-shrink-0">
                <ChatIcon />
                {post.commentCount}
              </span>
            )}

            {/* 조회수 */}
            {post.viewCount !== undefined && post.viewCount > 0 && (
              <span className="badge badge-gray flex-shrink-0 hidden sm:inline-flex">
                <EyeIcon />
                {post.viewCount.toLocaleString()}
              </span>
            )}

            {/* 좋아요 수 */}
            {post.likeCount !== undefined && post.likeCount > 0 && (
              <span className="badge badge-red flex-shrink-0 hidden sm:inline-flex">
                <HeartIcon />
                {post.likeCount.toLocaleString()}
              </span>
            )}

            {/* 새 글 배지 */}
            {isNewPost() && (
              <span className="bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300 text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                NEW
              </span>
            )}
          </div>
        </div>

        {/* 모바일: 작성자 + 날짜 인라인 표시 */}
        <div className="col-span-12 flex items-center gap-2 mt-1.5 sm:hidden">
          <Avatar
            user={{ id: post.user?.id || '', name: post.author, avatar: post.user?.avatar || null }}
            size="xs"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {post.author}
          </span>
          <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {formatDate(post.createdAt)}
          </span>
        </div>

        {/* 작성자 - 데스크탑 전용 (좌측 정렬 → 아바타가 행마다 일렬로 맞음) */}
        <div className="col-span-2 hidden sm:flex items-center gap-1.5 min-w-0">
          <Avatar
            user={{
              id: post.user?.id || '',
              name: post.author,
              avatar: post.user?.avatar || null,
            }}
            size="xs"
          />
          <span
            title={post.author}
            className="text-sm text-slate-600 dark:text-slate-400 truncate font-medium"
          >
            {post.author}
          </span>
        </div>

        {/* 작성일 - 데스크탑 전용 */}
        <div className="col-span-2 text-center hidden sm:block">
          <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDate(post.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
};
