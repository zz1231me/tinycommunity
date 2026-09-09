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

const ColumnHeader = ({ showAssignee }: { showAssignee: boolean }) => (
  <div
    role="rowgroup"
    className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3"
  >
    {/* ⚠️ grid 칼럼 설정(cols/gap)을 PostListItem 행과 반드시 동일하게 유지해야 칼럼이 정렬됨 */}
    <div
      role="row"
      className="grid grid-cols-12 gap-2 sm:gap-4 items-center text-xs font-semibold text-slate-600 dark:text-slate-400"
    >
      <div
        role="columnheader"
        className={`col-span-10 ${showAssignee ? 'sm:col-span-6' : 'sm:col-span-8'}`}
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
      <div role="columnheader" className="col-span-2 text-center">
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
