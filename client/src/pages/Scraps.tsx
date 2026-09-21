// 내가 스크랩한 글 목록. 읽을 수 없게 된 글은 서버가 목록에서 뺀다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { PageContainer } from '../components/common/PageContainer';
import { ListLoading, ListError, ListState } from '../components/common/ListState';
import { PageHeader } from '../components/common/PageHeader';
import { DiscoveryPostRow } from '../components/discovery/DiscoveryPostRow';
import { Pagination } from '../components/boards/Pagination';
import { discoveryKeys } from '../api/queryKeys';
import { fetchMyScraps } from '../api/discovery';

export default function Scraps() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: discoveryKeys.scraps.list(page),
    queryFn: ({ signal }) => fetchMyScraps(page, signal),
  });

  return (
    <PageContainer>
      <PageHeader
        title="스크랩"
        description="나중에 다시 볼 글을 모아 둡니다. 나만 볼 수 있습니다."
        icon={<Bookmark className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />

      <section className="card overflow-hidden">
        <div className="p-3">
          {isLoading ? (
            <ListLoading />
          ) : isError ? (
            <ListError what="스크랩 목록" />
          ) : (data?.posts?.length ?? 0) === 0 ? (
            <ListState size="roomy">
              아직 스크랩한 글이 없습니다.
              <br />글 상세 화면의 스크랩 버튼으로 담아 두세요.
            </ListState>
          ) : (
            <ul className="space-y-0.5">
              {(data?.posts ?? []).map(post => (
                <DiscoveryPostRow key={post.id} post={post} />
              ))}
            </ul>
          )}
        </div>

        {(data?.pagination?.totalPages ?? 0) > 1 && (
          <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">
            <Pagination
              pagination={data!.pagination}
              currentPage={data!.pagination.currentPage}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>
    </PageContainer>
  );
}
