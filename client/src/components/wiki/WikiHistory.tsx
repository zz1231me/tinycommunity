// client/src/components/wiki/WikiHistory.tsx
// 위키 편집 이력 — 화면은 게시글과 공유한다(RevisionHistory).

import { useQuery } from '@tanstack/react-query';
import { getWikiPageHistory } from '../../api/wiki';
import { RevisionHistory } from '../common/RevisionHistory';

interface WikiHistoryProps {
  slug: string;
  currentContent: string;
  onRestore?: (content: string) => void;
}

export const WikiHistory: React.FC<WikiHistoryProps> = ({ slug, currentContent, onRestore }) => {
  const {
    data: revisions = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['wiki', slug, 'history'],
    queryFn: () => getWikiPageHistory(slug),
  });

  return (
    <RevisionHistory
      heading="편집 이력"
      revisions={revisions}
      currentContent={currentContent}
      loading={isPending}
      error={isError ? '수정 이력을 불러오는 데 실패했습니다.' : null}
      onRetry={() => void refetch()}
      onRestore={onRestore}
    />
  );
};
