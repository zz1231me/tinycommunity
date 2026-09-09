// client/src/components/social/NotificationSettings.tsx
// 알림 종류별 on/off + 내 구독 목록.
//
// 스위치를 누르면 바로 저장한다. 기능 스위치(관리자)와 달리 여기서는 한 번에
// 여러 개를 손볼 일이 드물고, "저장" 버튼을 못 눌러 설정이 안 바뀌는 쪽이
// 더 자주 겪는 문제다.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListLoading, ListError, ListState } from '../common/ListState';
import { Link } from 'react-router-dom';
import { Bell, Lock, Users } from 'lucide-react';
import {
  fetchNotificationSettings,
  fetchSubscriptions,
  saveNotificationSettings,
  toggleSubscription,
  type NotificationKindSetting,
} from '../../api/social';
import { socialKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import { useFeature } from '../../store/features';
import { toast } from '../../utils/toast';
import { ToggleSwitch } from '../common/ToggleSwitch';

function KindRow({
  kind,
  onToggle,
  pending,
}: {
  kind: NotificationKindSetting;
  onToggle: (key: string, next: boolean) => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {kind.label}
          </span>
          {!kind.configurable && (
            <span
              className="badge badge-gray inline-flex items-center gap-1"
              title="점검·계정 관련 안내라 끌 수 없습니다."
            >
              <Lock className="h-3 w-3" />
              항상 켜짐
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{kind.description}</p>
      </div>

      <ToggleSwitch
        checked={kind.enabled}
        disabled={!kind.configurable || pending}
        label={`${kind.label} 알림 받기`}
        onChange={next => onToggle(kind.key, next)}
      />
    </div>
  );
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const subscriptionsEnabled = useFeature('social.subscriptions');

  const kinds = useQuery({
    queryKey: socialKeys.notificationSettings,
    queryFn: ({ signal }) => fetchNotificationSettings(signal),
  });

  const subscriptions = useQuery({
    queryKey: socialKeys.subscriptions,
    queryFn: ({ signal }) => fetchSubscriptions(signal),
    enabled: subscriptionsEnabled,
  });

  const save = useMutation({
    mutationFn: (change: Record<string, boolean>) => saveNotificationSettings(change),
    // 스위치는 누른 즉시 움직여야 한다 — 왕복을 기다리면 눌리지 않은 줄 알고
    // 다시 누르게 되고, 그러면 두 번 토글돼 원래대로 돌아간다.
    onMutate: async change => {
      await queryClient.cancelQueries({ queryKey: socialKeys.notificationSettings });
      const previous = queryClient.getQueryData<NotificationKindSetting[]>(
        socialKeys.notificationSettings
      );
      if (previous) {
        queryClient.setQueryData<NotificationKindSetting[]>(
          socialKeys.notificationSettings,
          previous.map(k => (k.key in change ? { ...k, enabled: change[k.key] } : k))
        );
      }
      return { previous };
    },
    onError: (err, _change, context) => {
      if (context?.previous) {
        queryClient.setQueryData(socialKeys.notificationSettings, context.previous);
      }
      toast.error(getApiErrorMessage(err, '알림 설정을 저장하지 못했습니다.'));
    },
    onSuccess: () => toast.success('알림 설정을 저장했습니다.'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: socialKeys.notificationSettings });
    },
  });

  const unsubscribe = useMutation({
    mutationFn: (item: { targetType: 'board' | 'user'; targetId: string }) =>
      toggleSubscription(item.targetType, item.targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialKeys.subscriptions });
      toast.success('구독을 해제했습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '구독 해제에 실패했습니다.')),
  });

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <h3 className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Bell className="h-4 w-4" />
          알림 받기
        </h3>

        {kinds.isLoading ? (
          <ListLoading />
        ) : kinds.isError ? (
          <ListError what="알림 설정" />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {kinds.data?.map(kind => (
              <KindRow
                key={kind.key}
                kind={kind}
                pending={save.isPending}
                onToggle={(key, next) => save.mutate({ [key]: next })}
              />
            ))}
          </div>
        )}
      </section>

      {subscriptionsEnabled && (
        <section className="card overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <Users className="h-4 w-4" />
            구독·팔로우
          </h3>

          {subscriptions.isLoading ? (
            <ListLoading />
          ) : (subscriptions.data?.length ?? 0) === 0 ? (
            <ListState size="roomy">
              구독 중인 게시판이나 팔로우 중인 사람이 없습니다.
              <br />
              게시판 목록이나 프로필에서 구독할 수 있습니다.
            </ListState>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {subscriptions.data?.map(item => (
                <li
                  key={`${item.targetType}:${item.targetId}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="badge badge-gray flex-shrink-0">
                    {item.targetType === 'board' ? '게시판' : '사용자'}
                  </span>

                  <div className="min-w-0 flex-1">
                    {item.targetType === 'user' ? (
                      <Link
                        to={`/dashboard/users/${item.targetId}`}
                        className="block truncate text-sm text-slate-900 hover:text-primary-600 dark:text-slate-100 dark:hover:text-primary-400"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <Link
                        to={`/dashboard/posts/${item.targetId}`}
                        className="block truncate text-sm text-slate-900 hover:text-primary-600 dark:text-slate-100 dark:hover:text-primary-400"
                      >
                        {item.name}
                      </Link>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={unsubscribe.isPending}
                    onClick={() =>
                      unsubscribe.mutate({
                        targetType: item.targetType,
                        targetId: item.targetId,
                      })
                    }
                    className="btn-secondary flex-shrink-0 px-3 py-1 text-xs"
                  >
                    해제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
