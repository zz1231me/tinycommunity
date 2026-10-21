import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Pin } from 'lucide-react';
import { Post, PaginationInfo } from '../../types/board.types';
import { PostListItem } from './PostListItem';
import { Pagination } from './Pagination';
import { stagger, listItem } from '../../utils/animations';
import { fetchSubtasks } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';

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
  /** 어느 게시판인지 — 하위 업무를 받아 오려면 필요하다 */
  boardType?: string;
}

/**
 * 펼친 줄의 하위 업무.
 *
 * 목록 응답에 하위를 함께 담지 않는다. 한 쪽에 상위가 10줄이면 하위까지 다 담느라
 * 응답이 몇 배로 커지는데, 펼쳐 보는 줄은 보통 하나다. 펼칠 때만 받아 온다.
 *
 * 목록 줄에 있던 값(조회수·좋아요·태그·썸네일)은 하위 업무 응답에 없다. 하위는
 * '할 일 한 줄' 이고, 자세히 볼 사람은 제목을 눌러 글로 들어간다.
 */
function SubtaskRows({
  boardType,
  parent,
  panelId,
  postHref,
  listHref,
  formatDate,
  showAssignee,
}: {
  boardType: string;
  parent: Post;
  panelId: string;
  postHref: (postId: string) => string;
  listHref: string;
  formatDate: (dateString: string) => string;
  showAssignee: boolean;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: taskKeys.subtasks(boardType, parent.id),
    queryFn: ({ signal }) => fetchSubtasks(boardType, parent.id, signal),
    staleTime: 30_000,
  });

  // 받아 오는 동안에도 자리는 잡아 둔다 — 줄이 갑자기 솟으면 누르려던 곳이 밀린다.
  if (isPending || isError) {
    return (
      <div id={panelId} className="px-4 py-2 pl-16 text-xs text-slate-400 sm:px-6 sm:pl-20">
        {isError ? '하위 업무를 불러오지 못했습니다.' : '불러오는 중…'}
      </div>
    );
  }

  return (
    <div id={panelId} className="divide-y divide-slate-100 dark:divide-slate-700/50">
      {data.map(child => (
        <PostListItem
          key={child.id}
          // 하위 응답은 업무에 필요한 값만 준다. 목록 줄이 기대하는 모양으로 맞춰 둔다.
          post={{
            id: child.id,
            title: child.title,
            createdAt: child.createdAt,
            // 하위 응답에는 작성자가 없다. 담당자를 작성자 자리에 넣으면 쓰지도 않은
            // 사람이 쓴 것처럼 보이므로 비워 두고, 줄이 작성자 칸을 그리지 않게 한다.
            author: '',
            commentCount: 0,
            workStatus: child.workStatus,
            assignee: child.assignee,
          }}
          index={0}
          href={postHref(child.id)}
          listHref={listHref}
          formatDate={formatDate}
          showTasks
          showAssignee={showAssignee}
          isSubtask
        />
      ))}
      {data.length === 0 && (
        <div className="px-4 py-2 pl-16 text-xs text-slate-400 sm:px-6 sm:pl-20">
          하위 업무가 없습니다.
        </div>
      )}
    </div>
  );
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
    className="card-header flex border-l-2 border-l-transparent bg-slate-50 dark:bg-slate-900/60"
  >
    {/* 행의 펼치기 단추 자리만큼 비운다. 빼면 머리글이 제목보다 32px 왼쪽에 선다. */}
    <span className="w-8 flex-shrink-0" />
    {/* grid 칼럼 설정(cols/gap)은 PostListItem 행과 같아야 정렬된다. */}
    <div className="grid min-w-0 flex-1 grid-cols-12 items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 sm:gap-4">
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
  boardType,
}) => {
  const pinnedPosts = posts.filter(p => p.isPinned);
  const regularPosts = posts.filter(p => !p.isPinned);

  // 담당자 칼럼은 업무용 게시판에서 실제로 쓰일 때만 자리를 차지한다.
  const showAssignee =
    showTasks && posts.some(p => p.assignee || (p.workStatus && p.workStatus !== 'none'));

  // 펼친 줄. 쪽을 넘기면 다른 글 묶음이므로 자연히 접힌다(id 가 사라진다).
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const renderRow = (post: Post, index: number) => {
    const hasSubtasks = (post.subtaskCount ?? 0) > 0;
    const isOpen = expanded.has(post.id);
    const panelId = `subtasks-${post.id}`;
    return (
      <motion.div key={post.id} variants={listItem}>
        <PostListItem
          post={post}
          index={index}
          href={postHref(post.id)}
          listHref={listHref}
          formatDate={formatDate}
          showTasks={showTasks}
          showAssignee={showAssignee}
          expanded={isOpen}
          panelId={hasSubtasks ? panelId : undefined}
          onToggle={hasSubtasks && boardType ? () => toggle(post.id) : undefined}
        />
        {hasSubtasks && isOpen && boardType && (
          <SubtaskRows
            boardType={boardType}
            parent={post}
            panelId={panelId}
            postHref={postHref}
            listHref={listHref}
            formatDate={formatDate}
            showAssignee={showAssignee}
          />
        )}
      </motion.div>
    );
  };

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
            {pinnedPosts.map((post, index) => renderRow(post, index))}
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
          {regularPosts.map((post, index) => renderRow(post, pinnedPosts.length + index))}
        </motion.div>
      )}

      <Pagination pagination={pagination} currentPage={currentPage} onPageChange={onPageChange} />
    </section>
  );
};
