// src/pages/boards/PostList.tsx - 중복 권한 체크 제거
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { fetchPostsByType, PostListResponse } from '../../api/posts';
import { getTags } from '../../api/tags';
import { checkUserBoardAccess, checkBoardManageCapability } from '../../api/boards';
import { Post, BoardInfo, Tag } from '../../types/board.types';
import { boardLogger } from '../../utils/logger';
import { formatRelativeDate } from '../../utils/date';
import { getBoardTitle } from '../../constants/boardTitles';

import { PageHeader } from '../../components/common/PageHeader';
import { SubscribeButton } from '../../components/social/SubscribeButton';
import { useFeature } from '../../store/features';
import { useSiteSettings } from '../../store/siteSettings';
import { PageContainer } from '../../components/common/PageContainer';
import { scrollContentToTop } from '../../utils/scroll';
import { SearchInput } from '../../components/common/SearchInput';
import { SkeletonLoader } from '../../components/boards/SkeletonLoader';
import { ErrorState } from '../../components/boards/ErrorState';
import { EmptyState } from '../../components/boards/EmptyState';
import { ColumnHeader, PostListTable } from '../../components/boards/PostListTable';
import { WorkStatusFilter } from '../../components/boards/WorkStatusFilter';
import type { WorkStatus } from '../../api/tasks';
import { BoardManagePanel } from '../../components/boards/BoardManagePanel';
import { boardKeys, keepIfSameBoard } from '../../api/queryKeys';

const PostList = () => {
  const { boardType } = useParams<{ boardType: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // 구독 기능이 꺼져 있으면 버튼도 두지 않는다
  const subscriptionsEnabled = useFeature('social.subscriptions');
  // 업무 상태를 안 쓰는 사이트에서는 필터 줄도 두지 않는다.
  // 사이트 전체 스위치(관리자) 와 게시판 용도, 둘 다 켜져 있어야 쓴다.
  const tasksEnabled = useFeature('post.tasks');

  // 페이지 번호를 URL 쿼리 파라미터에서 읽어 뒤로가기 시 복원
  const currentPage = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  // 한 쪽에 몇 개를 보일지는 관리자 설정(사이트 설정 › 기본 페이지 크기)을 따른다.
  // 값을 여기에 박아 두면 관리자가 설정을 바꿔도 게시판 목록만 그대로 남는다.
  const postsPerPage = useSiteSettings(s => s.settings.defaultPageSize);
  const [localSearch, setLocalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<WorkStatus[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 게시판 정보와 글 목록은 React Query 가 가져온다.
  //
  // 조건(검색어·태그·상태·페이지)을 캐시 키에 통째로 넣는다. useEffect 안에서 직접
  // 불러오면 isMounted 플래그와 AbortController 를 써도, 조건이 빠르게 바뀔 때 앞 요청의
  // 늦은 응답이 화면을 덮는다. 키가 다르면 늦게 온 응답은 지금 화면에 반영되지 않는다.
  const boardQuery = useQuery({
    queryKey: boardKeys.info(boardType ?? ''),
    queryFn: async () => {
      // 이 요청이 실패해도 머리글은 나와야 한다 — 권한은 BoardProtectedRoute 가 이미 봤고,
      // 여기서 가져오는 건 이름·설명 같은 표시용 정보다. 실패하면 게시판 이름 상수로 채운다.
      // (예전 코드도 그렇게 했다. 캐치를 빼면 통신이 한 번 흔들릴 때 제목이 '게시판' 이 된다.)
      const fallback: BoardInfo = {
        id: boardType!,
        name: getBoardTitle(boardType!),
        description: '게시글 목록을 확인하세요',
      } as BoardInfo;
      try {
        const res = await checkUserBoardAccess(boardType!);
        const data = res.data?.data?.board ?? res.data?.board;
        if (!data) return fallback;
        return {
          id: data.id,
          name: data.name,
          description: data.description || '게시글 목록을 확인하세요',
          taskEnabled: !!data.taskEnabled,
        } as BoardInfo;
      } catch (err) {
        boardLogger.warn('게시판 정보 가져오기 실패, 기본 정보 사용', err);
        return fallback;
      }
    },
    enabled: !!boardType,
  });
  const boardInfo = boardQuery.data ?? null;

  const listParams = {
    page: currentPage,
    limit: postsPerPage,
    search: debouncedSearch || undefined,
    tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    workStatus: statusFilter.length > 0 ? statusFilter : undefined,
  };
  const postsQuery = useQuery({
    queryKey: boardKeys.posts(boardType ?? '', listParams),
    queryFn: ({ signal }) =>
      fetchPostsByType(
        boardType!,
        {
          page: currentPage,
          limit: postsPerPage,
          search: debouncedSearch || undefined,
          tags: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          workStatus: statusFilter.length > 0 ? statusFilter : undefined,
        },
        signal
      ) as Promise<PostListResponse>,
    enabled: !!boardType,
    placeholderData: (prev, prevQuery) => keepIfSameBoard(prev, prevQuery?.queryKey, boardType),
    // 목록으로 돌아올 때마다 다시 읽는다.
    //
    // 전역 staleTime 이 5분이라 이것이 없으면 글을 쓰고 돌아와도 옛 목록이 그대로 보인다.
    //
    // post-updated 이벤트로는 막을 수 없다. 글을 쓰는 동안 이 화면은 언마운트 상태라
    // 이벤트를 듣는 쪽이 없다. 그 이벤트는 목록이 떠 있는 동안의 변경(고정·업무 상태)만
    // 담당한다.
    refetchOnMount: 'always',
  });

  const posts: Post[] = postsQuery.data?.posts ?? [];
  const pagination = postsQuery.data?.pagination ?? null;
  // 뼈대(스켈레톤)는 보여 줄 내용이 아예 없을 때만 띄운다.
  // 같은 게시판 안에서 쪽을 넘길 때는 이전 목록을 그대로 두고 aria-busy 로만 알린다.
  const loading = postsQuery.isPending;
  const fetching = postsQuery.isFetching;
  const error = postsQuery.isError
    ? ((postsQuery.error as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message ??
      (postsQuery.error as { message?: string })?.message ??
      '게시글을 불러오는 중 오류가 발생했습니다.')
    : null;

  const showTasks = tasksEnabled && !!boardInfo?.taskEnabled;

  // 업무용이 꺼진 게시판에 상태 선택이 남아 있으면 목록이 조용히 빈다.
  // 선택을 비우는 것으로 처리한다 — 목록을 부르는 effect 가 showTasks 를 보게 하면,
  // showTasks 는 그 effect 가 채우는 boardInfo 에서 나오므로 목록을 두 번 부르게 된다.
  useEffect(() => {
    if (!showTasks && statusFilter.length > 0) setStatusFilter([]);
  }, [showTasks, statusFilter.length]);

  const location = useLocation();
  const handlePostClick = useCallback(
    (postId: string) => {
      if (boardType) {
        // 현재 목록 URL(페이지·검색·태그 포함)을 넘겨, 상세에서 "목록으로" 시 원위치 복귀
        navigate(`/dashboard/posts/${boardType}/${postId}`, {
          state: { from: `${location.pathname}${location.search}` },
        });
      }
    },
    [boardType, navigate, location.pathname, location.search]
  );

  const handleNewPost = useCallback(() => {
    if (boardType) {
      navigate(`/dashboard/posts/${boardType}/new`);
    }
  }, [boardType, navigate]);

  const setPage = useCallback(
    (page: number) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (page === 1) {
          next.delete('page');
        } else {
          next.set('page', String(page));
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setPage(page);
      scrollContentToTop();
    },
    [setPage]
  );

  // 검색어 디바운스 (300ms) — localSearch 실제 변경 시에만 페이지 초기화
  const prevLocalSearch = useRef(localSearch);
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = localSearch.trim();
      const hasChanged = trimmed !== prevLocalSearch.current;
      prevLocalSearch.current = trimmed;
      setDebouncedSearch(trimmed);
      if (hasChanged) setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setPage]);

  // 게시판별 태그 로드 + boardType 변경 시 필터 초기화
  // setPage(1) 불필요: boardType 변경 시 URL이 달라지므로 searchParams의 page도 자동 초기화됨
  useEffect(() => {
    // 이미 비어 있으면 그대로 둔다.
    // 매번 새 배열을 넣으면 값은 같아도 참조가 바뀌고, 이 배열을 의존성으로 쓰는
    // 목록 조회 effect 가 한 번 더 돈다 — 게시판을 열 때마다 권한 확인과 목록 조회가
    // 두 번씩 나갔다.
    setSelectedTagIds(prev => (prev.length ? [] : prev));
    setStatusFilter(prev => (prev.length ? [] : prev));
    // 검색어도 함께 비운다. 태그·상태만 비우면 검색창의 글자는 남아, 다른 게시판으로 옮겼는데
    // 앞 게시판에서 치던 말로 걸러진 목록이 나온다.
    setLocalSearch(prev => (prev ? '' : prev));
    setDebouncedSearch(prev => (prev ? '' : prev));
    setAvailableTags([]);
    if (!boardType) return;
    // 아래 관리 권한 확인 effect 와 같은 이유로 취소 표시를 둔다 — 게시판을 빠르게 옮기면
    // 앞 게시판의 태그가 늦게 도착해, 지금 게시판의 필터 목록에 남의 태그가 걸렸다.
    let mounted = true;
    getTags(boardType)
      .then(tags => {
        if (mounted) setAvailableTags(tags);
      })
      .catch(err => boardLogger.warn('태그 로드 실패', err));
    return () => {
      mounted = false;
    };
  }, [boardType]);

  // 게시판 관리 권한(담당자/관리자) 확인 — 관리 버튼/패널 노출 판단
  useEffect(() => {
    setCanManage(false);
    if (!boardType) return;
    let mounted = true;
    checkBoardManageCapability(boardType)
      .then(res => {
        if (mounted) setCanManage(!!res?.canManage);
      })
      .catch(() => {
        if (mounted) setCanManage(false);
      });
    return () => {
      mounted = false;
    };
  }, [boardType]);

  // 관리 패널에서 태그/정보 변경 후 닫힐 때 — 태그 필터 목록 새로고침
  const handleManageClose = useCallback(() => {
    setShowManage(false);
    if (boardType) {
      getTags(boardType)
        .then(setAvailableTags)
        .catch(() => {});
    }
  }, [boardType]);

  const handleTagToggle = useCallback(
    (tagId: number) => {
      setSelectedTagIds(prev =>
        prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
      );
      setPage(1);
    },
    [setPage]
  );

  const handleTagClear = useCallback(() => {
    setSelectedTagIds([]);
    setPage(1);
  }, [setPage]);

  const handleStatusChange = useCallback(
    (next: WorkStatus[]) => {
      setStatusFilter(next);
      // 3페이지를 보다 필터를 걸면 결과가 1페이지밖에 없을 수 있다
      setPage(1);
    },
    [setPage]
  );

  // 글을 고치거나 지운 뒤 목록을 다시 읽는다.
  // 캐시를 무효화하면 되므로 refreshKey 같은 증가 값을 따로 들고 있을 필요가 없다.
  useEffect(() => {
    const handlePostUpdated = () => {
      setPage(1);
      void queryClient.invalidateQueries({ queryKey: boardKeys.all });
    };
    window.addEventListener('post-updated', handlePostUpdated);
    return () => window.removeEventListener('post-updated', handlePostUpdated);
  }, [setPage, queryClient]);

  if (!boardType) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-12 max-w-md text-center">
          <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              aria-hidden="true"
              className="w-10 h-10 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            잘못된 접근입니다
          </h3>
          <p className="text-slate-600 dark:text-slate-400">올바른 게시판을 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <PageContainer className="space-y-5">
      {/* ✅ 표준화된 페이지 헤더 적용 */}
      <PageHeader
        breadcrumbs={[
          { label: '대시보드', to: '/dashboard' },
          { label: boardInfo?.name || '게시판' },
        ]}
        title={boardInfo?.name || '게시판'}
        description={`${boardInfo?.description || '게시글 목록을 확인하세요'} · 총 ${pagination?.totalCount || 0}개`}
        icon={
          <svg
            aria-hidden="true"
            className="w-6 h-6 text-primary-600 dark:text-primary-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <SearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="빠른 검색..."
            ariaLabel="게시글 빠른 검색"
            className="w-full sm:w-52"
          />
          <div className="flex items-center gap-2">
            {/* 이 게시판의 새 글 알림을 받을지 — 개인 폴더는 나만 쓰는 곳이라 뺀다 */}
            {subscriptionsEnabled && boardType && !boardInfo?.isPersonal && (
              <SubscribeButton targetType="board" targetId={boardType} />
            )}
            {canManage && (
              <button
                onClick={() => setShowManage(true)}
                aria-label="게시판 관리"
                title="게시판 관리 (태그·정보)"
                className="btn-secondary"
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                관리
              </button>
            )}
            <button onClick={handleNewPost} aria-label="새 게시글 작성" className="btn-primary">
              <svg
                aria-hidden="true"
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              새 글 작성
            </button>
          </div>
        </div>
      </PageHeader>

      {showManage && boardType && (
        <BoardManagePanel
          boardType={boardType}
          initialName={boardInfo?.name || ''}
          initialTaskEnabled={!!boardInfo?.taskEnabled}
          initialDescription={
            boardInfo?.description === '게시글 목록을 확인하세요'
              ? ''
              : boardInfo?.description || ''
          }
          onClose={handleManageClose}
          onBoardUpdated={info =>
            queryClient.setQueryData(boardKeys.info(boardType ?? ''), (prev?: BoardInfo) =>
              prev
                ? {
                    ...prev,
                    name: info.name,
                    description: info.description,
                    taskEnabled: info.taskEnabled,
                  }
                : prev
            )
          }
        />
      )}

      {/* 거르는 것들은 한 줄에 모은다.
          상태 줄과 태그 줄을 한 줄에 둔다. 따로 놓으면 목록이 시작되기까지 두 칸을 쓴다. */}
      {(showTasks || availableTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {showTasks && <WorkStatusFilter selected={statusFilter} onChange={handleStatusChange} />}

          {availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-400">태그</span>
              <button
                onClick={handleTagClear}
                aria-pressed={selectedTagIds.length === 0}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedTagIds.length === 0
                    ? 'border-transparent bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                전체
              </button>
              {availableTags.map(tag => {
                const isActive = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleTagToggle(tag.id)}
                    aria-pressed={isActive}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-transparent text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                    style={isActive ? { backgroundColor: tag.color } : {}}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ✅ 게시글 목록 카드 — 다크모드는 shadow가 안 보이므로 subtle ring으로 입체감 부여 */}
      <div
        className="card overflow-hidden"
        role="region"
        aria-label={`${boardInfo?.name || '게시판'} 목록`}
        aria-busy={fetching}
      >
        {loading && (
          <div>
            {/* 목록이 도착했을 때와 같은 머리줄을 쓴다 — 손으로 한 벌 더 그리면 어긋난다.
                담당자 칸은 받아 온 글을 보고 정해지므로 아직 알 수 없다(false). */}
            <ColumnHeader showAssignee={false} />
            <SkeletonLoader />
          </div>
        )}

        {error && <ErrorState error={error} />}

        {!loading && !error && posts.length === 0 && (
          <EmptyState
            debouncedSearchTerm={debouncedSearch}
            selectedTagCount={selectedTagIds.length}
            onClearTags={() => setSelectedTagIds([])}
            onNewPost={handleNewPost}
          />
        )}

        {!loading && !error && posts.length > 0 && (
          <PostListTable
            posts={posts}
            currentPage={currentPage}
            pagination={pagination}
            onPostClick={handlePostClick}
            onPageChange={handlePageChange}
            formatDate={formatRelativeDate}
            showTasks={showTasks}
          />
        )}
      </div>
    </PageContainer>
  );
};

export default PostList;
