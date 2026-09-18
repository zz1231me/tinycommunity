// client/src/components/points/IncomingAttack.tsx
// 나에게 걸린 퇴근 공격 — 경고 띠, 방어권 구매, 방어 성공.
//
// 출근은 업무 화면이라 포인트를 쓰는 일은 여기(포인트 탭)에 모은다. 출근 화면에는
// 퇴근 버튼에 걸리는 효과와 안내 한 줄(attendance/AttackNotice)만 남는다.
//
// 공격 상태는 출근 화면과 같은 쿼리 키(attendanceKeys.attack)로 읽는다. 여기서 방어하면
// 출근 화면의 효과도 같은 캐시로 바로 풀린다 — 따로 읽으면 한쪽만 풀린 채 남는다.
//
// ⚠️ 방해할 뿐 막지는 않는다. 서버의 퇴근 기록은 이 기능을 쳐다보지도 않고,
// 퇴근 버튼도 끝까지 살아 있다(ChaosButton 참고).

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
import { useNotificationArrival } from '../../hooks/useNotificationArrival';

/** 방해받는 중임을 알리고, 방어권을 살 기회를 준다 */
export function AttackBanner({
  incoming,
  totalSeconds,
  waiting = 0,
  endsAt,
  defendCost,
  balance,
  defending,
  onDefend,
  onExpire,
}: {
  incoming: IncomingAttackData;
  /**
   * 이 공격이 처음에 몇 초짜리였는가 — 남은 시간 막대의 기준.
   * 주지 않으면 처음 그릴 때 남아 있던 시간을 기준으로 삼는다.
   */
  totalSeconds?: number;
  /** 이 공격 뒤에 쌓여 기다리는 공격 수 */
  waiting?: number;
  /** 쌓인 공격이 전부 풀리는 시각 (없으면 이 공격이 끝나는 시각) */
  endsAt?: string;
  defendCost: number;
  balance: number;
  defending: boolean;
  onDefend: () => void;
  onExpire: () => void;
}) {
  const left = useCountdown(incoming.expiresAt, onExpire);
  const totalLeft = useCountdown(endsAt ?? incoming.expiresAt);
  const affordable = balance >= defendCost;
  const [total] = useState(() => Math.max(1, totalSeconds ?? secondsLeft(incoming.expiresAt)));
  const percent = Math.min(100, Math.round((left / total) * 100));

  return (
    <div
      role="status"
      // 문장에 최소 폭을 준다. min-w-0 이면 문장이 한 글자 폭까지 줄어들 수 있어서, 좁은
      // 화면에서도 버튼이 아래로 내려가지 않고 남은 시간 글자 위를 덮었다(375px 에서 확인).
      className="animate-attackIn relative mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 overflow-hidden rounded-xl border border-rose-200 bg-rose-50 px-4 pb-4 pt-3 dark:border-rose-500/30 dark:bg-rose-500/10"
    >
      {/* 계속 깜빡이지 않는다. 띠 안에서 움직이는 것은 '눌러 달라' 는 방어 버튼의 빛 하나로 둔다 —
          둘이 함께 돌면 산만하고, 깜빡이는 원은 '불러오는 중' 처럼 읽힌다. */}
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
          {/* 0초가 된 뒤 서버에서 다시 받아 오기까지 잠깐 남는다. '0초 동안' 은 어색하다. */}
          {left > 0 ? (
            <>
              {left}초 동안 퇴근 버튼이{' '}
              {incoming.kind === 'hide' ? '보이지 않습니다' : '말을 안 듣습니다'}.
            </>
          ) : (
            '곧 풀립니다.'
          )}
        </span>
        {waiting > 0 && (
          <span className="mt-0.5 block text-xs tabular-nums text-rose-700/80 dark:text-rose-300/80">
            뒤에 {waiting}개 더 대기 · 전부 풀리기까지 {formatLeft(totalLeft)} · 방어권 한 장에
            하나씩 풀립니다
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onDefend}
        disabled={defending || !affordable}
        // 방어는 초록이다 — 방어 성공 띠와 같은 색. 사이트의 주 버튼(라이트 검정 · 다크 흰색)을
        // 쓰면 분홍 띠 안에서 검정/흰색 버튼이 초록 빛을 두르게 된다.
        // 좁은 화면에서는 아래 줄로 내려가 한 줄을 다 쓴다.
        className={`inline-flex w-full flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400 ${
          affordable && !defending ? 'animate-shieldGlow' : ''
        }`}
      >
        {defending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        {/* 못 사는 이유를 글자로 둔다. 툴팁은 휴대폰에서 볼 방법이 없다. */}
        {affordable
          ? `방어권 구매 (${defendCost.toLocaleString()}P)`
          : `방어권 ${defendCost.toLocaleString()}P · 보유 ${balance.toLocaleString()}P 부족`}
      </button>

      {/* 남은 시간 — 줄어드는 막대. 애니메이션이 아니라 매초 바뀌는 폭이다
          (움직임 줄이기 설정에서 애니메이션이 꺼지면 막대가 바로 비어 '끝났다' 로 읽힌다). */}
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

/**
 * 방어에 성공한 직후 잠깐 보이는 띠.
 *
 * 값을 치르고 공격을 푼 순간이 이 기능에서 제일 통쾌해야 할 때라, 토스트 한 줄로
 * 지나가지 않게 경고 띠가 있던 자리에서 초록으로 바꿔 보여 준다.
 */
export function DefendedBanner({
  attackerName,
  remaining = 0,
}: {
  attackerName: string;
  /** 방어하고도 뒤에 남은 공격 수 — 있으면 퇴근 버튼은 아직 돌아오지 않았다 */
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

/**
 * 맨 앞이 풀린 뒤의 줄을 지금부터 다시 이어 붙인다 — 각자 길이는 그대로(서버 defend 와 같은 계산).
 */
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

/**
 * 포인트 탭 맨 위 — 나에게 걸린 공격이 있을 때만 보인다.
 *
 * @param onSpent 방어권을 산 뒤 — 같은 화면의 다른 잔액 표시를 다시 불러오게 한다
 */
export function IncomingAttack({ onSpent }: { onSpent?: () => void }) {
  const queryClient = useQueryClient();
  const attack = useQuery({
    queryKey: attendanceKeys.attack,
    queryFn: fetchAttackState,
    // 걸린 공격은 저절로 풀린다. 걸려 있는 동안만 짧게 다시 묻는다.
    refetchInterval: query => (query.state.data?.incoming ? 10_000 : false),
    refetchOnWindowFocus: true,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });

  // 공격 알림이 오면 바로 다시 읽는다 — 이 탭을 보고 있는 중에 걸린 공격도 곧바로 뜬다
  useNotificationArrival(['ATTACK'], () => {
    void refresh();
  });

  // 방어에 성공하면 경고 띠 자리에 잠깐 초록 띠를 띄운다(누구의 공격을 막았는지)
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
      // 다시 읽어 오기 전에 캐시에서 먼저 공격을 지운다. 기다리는 동안 경고 띠와 살아 있는
      // 방어 버튼이 남아, 한 번 더 누르면 '이미 방어했습니다' 가 방어 성공 옆에 떴다.
      // 같은 캐시를 쓰는 출근 화면의 퇴근 버튼 효과도 이 순간 함께 풀린다.
      // 뒤에 쌓인 것은 서버와 같은 계산으로 지금부터 이어 붙인다 — 출근 화면의 효과도 이 순간
      // 다음 공격으로 넘어간다.
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
      onSpent?.();
    },
    onError: err => toast.error(getApiErrorMessage(err, '방어하지 못했습니다.')),
  });

  const state = attack.data;
  const incoming = state?.incoming ?? null;
  const queue = liveOnly(state?.queue ?? []);
  const endsAt = queue[queue.length - 1]?.expiresAt;
  // 서버가 준 만료 시각으로 직접 판단한다 — 이미 지난 공격을 아직 다시 받아 오지 않았을 수 있다
  const live = Boolean(incoming && new Date(incoming.expiresAt).getTime() > Date.now());

  if (!defendedFrom && !(incoming && live && state)) return null;

  return (
    <div>
      {defendedFrom && (
        <DefendedBanner attackerName={defendedFrom.name} remaining={defendedFrom.remaining} />
      )}
      {incoming && live && state && (
        <AttackBanner
          // 새 공격이면 새로 그린다 — 등장 연출과 남은 시간 막대의 기준이 공격마다 다르다
          key={incoming.id}
          incoming={incoming}
          // 이 공격 자신의 길이 — 줄이 당겨지거나 설정이 바뀌어도 막대가 맞다
          totalSeconds={Math.round(
            (new Date(incoming.expiresAt).getTime() - new Date(incoming.startsAt).getTime()) / 1000
          )}
          waiting={Math.max(0, queue.length - 1)}
          endsAt={endsAt}
          defendCost={state.rules.defendCost}
          balance={state.balance}
          defending={defend.isPending}
          onDefend={() => defend.mutate({ id: incoming.id, attackerName: incoming.attackerName })}
          onExpire={() => void refresh()}
        />
      )}
    </div>
  );
}
