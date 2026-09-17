// client/src/components/PostHistory.tsx
// 게시글 수정 이력 — 화면은 위키와 공유한다(RevisionHistory).

import { useQuery } from '@tanstack/react-query';
import { fetchPostRevisions } from '../api/posts';
import { RevisionHistory } from './common/RevisionHistory';

interface Props {
  boardType: string;
  postId: string;
  /** 비교 기준이 되는 현재 본문 */
  currentContent: string;
  onClose: () => void;
}

export default function PostHistory({ boardType, postId, currentContent, onClose }: Props) {
  const {
    data: revisions = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['posts', boardType, postId, 'revisions'],
    queryFn: () => fetchPostRevisions(boardType, postId),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <RevisionHistory
        revisions={revisions}
        currentContent={currentContent}
        loading={isPending}
        error={isError ? '수정 이력을 불러오지 못했습니다.' : null}
        onRetry={() => void refetch()}
        onClose={onClose}
      />
    </div>
  );
}
