// 포인트 절반 날리기. 통하면 상대의 포인트 절반이 사라진다 — 내게 오지는 않는다.
// 성공 여부는 서버가 정하고, 여기서는 받은 결과만 보여 준다.

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bomb, Loader2 } from 'lucide-react';
import { fetchPointAttackState, halvePoints } from '../../api/points';
import { UserPicker } from '../common/UserPicker';
import type { UserSuggestion } from '../../api/users';
import { pointKeys } from '../../api/queryKeys';
import { PointsSection } from './PointsSection';
import { WinFanfare } from './WinFanfare';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

/**
 * @param myId 대상 목록에서 제외할 내 id
 * @param onSpent 포인트를 쓴 뒤 같은 화면의 잔액을 다시 읽게 한다
 */
export function HalvePanel({
  myId,
  onSpent,
  refreshSignal = 0,
}: {
  myId: string;
  onSpent?: () => void;
  /** 다른 판이 포인트를 움직이면 바뀐다. 잔액을 다시 읽는 신호. */
  refreshSignal?: number;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: pointKeys.attack, queryFn: fetchPointAttackState });
  const state = query.data ?? null;
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<UserSuggestion[]>([]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    void queryClient.invalidateQueries({ queryKey: pointKeys.attack });
  }, [refreshSignal, queryClient]);

  // 방금 던진 결과. key 를 바꿔 연달아 던져도 다시 나오게 한다.
  // 명중했을 때의 축하 연출. 끝나면 스스로 사라진다.
  const [boom, setBoom] = useState<{ name: string; lost: number } | null>(null);

  const [shot, setShot] = useState<{
    key: number;
    name: string;
    succeeded: boolean;
    lost: number;
  } | null>(null);

  /** 여러 번 던질 때 한 발씩 보여 주는 자리. 'x x o x …' 로 쌓인다. */
  const [rolling, setRolling] = useState<boolean[] | null>(null);

  const handleThrow = async (count: number) => {
    if (!state || picked.length === 0 || sending) return;
    setSending(true);
    setRolling(null);
    try {
      const result = await halvePoints(picked[0].id, count);
      const shots = result.throws;

      // 한 발씩 보여 준다. 한꺼번에 띄우면 열 번 던진 맛이 없다.
      if (shots.length > 1) {
        for (let i = 0; i < shots.length; i += 1) {
          setRolling(shots.slice(0, i + 1).map(t => t.succeeded));
          await new Promise(r => setTimeout(r, 180));
        }
      }

      const hits = shots.filter(t => t.succeeded);
      const lost = hits.reduce((sum, t) => sum + t.lost, 0);
      setShot({
        key: Date.now(),
        name: result.targetName,
        succeeded: hits.length > 0,
        lost,
      });
      // 통했을 때는 크게 터뜨린다.
      if (lost > 0) setBoom({ name: result.targetName, lost });
      if (result.stopped) toast.info(result.stopped);

      // 고른 사람은 그대로 둔다. 좀처럼 통하지 않는 공격이라 같은 사람에게 거듭 던지게 되는데,
      // 던질 때마다 비우면 매번 이름을 다시 쳐야 한다.
      // 부모가 refreshSignal 을 올리면 위의 효과가 다시 읽는다. 여기서 또 부르면
      // 같은 요청이 두 번 나간다. 부모가 없을 때만 직접 읽는다.
      if (onSpent) onSpent();
      else await queryClient.invalidateQueries({ queryKey: pointKeys.attack }).catch(() => {});
    } catch (err) {
      toast.error(getApiErrorMessage(err, '공격하지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  const soldOut = (state?.remainingToday ?? 0) <= 0;
  const affordable = (state?.balance ?? 0) >= (state?.cost ?? 0);
  const blocked = picked.length === 0 || sending || soldOut || !affordable;
  /**
   * 한 번에 던질 수 있는 수. 남은 횟수와 가진 포인트로 잘라 둔다 —
   * 못 던질 수를 적어 두면 눌러 봐야 중간에 멈춘다.
   */
  const maxBurst = state?.maxBurst ?? 1;
  const burst = Math.min(
    maxBurst,
    state?.remainingToday ?? 0,
    state && state.cost > 0 ? Math.floor(state.balance / state.cost) : maxBurst
  );

  return (
    <>
      {boom && (
        <WinFanfare
          title="💣 명중!"
          detail={`${boom.name}님의 ${boom.lost.toLocaleString()}P 증발`}
          onDone={() => setBoom(null)}
        />
      )}
      <PointsSection
        icon={<Bomb className="h-5 w-5" />}
        tone="violet"
        title="포인트 절반 날리기"
        badge={
          state ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-2xs font-semibold tabular-nums text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              오늘 {state.remainingToday}/{state.dailyLimit}
            </span>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <LoadingSpinner size="sm" message="불러오는 중..." />
        ) : query.isError || !state ? (
          <ListState>공격 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {state.successPercent}% 확률로 통합니다. 통하면 상대가 가진 포인트의{' '}
              {state.lossPercent}% 가 그대로 사라집니다 — 내게 오지는 않습니다. 빗나가도 낸 값은
              돌아오지 않습니다. 상대는 공격받은 사실만 알 뿐,{' '}
              <b>누가 걸었는지는 알 수 없습니다.</b> 하루 횟수는 퇴근 공격권과 함께 셉니다.
            </p>

            <div className="mt-3">
              <UserPicker
                selected={picked}
                onChange={setPicked}
                single
                excludeIds={[myId]}
                placeholder="던질 사람을 검색"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={blocked}
                onClick={() => void handleThrow(1)}
                className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bomb className="h-4 w-4" />
                )}
                {soldOut
                  ? '오늘은 모두 사용했어요'
                  : !affordable
                    ? '포인트가 모자랍니다'
                    : `던지기 (−${state.cost.toLocaleString()}P)`}
              </button>

              {/* 한 번씩 누르는 것이 번거로워 한 번에 여러 발. 서버에는 요청 하나로 간다. */}
              {burst > 1 && (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => void handleThrow(burst)}
                  className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Bomb className="h-4 w-4" />
                  {`x${burst} (−${(state.cost * burst).toLocaleString()}P)`}
                </button>
              )}
            </div>

            {rolling && (
              <p aria-hidden className="mt-2 flex gap-1 text-lg leading-none">
                {rolling.map((hit, i) => (
                  <span key={i} className="animate-popIn">
                    {hit ? '💥' : '·'}
                  </span>
                ))}
              </p>
            )}

            {shot && (
              <p
                key={shot.key}
                role="status"
                className={`animate-popIn mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  shot.succeeded
                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {shot.succeeded
                  ? shot.lost > 0
                    ? `명중! ${shot.name}님의 ${shot.lost.toLocaleString()}P 가 사라졌습니다.`
                    : `명중했지만 ${shot.name}님에게는 날릴 포인트가 없었습니다.`
                  : `빗나갔습니다. ${shot.name}님은 아무 일도 없었습니다.`}
              </p>
            )}
          </>
        )}
      </PointsSection>
    </>
  );
}
