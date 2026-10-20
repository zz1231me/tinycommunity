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
  /** 글 하나의 주소를 만든다. 줄이 진짜 링크여야 ⌘-클릭이 먹는다. */
  postHref: (postId: string) => string;
  /** 지금 목록 주소 — 상세의 '목록으로' 가 제자리로 돌아오게 넘긴다. */
  listHref: string;
  onPageChange: (page: number) => void;
  formatDate: (dateString: string) => string;
  /** 업무용 게시판인지. 아니면 상태 배지와 담당자 칼럼을 그리지 않는다. */
  showTasks?: boolean;
}

/**
 * 목록 머리줄. 로딩 화면(PostList)에서도 같은 것을 쓴다.
 *
 * 눈으로 칸을 맞추기 위한 줄이다. 보조도구에는 숨긴다 — 각 글 줄은 표의 행이
 * 아니라 링크 하나라서, 이 줄만 머리글로 읽히면 어느 값이 어느 칸인지 짝지을
 * 수가 없고 '제목 작성자 작성일' 이라는 뜬 글자만 하나 더 읽힌다.
 */
export const ColumnHeader = ({ showAssignee }: { showAssignee: boolean }) => (
  // card-header 는 flex 라 안쪽 12칸 그리드가 flex 항목이 되면 칼럼이 어긋난다. block 으로 되돌린다.
  // 행은 왼쪽에 2px 강조 띠를 늘 자리로 잡아 둔다(고정·hover 때 색이 들어온다).
  // 머리줄에도 같은 폭을 비워야 칸이 정확히 한 줄로 선다.
  <div
    aria-hidden="true"
    className="card-header block border-l-2 border-l-transparent bg-slate-50 dark:bg-slate-900/60"
  >
    {/* grid 칼럼 설정(cols/gap)은 PostListItem 행과 같아야 정렬된다. */}
    <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center text-xs font-semibold text-slate-600 dark:text-slate-400">
      {/* 좁은 화면에서는 행의 제목도 12칸을 다 쓴다. */}
      <div className={`col-span-12 ${showAssignee ? 'sm:col-span-6' : 'sm:col-span-8'}`}>제목</div>
      {showAssignee && <div className="col-span-2 hidden sm:block">담당자</div>}
      <div className="col-span-2 hidden sm:block">작성자</div>
      {/* 좁은 화면에서 행은 작성일을 제목 아래로 내리므로 머리줄에서도 숨긴다. */}
      <div className="col-span-2 text-center hidden sm:block">작성일</div>
    </div>
  </div>
);

export const PostListTable: React.FC<PostListTableProps> = ({
  posts,
  currentPage,
  pagination,
  postHref,
  listHref,
  onPageChange,
  formatDate,
  showTasks = false,
}) => {
  const pinnedPosts = posts.filter(p => p.isPinned);
  const regularPosts = posts.filter(p => !p.isPinned);

  // 담당자 칼럼은 업무용 게시판에서 실제로 쓰일 때만 자리를 차지한다.
  const showAssignee =
    showTasks && posts.some(p => p.assignee || (p.workStatus && p.workStatus !== 'none'));

  return (
    // 표가 아니다. 글 줄은 행이 아니라 링크 하나이고, 칸 맞춤은 눈을 위한 것이다.
    // role="table" 을 달아 두면 보조도구가 '행 1개짜리 표'(머리줄뿐)라고 읽었다.
    // 대신 이름 붙은 영역으로 두어 목록으로 바로 건너뛸 수 있게 한다.
    <section aria-label="게시글 목록">
      <ColumnHeader showAssignee={showAssignee} />

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
                  href={postHref(post.id)}
                  listHref={listHref}
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

      {regularPosts.length > 0 && (
        <motion.div
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
                href={postHref(post.id)}
                listHref={listHref}
                formatDate={formatDate}
                showTasks={showTasks}
                showAssignee={showAssignee}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <Pagination pagination={pagination} currentPage={currentPage} onPageChange={onPageChange} />
    </section>
  );
};
