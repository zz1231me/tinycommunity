// 글 상세의 스크랩 토글. 개인 표시라 개수를 보여 주지 않는다.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { discoveryKeys } from '../../api/queryKeys';
import { toggleScrap } from '../../api/discovery';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

interface Props {
  boardType: string;
  postId: string;
  /** 담겨 있는지. 글 상세 응답에서 함께 온다. */
  initialScrapped: boolean;
}

export function ScrapButton({ boardType, postId, initialScrapped }: Props) {
  const queryClient = useQueryClient();

  // React Query 캐시에 두면 목록 무효화 때 방금 누른 값이 되돌아가므로 여기서 들고 있는다.
  const [scrapped, setScrapped] = useState(initialScrapped);

  // 다른 글로 이동하면 새 글의 값으로 맞춘다.
  useEffect(() => setScrapped(initialScrapped), [boardType, postId, initialScrapped]);

  // 이 단추가 사라진 뒤 도착한 응답으로 토스트를 띄우지 않는다(이미 다른 글을 보고 있다)
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const { mutate, isPending } = useMutation({
    mutationFn: () => toggleScrap(boardType, postId),
    // 누르는 즉시 반영하고 실패하면 되돌린다.
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
      if (!aliveRef.current) return;
      // 다른 탭에서 이미 바꿨을 수 있으므로 서버 값을 최종으로 쓴다.
      setScrapped(next);
      toast.success(next ? '스크랩에 담았습니다.' : '스크랩에서 뺐습니다.');
    },
    onSettled: () => {
      // 스크랩 목록 페이지가 열려 있을 수 있어 함께 맞춘다.
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
