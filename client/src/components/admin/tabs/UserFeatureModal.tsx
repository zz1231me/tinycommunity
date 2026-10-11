// 한 사람의 기능 예외. 역할 설정을 따르거나, 이 사람만 허용·차단한다.
// 사이트 전체가 꺼진 기능은 예외로도 켤 수 없어 고를 수 없게 둔다.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import {
  fetchUserFeatureRules,
  saveUserFeatureRules,
  type UserFeatureRow,
} from '../../../api/features';
import { adminKeys } from '../../../api/queryKeys';
import { getApiErrorMessage } from '../../../api/utils';
import { toast } from '../../../utils/toast';
import { ModalShell } from '../../common/ModalShell';
import { ListError, ListLoading } from '../../common/ListState';

type Choice = 'role' | 'allow' | 'deny';

const CHOICES: { key: Choice; label: string }[] = [
  { key: 'role', label: '역할 따름' },
  { key: 'allow', label: '허용' },
  { key: 'deny', label: '차단' },
];

const choiceOf = (value: boolean | null): Choice =>
  value === null ? 'role' : value ? 'allow' : 'deny';
const valueOf = (choice: Choice): boolean | null => (choice === 'role' ? null : choice === 'allow');

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function UserFeatureModal({ userId, userName, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: adminKeys.features.user(userId),
    queryFn: ({ signal }) => fetchUserFeatureRules(userId, signal),
  });
  const [draft, setDraft] = useState<Record<string, Choice>>({});
  useEffect(() => {
    if (data) setDraft({});
  }, [data]);

  const changes = useMemo(() => {
    const out: Record<string, boolean | null> = {};
    for (const row of data?.features ?? []) {
      const next = draft[row.key];
      if (next && next !== choiceOf(row.user)) out[row.key] = valueOf(next);
    }
    return out;
  }, [draft, data]);
  const dirty = Object.keys(changes).length;

  const save = useMutation({
    mutationFn: () => saveUserFeatureRules(userId, changes),
    onSuccess: next => {
      queryClient.setQueryData(adminKeys.features.user(userId), next);
      // 기능 탭의 '개인 예외 n명' 도 맞춘다
      void queryClient.invalidateQueries({ queryKey: adminKeys.features.all });
      toast.success(`${userName} 님의 기능 예외를 저장했습니다.`);
      onClose();
    },
    onError: err => toast.error(getApiErrorMessage(err, '기능 예외를 저장하지 못했습니다.')),
  });

  /** 지금 고른 값으로 이 사람이 실제로 쓸 수 있는지. 서버 결과는 저장 뒤에 다시 받는다. */
  const willBeOn = (row: UserFeatureRow, choice: Choice) => {
    if (!row.site) return false;
    if (choice === 'allow') return true;
    if (choice === 'deny') return false;
    return row.role ?? true;
  };

  return (
    <ModalShell label={`${userName} 기능 예외`} onClose={onClose} className="w-full max-w-2xl">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <SlidersHorizontal className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        <h2 className="card-title">{userName} 님의 기능 예외</h2>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <ListLoading />
        ) : isError || !data ? (
          <ListError what="기능 예외" />
        ) : data.isAdmin ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            관리자는 기능 예외를 받지 않습니다. 사이트 전체 스위치만 적용됩니다.
          </p>
        ) : (
          <>
            <p className="px-5 pt-3 text-xs text-slate-500 dark:text-slate-400">
              보통은 &lsquo;역할 따름&rsquo; 으로 두고, 이 사람만 다르게 할 때만 허용·차단을
              고릅니다. 사이트 전체에서 꺼진 기능은 예외로도 켤 수 없습니다.
            </p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.features.map(row => {
                const choice = draft[row.key] ?? choiceOf(row.user);
                const on = willBeOn(row, choice);
                return (
                  <li key={row.key} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 dark:text-slate-100">{row.label}</p>
                      <p className="text-xs text-slate-400">
                        {!row.site
                          ? '사이트 전체 꺼짐'
                          : `역할 설정: ${row.role === false ? '꺼짐' : '켜짐'}`}
                        {' · '}
                        <span
                          className={
                            on
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {on ? '쓸 수 있음' : '못 씀'}
                        </span>
                      </p>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={`${row.label} 예외`}
                      className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
                    >
                      {CHOICES.map(c => (
                        <button
                          key={c.key}
                          type="button"
                          role="radio"
                          aria-checked={choice === c.key}
                          disabled={!row.site}
                          onClick={() => setDraft(d => ({ ...d, [row.key]: c.key }))}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            choice === c.key
                              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {dirty > 0 ? `바꾼 항목 ${dirty}개` : ''}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            닫기
          </button>
          {data && !data.isAdmin && (
            <button
              type="button"
              disabled={dirty === 0 || save.isPending}
              onClick={() => save.mutate()}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save.isPending ? '저장 중…' : '저장'}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
