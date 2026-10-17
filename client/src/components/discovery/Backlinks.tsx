// 이 글을 가리키는 다른 글. 컨플루언스·지라의 backlink 처럼, 흩어진 글이 서로 이어 보이게 한다.
//
// 본문에 이 글의 주소를 넣은 글만 모인다(서버가 저장할 때 적어 둔다). 볼 수 있는 것만
// 오므로 여기서 다시 거르지 않는다. 하나도 없으면 아무것도 그리지 않는다 — 빈 칸이
// 글 아래에 쌓이면 읽는 흐름만 끊는다.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { discoveryKeys } from '../../api/queryKeys';
import { fetchBacklinks } from '../../api/discovery';

interface Props {
  boardType: string;
  postId: string;
}

export function Backlinks({ boardType, postId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: discoveryKeys.backlinks(boardType, postId),
    queryFn: ({ signal }) => fetchBacklinks(boardType, postId, signal),
  });

  const items = Array.isArray(data) ? data : [];
  if (isLoading || isError || items.length === 0) return null;

  return (
    <section className="card overflow-hidden">
      <header className="card-header">
        <Link2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h2 className="card-title">이 글을 가리키는 글</h2>
        <span className="ml-auto text-xs font-medium tabular-nums text-slate-400">
          {items.length}
        </span>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map(post => (
          <li key={post.id}>
            <Link
              to={`/dashboard/posts/${post.boardType}/${post.id}`}
              className="flex items-baseline gap-2 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-4"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {post.title}
              </span>
              <span className="flex-shrink-0 text-xs text-slate-400">{post.boardName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
