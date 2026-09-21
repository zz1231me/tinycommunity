import React from 'react';
import { motion } from 'framer-motion';
import { Pin } from 'lucide-react';
import { Post, PaginationInfo } from '../../types/board.types';
import { PostListItem } from './PostListItem';
import { Pagination } from './Pagination';
import { stagger, listItem } from '../../utils/animations';

interface PostListTableProps {
  posts: Post[];
  currentPage: number;
  pagination: PaginationInfo | null;
  onPostClick: (postId: string) => void;
  onPageChange: (page: number) => void;
  formatDate: (dateString: string) => string;
  /** 이 게시판이 업무용인지 — 아니면 상태 배지도 담당자 칼럼도 그리지 않는다 */
  showTasks?: boolean;
}

/**
 * 목록 머리줄.
 *
 * 불러오는 동안에도 같은 것을 쓴다(PostList 의 로딩 화면). 예전에는 그쪽에 머리줄을
 * 손으로 한 벌 더 그려 두었는데, 여백도 칸 수도 글자 굵기도 서로 달라 목록이 도착하는
 * 순간 줄이 덜컥 바뀌었다. 한 곳에서만 그리면 어긋날 수가 없다.
 */
export const ColumnHeader = ({ showAssignee }: { showAssignee: boolean }) => (
  // card-header 는 flex 다 — 안쪽 12칸 그리드가 flex 항목이 되면 폭이 글자만큼 줄어
  // 행과 칼럼이 어긋난다. 여백·테두리만 쓰고 배치는 원래대로 둔다.
  <div role="rowgroup" className="card-header block bg-slate-50 dark:bg-slate-900/60">
    {/* ⚠️ grid 칼럼 설정(cols/gap)을 PostListItem 행과 반드시 동일하게 유지해야 칼럼이 정렬됨 */}
    <div
      role="row"
      className="grid grid-cols-12 gap-2 sm:gap-4 items-center text-xs font-semibold text-slate-600 dark:text-slate-400"
    >
      {/* 좁은 화면에서는 행의 제목도 12칸을 다 쓴다 — 머리줄만 10칸이면 한 칸씩 어긋난다 */}
      <div
        role="columnheader"
        className={`col-span-12 ${showAssignee ? 'sm:col-span-6' : 'sm:col-span-8'}`}
      >
        제목
      </div>
      {showAssignee && (
        <div role="columnheader" className="col-span-2 hidden sm:block">
          담당자
        </div>
      )}
      <div role="columnheader" className="col-span-2 hidden sm:block">
        작성자
      </div>
      {/* 좁은 화면에서 행은 작성일을 제목 아래 줄로 내린다. 머리줄에만 칸이 남아 있으면
          아무 행도 쓰지 않는 빈 칸에 '작성일' 만 떠 있게 된다 */}
      <div role="columnheader" className="col-span-2 text-center hidden sm:block">
        작성일
      </div>
    </div>
  </div>
);

export const PostListTable: React.FC<PostListTableProps> = ({
  posts,
  currentPage,
  pagination,
  onPostClick,
  onPageChange,
  formatDate,
  showTasks = false,
}) => {
  const pinnedPosts = posts.filter(p => p.isPinned);
  const regularPosts = posts.filter(p => !p.isPinned);

  // 담당자 칼럼은 업무용 게시판에서, 실제로 쓰이고 있을 때만 자리를 차지한다.
  // 업무용으로 켜 두기만 하고 실제로 쓰지 않는 게시판에 빈 칼럼을 두면 제목 폭만 좁아진다.
  const showAssignee =
    showTasks && posts.some(p => p.assignee || (p.workStatus && p.workStatus !== 'none'));

  return (
    <div role="table" aria-label="게시글 목록">
      <ColumnHeader showAssignee={showAssignee} />

      {/* 고정 게시글 섹션 */}
      {pinnedPosts.length > 0 && (
        <>
          <div className="bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800/40 px-4 sm:px-8 py-1.5 flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 text-amber-500" fill="currentColor" aria-hidden="true" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              고정 게시글
            </span>
            <span className="text-xs text-amber-500 dark:text-amber-500">
              ({pinnedPosts.length})
            </span>
          </div>
          <motion.div
            role="rowgroup"
            className="divide-y divide-amber-100 dark:divide-amber-900/20"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {pinnedPosts.map((post, index) => (
              <motion.div key={post.id} variants={listItem}>
                <PostListItem
                  post={post}
                  index={index}
                  onPostClick={onPostClick}
                  formatDate={formatDate}
                  showTasks={showTasks}
                  showAssignee={showAssignee}
                />
              </motion.div>
            ))}
          </motion.div>
          {regularPosts.length > 0 && (
            <div className="border-b border-slate-200 dark:border-slate-700" />
          )}
        </>
      )}

      {/* 일반 게시글 */}
      {regularPosts.length > 0 && (
        <motion.div
          role="rowgroup"
          className="divide-y divide-slate-200 dark:divide-slate-700"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {regularPosts.map((post, index) => (
            <motion.div key={post.id} variants={listItem}>
              <PostListItem
                post={post}
                index={pinnedPosts.length + index}
                onPostClick={onPostClick}
                formatDate={formatDate}
                showTasks={showTasks}
                showAssignee={showAssignee}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <Pagination pagination={pagination} currentPage={currentPage} onPageChange={onPageChange} />
    </div>
  );
};
