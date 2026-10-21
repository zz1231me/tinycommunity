import React from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_TAG_COLOR } from '../../constants/colors';
import { Avatar } from '../Avatar';
import { LockIcon, EyeIcon, HeartIcon, ChatIcon, PaperclipIcon } from '../common/Icons';
import { ChevronRight, CornerDownRight, Pin } from 'lucide-react';
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
  /** 이 글의 주소. 진짜 href 여야 ⌘-클릭·가운데 클릭·'새 탭으로 열기' 가 먹는다. */
  href: string;
  /** 상세의 '목록으로' 가 제자리로 돌아오도록 넘기는 지금 목록 주소. */
  listHref: string;
  formatDate: (dateString: string) => string;
  /** 업무용 게시판인지 — 아니면 상태 배지를 그리지 않는다 */
  showTasks?: boolean;
  /** 담당자 칼럼을 그릴지 — 헤더와 같은 값이어야 칼럼이 어긋나지 않는다 */
  showAssignee?: boolean;
  /** 하위 업무 줄이면 true — 안으로 들여 쓰고 상위에 딸렸음을 선으로 잇는다 */
  isSubtask?: boolean;
  /** 펼쳐져 있는지. 하위를 가진 줄에만 쓴다 */
  expanded?: boolean;
  /** 펼치기 단추를 눌렀을 때. 없으면 단추를 그리지 않는다 */
  onToggle?: () => void;
  /** 펼쳐지는 영역의 id — 단추와 이어 준다 */
  panelId?: string;
}

export const PostListItem: React.FC<PostListItemProps> = ({
  post,
  index: _index,
  href,
  listHref,
  formatDate,
  showTasks = false,
  showAssignee = false,
  isSubtask = false,
  expanded = false,
  onToggle,
  panelId,
}) => {
  // 썸네일이 없거나 깨진 경우 조용히 숨긴다(목록 정렬이 흐트러지지 않도록)
  const [thumbFailed, setThumbFailed] = React.useState(false);

  const subtaskTotal = post.subtaskCount ?? 0;
  const subtaskDone = post.subtaskDoneCount ?? 0;

  return (
    // 펼치기 단추는 줄 링크 **밖에** 둔다. <a> 안의 <button> 은 올바르지 않은
    // 짜임새이고, 눌렀을 때 링크까지 따라가 상세로 넘어가 버린다.
    // 그래서 줄을 띠 하나로 감싸고 단추와 링크를 나란히 둔다. 색과 왼쪽 띠는
    // 이 바깥 띠가 맡아야 단추 위에 얹어도 줄 전체가 같이 반응한다.
    <div
      className={`
        group flex items-stretch px-4 transition-colors duration-100 sm:px-6
        border-l-2 border-b border-slate-100 dark:border-slate-700/50 last:border-b-0
        ${
          post.isPinned
            ? 'bg-amber-50/70 dark:bg-amber-900/10 border-l-amber-400 dark:border-l-amber-500'
            : isSubtask
              ? 'bg-slate-50/60 dark:bg-slate-800/60 border-l-transparent'
              : 'bg-white dark:bg-slate-800 border-l-transparent'
        }
        hover:bg-primary-50/60 dark:hover:bg-primary-900/10
        hover:border-l-primary-500 dark:hover:border-l-primary-400
      `}
    >
      {/* 펼치기 자리. 하위가 없는 줄도 같은 폭을 비워 둔다 — 안 그러면 삼각형이
          있는 줄만 제목이 밀려 목록이 들쭉날쭉해진다(머리줄도 같은 폭을 비운다). */}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          // 제목을 함께 읽어 준다 — '펼치기' 단추가 여럿이면 어느 줄인지 알 수 없다.
          aria-label={`${post.title}의 하위 업무 ${expanded ? '접기' : '펼치기'}`}
          // 제목 줄에 맞춘다. 가운데 정렬로 두면 좁은 화면에서 줄이 두 줄(제목+작성자)이 되어
          // 삼각형이 두 줄 사이에 떠, 무엇을 펼치는 단추인지 흐려진다.
          className="flex w-8 flex-shrink-0 items-start justify-center pt-4 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <span className="w-8 flex-shrink-0" aria-hidden="true" />
      )}

      {/* 줄은 진짜 링크다. div+onClick 이던 때는 ⌘-클릭이 새 탭을 열지 않고 보던
          목록을 덮어 버렸다(실측: 탭이 늘지 않고 현재 탭이 상세로 갔다). 여러 글을
          탭으로 열어 두고 보는 건 게시판에서 흔한 일인데 그게 안 됐다.
          Link 는 평범한 클릭만 가로채고 ⌘·가운데·우클릭은 브라우저에 넘긴다. */}
      <Link
        to={href}
        state={{ from: listHref }}
        className="min-w-0 flex-1 py-3"
        aria-label={isSubtask ? `${post.title} - 하위 업무` : `${post.title} - ${post.author} 작성`}
      >
        <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center">
          {/* 제목 영역 */}
          <div
            className={`col-span-12 ${showAssignee ? 'sm:col-span-6 sm:pr-3' : 'sm:col-span-8'}`}
          >
            <div className={`flex items-center gap-2 min-w-0 ${isSubtask ? 'pl-5 sm:pl-7' : ''}`}>
              {/* 하위 업무임을 줄 안에서 알린다. 들여쓰기만 두면 폭이 좁은 화면에서
                  한두 칸 차이로 보여 그냥 줄과 구별되지 않는다. */}
              {isSubtask && (
                <CornerDownRight
                  className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
              )}

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

              {/* 제목이 맨 앞이다. 앞에 표식을 두면 그 줄에만 있는 표식 때문에 제목이
                줄마다 다른 자리에서 시작한다(실측: 291px 과 352px). 표식은 모두 뒤로 둔다 —
                읽지 않음은 굵은 제목이 이미 말하고, 고정은 줄 색과 왼쪽 띠가 말한다. */}
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

              {/* 업무 상태 — 'none' 이면 스스로 아무것도 그리지 않는다 */}
              {showTasks && <WorkStatusBadge status={post.workStatus ?? 'none'} />}

              {/* 하위 진행. 펼치지 않아도 '얼마나 남았는지' 가 보여야 누를 이유가 생긴다.
                  개수만 적으면 아직 할 일이 있는지 알 수 없어 끝난 수를 함께 적는다. */}
              {subtaskTotal > 0 && (
                <span
                  className="badge badge-gray flex-shrink-0 tabular-nums"
                  title={`하위 업무 ${subtaskTotal}개 중 ${subtaskDone}개 끝남`}
                >
                  하위 {subtaskDone}/{subtaskTotal}
                </span>
              )}

              {/* 고정 — 기간 고정이면 언제까지인지 툴팁으로 알린다 */}
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

              {/* 비밀글 */}
              {post.isSecret && (
                <span className="flex-shrink-0" title="비밀글" aria-label="비밀글">
                  <LockIcon className="w-4 h-4 text-slate-400" />
                </span>
              )}

              {/* 읽지 않음 — 줄마다 깜빡이면 목록 전체가 들썩인다. 점만 둔다. */}
              {post.isRead === false && (
                <span className="flex-shrink-0" title="읽지 않음" aria-label="읽지 않음">
                  <span className="block h-2 w-2 rounded-full bg-primary-500" />
                </span>
              )}

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
            </div>

            {/* 거를 때는 하위가 상위와 떨어져 나온다. 어디에 딸린 일인지 적어 두지
                않으면 그 줄만 보고는 알 수 없다. 링크 안이라 또 링크를 걸 수는 없다. */}
            {post.parentTask && (
              <p className="mt-1 truncate pl-5 text-xs text-slate-500 dark:text-slate-400 sm:pl-7">
                상위 · {post.parentTask.title}
              </p>
            )}
          </div>

          {/* 모바일: 작성자 + 날짜 인라인 표시 */}
          <div
            className={`col-span-12 mt-1.5 flex items-center gap-2 sm:hidden ${isSubtask ? 'pl-5' : ''}`}
          >
            {!isSubtask && (
              <>
                <Avatar
                  user={{
                    id: post.user?.id || '',
                    name: post.author,
                    avatar: post.user?.avatar || null,
                  }}
                  size="xs"
                />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {post.author}
                </span>
                <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
              </>
            )}
            <span className="text-xs text-slate-400 tabular-nums">
              {formatDate(post.createdAt)}
            </span>
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

          {/* 작성자 - 데스크탑 전용 (좌측 정렬 → 아바타가 행마다 일렬로 맞음).
              하위 업무 줄은 작성자를 받아 오지 않는다(하위 응답에 없다). 비워 두되
              칸은 남겨 윗줄과 칼럼이 어긋나지 않게 한다 — 없는 사람을 '?' 로 그리면
              누군가가 쓴 것처럼 보인다. */}
          <div className="col-span-2 hidden sm:flex items-center gap-1.5 min-w-0">
            {isSubtask ? null : (
              <>
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
              </>
            )}
          </div>

          {/* 작성일 - 데스크탑 전용 */}
          <div className="col-span-2 text-center hidden sm:block">
            <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {formatDate(post.createdAt)}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
};
