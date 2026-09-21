import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { discoveryKeys } from '../../api/queryKeys';
import { fetchRelatedPosts } from '../../api/discovery';
import { DiscoveryPostRow } from './DiscoveryPostRow';

interface Props {
  boardType: string;
  postId: string;
}

export function RelatedPosts({ boardType, postId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: discoveryKeys.related(boardType, postId),
    queryFn: ({ signal }) => fetchRelatedPosts(boardType, postId, signal),
  });

  // 서버가 배열이 아닌 값을 주더라도 map 까지 가지 않도록 막는다.
  const items = Array.isArray(data) ? data : [];

  if (isLoading || isError || items.length === 0) return null;

  return (
    <section className="card overflow-hidden">
      <header className="card-header">
        <Sparkles className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h2 className="card-title">관련 글</h2>
      </header>
      <ul className="space-y-0.5 p-2 sm:p-3">
        {items.map(post => (
          <DiscoveryPostRow key={post.id} post={post} />
        ))}
      </ul>
    </section>
  );
}
