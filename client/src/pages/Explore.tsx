// client/src/pages/Explore.tsx
// 탐색 — 인기글과 태그 클라우드.
//
// 게시판을 하나씩 열어 보지 않고도 "지금 이 사이트에서 무슨 일이 있는가" 를
// 볼 수 있게 하는 화면이다. 태그를 고르면 아래 목록이 그 태그의 글로 바뀐다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, Flame, Tag as TagIcon } from 'lucide-react';
import { PageContainer } from '../components/common/PageContainer';
import { PageHeader } from '../components/common/PageHeader';
import { DiscoveryPostRow } from '../components/discovery/DiscoveryPostRow';
import { TagCloud } from '../components/discovery/TagCloud';
import { Pagination } from '../components/boards/Pagination';
import { discoveryKeys } from '../api/queryKeys';
import {
  fetchPopularPosts,
  fetchPostsByTag,
  fetchTagCloud,
  type PopularPeriod,
} from '../api/discovery';

const PERIODS: Array<{ value: PopularPeriod; label: string }> = [
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'all', label: '전체' },
];

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="card-title flex items-center gap-2">
          <span className="text-primary-600 dark:text-primary-400">{icon}</span>
          {title}
        </h2>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>
  );
}

export default function Explore() {
  const [period, setPeriod] = useState<PopularPeriod>('week');
  const [tagId, setTagId] = useState<number | null>(null);
  // 태그를 바꾸면 1페이지부터 다시 본다
  const [tagPage, setTagPage] = useState(1);

  const popular = useQuery({
    queryKey: discoveryKeys.popular(period),
    queryFn: ({ signal }) => fetchPopularPosts(period, signal),
    // 태그를 고르면 아래 목록이 태그 글로 바뀌므로 그동안 인기글은 받아오지 않는다
    enabled: tagId === null,
  });

  const tags = useQuery({
    queryKey: discoveryKeys.tagCloud,
    queryFn: ({ signal }) => fetchTagCloud(signal),
  });

  // enabled 가 false 라도 키는 만들어진다 — 태그를 안 고른 동안 tagId 0 짜리
  // 빈 캐시 항목이 남지 않도록 실제로 쓸 때만 조회한다.
  const byTag = useQuery({
    queryKey: discoveryKeys.postsByTag(tagId ?? -1, tagPage),
    queryFn: ({ signal }) => fetchPostsByTag(tagId as number, tagPage, signal),
    enabled: tagId !== null,
    // 태그를 바꿔 가며 둘러볼 때 매번 다시 받지 않게 잠깐 재사용한다
    staleTime: 30_000,
  });

  const selectedTag = tags.data?.find(t => t.id === tagId) ?? null;

  return (
    <PageContainer>
      <PageHeader
        title="탐색"
        description="게시판을 가로질러 지금 읽을 만한 글을 찾습니다."
        icon={<Compass className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />

      <div className="space-y-4">
        <Panel title="태그" icon={<TagIcon className="h-5 w-5" />}>
          {tags.isLoading ? (
            <Empty>태그를 불러오는 중…</Empty>
          ) : tags.isError ? (
            <Empty>태그를 불러오지 못했습니다.</Empty>
          ) : (
            <TagCloud
              tags={tags.data ?? []}
              selectedId={tagId}
              onSelect={next => {
                setTagId(next);
                setTagPage(1);
              }}
            />
          )}
        </Panel>

        {tagId === null ? (
          <Panel
            title="인기글"
            icon={<Flame className="h-5 w-5" />}
            action={
              <div className="flex gap-1" role="group" aria-label="집계 기간">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={period === p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      period === p.value
                        ? 'bg-primary-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            }
          >
            {popular.isLoading ? (
              <Empty>불러오는 중…</Empty>
            ) : popular.isError ? (
              <Empty>인기글을 불러오지 못했습니다.</Empty>
            ) : (popular.data?.length ?? 0) === 0 ? (
              <Empty>이 기간에는 반응을 받은 글이 없습니다. 기간을 넓혀 보세요.</Empty>
            ) : (
              <ul className="space-y-0.5">
                {popular.data?.map((post, i) => (
                  <DiscoveryPostRow key={post.id} post={post} rank={i + 1} />
                ))}
              </ul>
            )}
          </Panel>
        ) : (
          <Panel
            title={selectedTag ? `#${selectedTag.name}` : '태그별 글'}
            icon={<TagIcon className="h-5 w-5" />}
            action={
              <button
                type="button"
                onClick={() => {
                  setTagId(null);
                  setTagPage(1);
                }}
                className="rounded-md px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                태그 해제
              </button>
            }
          >
            {byTag.isLoading ? (
              <Empty>불러오는 중…</Empty>
            ) : byTag.isError ? (
              <Empty>글을 불러오지 못했습니다.</Empty>
            ) : (byTag.data?.posts?.length ?? 0) === 0 ? (
              <Empty>이 태그가 붙은 글이 없습니다.</Empty>
            ) : (
              <>
                <ul className="space-y-0.5">
                  {(byTag.data?.posts ?? []).map(post => (
                    <DiscoveryPostRow key={post.id} post={post} />
                  ))}
                </ul>
                {(byTag.data?.pagination?.totalPages ?? 0) > 1 && (
                  <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                    <Pagination
                      pagination={byTag.data!.pagination}
                      currentPage={byTag.data!.pagination.currentPage}
                      onPageChange={setTagPage}
                    />
                  </div>
                )}
              </>
            )}
          </Panel>
        )}
      </div>
    </PageContainer>
  );
}
