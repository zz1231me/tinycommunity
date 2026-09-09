// client/src/components/discovery/ScrapButton.tsx
// 글 상세의 스크랩 토글. 좋아요와 달리 작성자에게 알림이 가지 않는 개인 표시라
// 개수를 보여주지 않는다 — 남들이 몇 명 담았는지는 이 기능의 관심사가 아니다.

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { discoveryKeys } from '../../api/queryKeys';
import { toggleScrap } from '../../api/discovery';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

interface Props {
  boardType: string;
  postId: string;
  /**
   * 담겨 있는지 — 글 상세 응답에서 함께 온다.
   * 이 버튼이 직접 물어보면 글 하나 여는 데 왕복이 하나 더 는다.
   */
  initialScrapped: boolean;
}

export function ScrapButton({ boardType, postId, initialScrapped }: Props) {
  const queryClient = useQueryClient();

  // 서버에 다시 물을 일이 없는 값이라 이 버튼이 직접 들고 있는다.
  // (React Query 캐시에 두었더니, 스크랩 목록을 무효화할 때 이 항목까지 같이 다시 읽혀
  //  방금 누른 값이 처음 값으로 되돌아갔다 — 눌러도 안 담기는 것처럼 보였다.)
  const [scrapped, setScrapped] = useState(initialScrapped);

  // 다른 글로 이동하면 새 글의 값으로 맞춘다
  useEffect(() => setScrapped(initialScrapped), [boardType, postId, initialScrapped]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => toggleScrap(boardType, postId),
    // 누르는 즉시 반영한다. 담았는지 뺐는지는 사용자가 방금 정한 일이라
    // 왕복을 기다릴 이유가 없다 — 실패하면 되돌리고 알린다.
    onMutate: () => {
      const previous = scrapped;
      setScrapped(!previous);
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context) setScrapped(context.previous);
      toast.error(getApiErrorMessage(err, '스크랩 처리에 실패했습니다.'));
    },
    onSuccess: next => {
      // 서버가 알려 준 값이 최종이다 — 다른 탭에서 이미 바꿨을 수 있다
      setScrapped(next);
      toast.success(next ? '스크랩에 담았습니다.' : '스크랩에서 뺐습니다.');
    },
    onSettled: () => {
      // 스크랩 목록 페이지가 열려 있을 수 있으므로 함께 맞춘다
      queryClient.invalidateQueries({ queryKey: discoveryKeys.scraps.all });
    },
  });

  return (
    <button
      type="button"
      onClick={() => mutate()}
      disabled={isPending}
      aria-pressed={scrapped}
      aria-label={scrapped ? '스크랩 해제' : '스크랩'}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        scrapped
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
      }`}
    >
      <Bookmark className="h-4 w-4" fill={scrapped ? 'currentColor' : 'none'} />
      {scrapped ? '스크랩됨' : '스크랩'}
    </button>
  );
}
