import React from 'react';
import { DEFAULT_TAG_COLOR } from '../../constants/colors';
import { Avatar } from '../Avatar';
import { LockIcon, EyeIcon, HeartIcon, ChatIcon, PaperclipIcon } from '../common/Icons';
import { Pin } from 'lucide-react';
import { Post } from '../../types/board.types';
import { WorkStatusBadge } from './WorkStatusBadge';
// 목록의 formatDate prop 은 작성일용 상대 표기('3일 전')라 미래 시각에 쓸 수 없다.
// 고정 만료일은 절대 날짜로 보여야 하므로 별도로 가져온다.
import { formatDate as formatAbsoluteDate } from '../../utils/date';

const isSafeColor = (color: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(color) ||
  /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color) ||
  /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/.test(color);

interface PostListItemProps {
  post: Post;
  index: number;
  onPostClick: (postId: string) => void;
  formatDate: (dateString: string) => string;
  /** 업무용 게시판인지 — 아니면 상태 배지를 그리지 않는다 */
  showTasks?: boolean;
  /** 담당자 칼럼을 그릴지 — 헤더와 같은 값이어야 칼럼이 어긋나지 않는다 */
  showAssignee?: boolean;
}

export const PostListItem: React.FC<PostListItemProps> = ({
  post,
  index: _index,
  onPostClick,
  formatDate,
  showTasks = false,
  showAssignee = false,
}) => {
  // 썸네일이 없거나 깨진 경우 조용히 숨긴다(목록 정렬이 흐트러지지 않도록)
  const [thumbFailed, setThumbFailed] = React.useState(false);

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
        px-4 sm:px-6 py-3 cursor-pointer transition-colors duration-100 group
        border-l-2 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0
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
        <div className={`col-span-12 ${showAssignee ? 'sm:col-span-6 sm:pr-3' : 'sm:col-span-8'}`}>
          <div className="flex items-center gap-2 min-w-0">
            {/* 이미지 첨부 미리보기 — 원본이 아니라 축소된 썸네일을 받는다.
                로드 실패(이미지가 아니거나 삭제됨) 시 자리를 차지하지 않도록 숨긴다. */}
            {post.thumbnailName && !thumbFailed && (
              <img
                src={`/api/uploads/thumb/${encodeURIComponent(post.thumbnailName)}`}
                onError={() => setThumbFailed(true)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="w-10 h-10 flex-shrink-0 rounded object-cover border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            )}

            {/* 고정 아이콘 — 기간 고정이면 언제까지인지 툴팁으로 알린다 */}
            {post.isPinned && (
              <span
                className="flex-shrink-0"
                title={
                  post.pinnedUntil
                    ? `${formatAbsoluteDate(post.pinnedUntil)}까지 고정`
                    : '고정된 게시글'
                }
                aria-label={
                  post.pinnedUntil
                    ? `${formatAbsoluteDate(post.pinnedUntil)}까지 고정된 게시글`
                    : '고정된 게시글'
                }
              >
                <Pin className="w-4 h-4 text-amber-500" fill="currentColor" />
              </span>
            )}

            {/* 비밀글 아이콘 */}
            {post.isSecret && (
              <span className="flex-shrink-0" title="비밀글" aria-label="비밀글">
                <LockIcon className="w-4 h-4 text-slate-400" />
              </span>
            )}

            {/* 읽지 않은 표시 */}
            {post.isRead === false && (
              <span className="relative flex-shrink-0" title="읽지 않음" aria-label="읽지 않음">
                <span className="w-2 h-2 bg-primary-500 rounded-full block" />
                <span className="absolute inset-0 w-2 h-2 bg-primary-400 rounded-full animate-ping opacity-75" />
              </span>
            )}

            {/* 업무 상태 — 'none' 이면 스스로 아무것도 그리지 않는다 */}
            {showTasks && <WorkStatusBadge status={post.workStatus ?? 'none'} />}

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
                  const safeColor = isSafeColor(tag.color) ? tag.color : DEFAULT_TAG_COLOR;
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

            {/* 첨부파일 표시 */}
            {post.attachmentCount !== undefined && post.attachmentCount > 0 && (
              <span
                className="inline-flex flex-shrink-0 items-center gap-0.5 text-slate-400"
                title={`첨부파일 ${post.attachmentCount}개`}
                aria-label={`첨부파일 ${post.attachmentCount}개`}
              >
                <PaperclipIcon className="w-3.5 h-3.5" />
                <span className="text-xs tabular-nums">{post.attachmentCount}</span>
              </span>
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
              <span className="badge flex-shrink-0 bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300">
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
          <span className="text-xs text-slate-400 tabular-nums">{formatDate(post.createdAt)}</span>
          {/* 좁은 화면에는 담당자 칼럼이 없으므로 이 줄에 붙인다 */}
          {showTasks && post.assignee && (
            <>
              <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                담당 {post.assignee.name}
              </span>
            </>
          )}
        </div>

        {/* 담당자 - 데스크탑 전용. 업무로 쓰는 게시판에서만 나타난다 */}
        {showAssignee && (
          <div className="col-span-2 hidden min-w-0 items-center gap-1.5 sm:flex">
            {post.assignee ? (
              <>
                <Avatar user={post.assignee} size="xs" />
                <span
                  title={post.assignee.name}
                  className="truncate text-sm font-medium text-slate-600 dark:text-slate-400"
                >
                  {post.assignee.name}
                </span>
              </>
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}
          </div>
        )}

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
