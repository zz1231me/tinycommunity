// 탐색 화면 — 인기글과 태그 클라우드. 태그를 고르면 아래 목록이 그 태그의 글로 바뀐다.

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
      <header className="card-header justify-between gap-3">
        <h2 className="card-title flex items-center gap-2">
          <span className="text-primary-600 dark:text-primary-400">{icon}</span>
          {title}
        </h2>
        {action}
      </header>
      <div className="card-body">{children}</div>
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
  const [tagPage, setTagPage] = useState(1);

  const popular = useQuery({
    queryKey: discoveryKeys.popular(period),
    queryFn: ({ signal }) => fetchPopularPosts(period, signal),
    enabled: tagId === null,
  });

  const tags = useQuery({
    queryKey: discoveryKeys.tagCloud,
    queryFn: ({ signal }) => fetchTagCloud(signal),
  });

  // enabled 가 false 라도 키는 만들어지므로, 태그를 고른 뒤에만 조회한다.
  const byTag = useQuery({
    queryKey: discoveryKeys.postsByTag(tagId ?? -1, tagPage),
    queryFn: ({ signal }) => fetchPostsByTag(tagId as number, tagPage, signal),
    enabled: tagId !== null,
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
