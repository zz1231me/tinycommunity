// client/src/components/discovery/RelatedPosts.tsx
// 글 아래의 관련 글. 태그가 겹치는 글을 서버가 먼저 고르고,
// 모자란 자리만 같은 게시판의 최근 글로 채운다.

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

  // 배열이 아닌 답(서버가 모양을 바꾸거나 오류 봉투가 오는 경우)이 와도 이 칸만 비운다.
  // 예전에는 data.length 로만 봐서, 배열이 아니면 그대로 map 까지 가 터졌다 — 이 화면에는
  // 자체 오류 울타리가 없어 글 전체(앱 전체)가 하얗게 됐다. 곁다리 카드가 본문을 끌어내리면 안 된다.
  const items = Array.isArray(data) ? data : [];

  // 읽을 글이 없으면 빈 칸을 남기지 않고 통째로 숨긴다
  if (isLoading || isError || items.length === 0) return null;

  return (
    <section className="card overflow-hidden">
      {/* 머리글 모양은 활동 기록·읽음 확인과 같은 것을 쓴다 —
          같은 층에 나란히 놓이는 카드들이라 하나만 크면 그것만 튄다 */}
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
