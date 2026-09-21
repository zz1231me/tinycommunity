// 나에게 걸린 퇴근 공격 경고 띠와 방어권 구매. 퇴근 버튼 효과와 같은 쿼리 키를 공유한다.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Loader2 } from 'lucide-react';
import {
  ATTACK_FACE,
  fetchAttackState,
  sendDefend,
  type AttackState,
  type IncomingAttack as IncomingAttackData,
} from '../../api/attendance';
import { attendanceKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { formatLeft, liveOnly, secondsLeft, useCountdown } from '../../hooks/useCountdown';
import { useAttackQueue } from '../../hooks/useAttackQueue';

/** 방해받는 중임을 알리고, 방어권을 살 기회를 준다 */
export function AttackBanner({
  incoming,
  totalSeconds,
  waiting = 0,
  next = null,
  endsAt,
  defendCost,
  balance,
  defending,
  onDefend,
  onExpire,
  clockOffset = 0,
}: {
  incoming: IncomingAttackData;
  /** 이 공격의 처음 길이(초). 남은 시간 막대의 기준이며, 없으면 첫 렌더의 남은 시간을 쓴다. */
  totalSeconds?: number;
  /** 이 공격 뒤에 쌓여 기다리는 공격 수 */
  waiting?: number;
  /** 바로 다음에 올 공격. 종류를 미리 보여 준다. */
  next?: IncomingAttackData | null;
  /** 쌓인 공격이 전부 풀리는 시각 (없으면 이 공격이 끝나는 시각) */
  endsAt?: string;
  defendCost: number;
  balance: number;
  defending: boolean;
  onDefend: () => void;
  onExpire: () => void;
  /** 서버 시각과 내 시계의 차이. 어긋난 시계에서도 서버 기준으로 센다. */
  clockOffset?: number;
}) {
  const left = useCountdown(incoming.expiresAt, onExpire, clockOffset);
  const totalLeft = useCountdown(endsAt ?? incoming.expiresAt, undefined, clockOffset);
  const affordable = balance >= defendCost;
  const [total] = useState(() =>
    Math.max(1, totalSeconds ?? secondsLeft(incoming.expiresAt, clockOffset))
  );
  const percent = Math.min(100, Math.round((left / total) * 100));

  return (
    <div
      role="status"
      // 문장에 최소 폭을 준다. min-w-0 이면 좁은 화면에서 버튼이 글자 위를 덮는다.
      className="animate-attackIn relative mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 overflow-hidden rounded-xl border border-rose-200 bg-rose-50 px-4 pb-4 pt-3 dark:border-rose-500/30 dark:bg-rose-500/10"
    >
      {/* 띠 안에서 움직이는 것은 방어 버튼의 빛 하나로 둔다 */}
      <span
        aria-hidden
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-xl dark:bg-rose-500/20"
      >
        {ATTACK_FACE[incoming.kind]}
      </span>
      {waiting > 0 && (
        <span className="-ml-2 rounded-full bg-rose-600 px-1.5 text-2xs font-bold tabular-nums text-white">
          ×{waiting + 1}
        </span>
      )}
      <p className="min-w-[12rem] flex-1 text-sm text-rose-800 dark:text-rose-300">
        <span className="font-semibold">{incoming.attackerName}</span>님이 공격권을 사용했습니다!
        <span className="ml-1.5 tabular-nums">
          {/* 0초가 된 뒤 다시 받아 오기까지 잠깐 남는다 */}
          {left > 0 ? (
            <>
              {left}초 동안 퇴근 버튼이{' '}
              {
                {
                  chaos: '말을 안 듣습니다',
                  hide: '보이지 않습니다',
                  quiz: '계산 문제를 내놓습니다',
                }[incoming.kind]
              }
              .
            </>
          ) : (
            '곧 풀립니다.'
          )}
        </span>
        {waiting > 0 && (
          <span className="mt-0.5 block text-xs tabular-nums text-rose-700/80 dark:text-rose-300/80">
            뒤에 {waiting}개 더 대기 · 전부 풀리기까지 {formatLeft(totalLeft)} · 방어권 한 장에
            하나씩 풀립니다
            {/* 다음에 무엇이 오는지 미리 보여 준다 */}
            {next && (
              <span className="ml-1">
                · 다음 <span aria-hidden>{ATTACK_FACE[next.kind]}</span>{' '}
                {{ chaos: '방해', hide: '숨기기', quiz: '문제 내기' }[next.kind]}
              </span>
            )}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onDefend}
        disabled={defending || !affordable}
        // 방어 성공 띠와 같은 초록을 쓴다. 좁은 화면에서는 아래 줄로 내려가 한 줄을 다 쓴다.
        className={`inline-flex w-full flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 ${
          affordable && !defending ? 'animate-shieldGlow' : ''
        }`}
      >
        {defending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        {/* 못 사는 이유를 글자로 둔다. 툴팁은 휴대폰에서 보이지 않는다. */}
        {affordable
          ? `방어권 구매 (${defendCost.toLocaleString()}P)`
          : `방어권 ${defendCost.toLocaleString()}P · 보유 ${balance.toLocaleString()}P 부족`}
      </button>

      {/* 남은 시간 막대. 애니메이션이 아니라 매초 바뀌는 폭이다. */}
      <div
        role="progressbar"
        aria-label="공격이 풀리기까지 남은 시간"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={left}
        className="absolute inset-x-0 bottom-0 h-1 bg-rose-200/70 dark:bg-rose-500/20"
      >
        <div
          className="h-full bg-rose-500 transition-[width] duration-1000 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** 방어 성공 직후 경고 띠 자리에 잠깐 보이는 띠. */
export function DefendedBanner({
  attackerName,
  remaining = 0,
}: {
  attackerName: string;
  /** 방어 후에도 뒤에 남은 공격 수. 0 이 아니면 퇴근 버튼은 아직 잠겨 있다. */
  remaining?: number;
}) {
  return (
    <div
      role="status"
      className="animate-fadeIn mb-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10"
    >
      <span className="relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="animate-ringBurst absolute inset-0 rounded-full bg-emerald-400/40"
        />
        <Shield className="animate-shieldPop relative h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="text-sm text-emerald-800 dark:text-emerald-300">
        <span className="font-semibold">방어 성공!</span> {attackerName}님의 공격을 막았습니다.{' '}
        {remaining > 0 ? `남은 공격 ${remaining}개가 이어집니다.` : '퇴근 버튼이 돌아왔습니다.'}
      </p>
    </div>
  );
}

/** 맨 앞이 풀린 뒤의 줄을 지금부터 다시 이어 붙인다(서버 defend 와 같은 계산). */
function shiftQueue(rest: IncomingAttackData[], now = Date.now()): IncomingAttackData[] {
  let cursor = now;
  return rest.map(q => {
    const length = new Date(q.expiresAt).getTime() - new Date(q.startsAt).getTime();
    const shifted = {
      ...q,
      startsAt: new Date(cursor).toISOString(),
      expiresAt: new Date(cursor + length).toISOString(),
    };
    cursor += length;
    return shifted;
  });
}

/** 출근 화면 맨 위. 나에게 걸린 공격이 있을 때만 보인다. */
export function IncomingAttack() {
  const queryClient = useQueryClient();
  // 재조회 주기와 알림 신호는 부모(출근 화면)가 맡는다. 여기서 또 몰면 요청이 두 번 나간다.
  const attack = useQuery({ queryKey: attendanceKeys.attack, queryFn: fetchAttackState });
  const refresh = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });

  // 방어 성공 시 경고 띠 자리에 잠깐 초록 띠를 띄운다
  const [defendedFrom, setDefendedFrom] = useState<{ name: string; remaining: number } | null>(
    null
  );
  useEffect(() => {
    if (!defendedFrom) return;
    const id = window.setTimeout(() => setDefendedFrom(null), 2600);
    return () => window.clearTimeout(id);
  }, [defendedFrom]);

  const defend = useMutation({
    mutationFn: ({ id }: { id: number; attackerName: string }) => sendDefend(id),
    onSuccess: (_data, { attackerName }) => {
      // 재조회 전에 캐시에서 먼저 지운다. 뒤에 쌓인 것은 서버와 같은 계산으로 이어 붙인다.
      let remaining = 0;
      queryClient.setQueryData<AttackState>(attendanceKeys.attack, prev => {
        if (!prev) return prev;
        const rest = shiftQueue(liveOnly(prev.queue ?? []).slice(1));
        remaining = rest.length;
        return {
          ...prev,
          queue: rest,
          incoming: rest[0] ?? null,
          balance: prev.balance - prev.rules.defendCost,
        };
      });
      void refresh();
      setDefendedFrom({ name: attackerName, remaining });
    },
    onError: err => toast.error(getApiErrorMessage(err, '방어하지 못했습니다.')),
  });

  const state = attack.data;
  // 내 시계와 서버 시계의 차이. now 가 없는 응답이면 0 으로 둔다.
  const clockOffset =
    state?.now && attack.dataUpdatedAt ? new Date(state.now).getTime() - attack.dataUpdatedAt : 0;
  // 지금 걸린 공격은 줄에서 직접 고른다. 서버가 준 incoming 은 마지막 조회 시점의 값이다.
  const { active: incoming, waiting, next, endsAt } = useAttackQueue(state, clockOffset);

  if (!defendedFrom && !(incoming && state)) return null;

  return (
    <div>
      {defendedFrom && (
        <DefendedBanner attackerName={defendedFrom.name} remaining={defendedFrom.remaining} />
      )}
      {incoming && state && (
        <AttackBanner
          // 새 공격이면 새로 그린다
          key={incoming.id}
          incoming={incoming}
          // 이 공격 자신의 길이
          totalSeconds={Math.round(
            (new Date(incoming.expiresAt).getTime() - new Date(incoming.startsAt).getTime()) / 1000
          )}
          waiting={waiting}
          next={next}
          endsAt={endsAt ?? undefined}
          defendCost={state.rules.defendCost}
          balance={state.balance}
          clockOffset={clockOffset}
          defending={defend.isPending}
          onDefend={() => defend.mutate({ id: incoming.id, attackerName: incoming.attackerName })}
          onExpire={() => void refresh()}
        />
      )}
    </div>
  );
}
