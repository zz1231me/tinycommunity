// client/src/components/social/SubscribeButton.tsx
// 게시판 구독 / 사람 팔로우 토글.
//
// 게시판과 사람에 같은 컴포넌트를 쓰되 말은 다르게 한다 —
// 게시판을 "팔로우" 하거나 사람을 "구독" 한다고 쓰면 어색하다.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, UserMinus, UserPlus } from 'lucide-react';
import {
  fetchSubscriptionStatus,
  toggleSubscription,
  type SubscriptionTarget,
} from '../../api/social';
import { socialKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

interface Props {
  targetType: SubscriptionTarget;
  targetId: string;
  /** 버튼에 아이콘만 둘지 (좁은 자리용) */
  compact?: boolean;
}

const WORDING = {
  board: { on: '구독 중', off: '구독', doneOn: '구독했습니다.', doneOff: '구독을 해제했습니다.' },
  user: {
    on: '팔로우 중',
    off: '팔로우',
    doneOn: '팔로우했습니다.',
    doneOff: '팔로우를 해제했습니다.',
  },
} as const;

export function SubscribeButton({ targetType, targetId, compact = false }: Props) {
  const queryClient = useQueryClient();
  const key = socialKeys.subscriptionStatus(targetType, targetId);
  const words = WORDING[targetType];

  const { data: subscribed = false } = useQuery({
    queryKey: key,
    queryFn: () => fetchSubscriptionStatus(targetType, targetId),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () => toggleSubscription(targetType, targetId),
    // 누르는 즉시 반영 — 실패하면 되돌린다
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key) ?? false;
      queryClient.setQueryData(key, !previous);
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
      toast.error(getApiErrorMessage(err, '구독 처리에 실패했습니다.'));
    },
    onSuccess: next => {
      queryClient.setQueryData(key, next);
      toast.success(next ? words.doneOn : words.doneOff);
    },
    onSettled: () => {
      // 구독 목록과 프로필의 팔로워 수도 함께 맞춘다
      queryClient.invalidateQueries({ queryKey: socialKeys.subscriptions });
      queryClient.invalidateQueries({ queryKey: socialKeys.profile(targetId) });
    },
  });

  const OnIcon = targetType === 'board' ? Bell : UserMinus;
  const OffIcon = targetType === 'board' ? BellOff : UserPlus;
  const Icon = subscribed ? OnIcon : OffIcon;
  const label = subscribed ? words.on : words.off;

  return (
    <button
      type="button"
      onClick={() => mutate()}
      disabled={isPending}
      aria-pressed={subscribed}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
        subscribed
          ? 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {!compact && label}
    </button>
  );
}
