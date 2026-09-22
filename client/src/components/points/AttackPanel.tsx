// 퇴근 공격권을 보내는 판. 공격 상태는 IncomingAttack·출근 화면과 같은 쿼리 키를 공유한다.

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, Loader2 } from 'lucide-react';
import {
  ATTACK_FACE,
  ATTACK_LABEL,
  fetchAttackState,
  sendAttack,
  type AttackKind,
} from '../../api/attendance';
import { attendanceKeys } from '../../api/queryKeys';
import { UserPicker } from '../common/UserPicker';
import type { UserSuggestion } from '../../api/users';
import { PointsSection } from './PointsSection';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { formatLeft } from '../../hooks/useCountdown';

// 얼굴과 이름은 받는 쪽과 같은 정의를 쓴다.
const KINDS: Array<{ kind: AttackKind; face: string; label: string; hint: string }> = [
  {
    kind: 'chaos',
    face: ATTACK_FACE.chaos,
    label: ATTACK_LABEL.chaos,
    hint: '퇴근 버튼이 카드 곳곳으로 달아나고 깜빡입니다',
  },
  {
    kind: 'hide',
    face: ATTACK_FACE.hide,
    label: ATTACK_LABEL.hide,
    hint: '퇴근 버튼이 숨고 가짜 버튼이 나타납니다',
  },
  {
    kind: 'quiz',
    face: ATTACK_FACE.quiz,
    label: ATTACK_LABEL.quiz,
    hint: '퇴근을 누르면 계산 문제를 맞혀야 합니다. 틀리면 새 문제',
  },
];

/**
 * @param myId 대상 목록에서 제외할 내 id
 * @param onSpent 포인트를 쓴 뒤 같은 화면의 잔액을 다시 읽게 한다
 */
export function AttackPanel({
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
  const query = useQuery({ queryKey: attendanceKeys.attack, queryFn: fetchAttackState });
  const state = query.data ?? null;
  // 서버 시각 − 내 시계. 시계가 어긋난 PC 에서 '언제 걸리는지' 를 잘못 말하지 않게 한다.
  const clockOffset =
    state?.now && query.dataUpdatedAt ? new Date(state.now).getTime() - query.dataUpdatedAt : 0;
  const loading = query.isLoading;
  const failed = query.isError;
  const [sending, setSending] = useState(false);

  // 다른 판에서 포인트가 움직이면 잔액을 다시 읽는다.
  useEffect(() => {
    if (refreshSignal === 0) return;
    void queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });
  }, [refreshSignal, queryClient]);

  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const [kind, setKind] = useState<AttackKind>('chaos');

  // 보낸 직후 잠깐 띄우는 명중 표시. key 를 바꿔 연달아 보내도 다시 나오게 한다.
  const [hit, setHit] = useState<{
    key: number;
    name: string;
    kind: AttackKind;
    /** 몇 초 뒤에 시작하는지. 앞에 쌓인 것이 있으면 바로 걸리지 않는다. */
    startsIn: number;
    /** 이 공격을 포함해 상대에게 쌓인 수 */
    stack: number;
  } | null>(null);
  useEffect(() => {
    if (!hit) return;
    const id = window.setTimeout(() => setHit(null), 3000);
    return () => window.clearTimeout(id);
  }, [hit]);

  const handleSend = async () => {
    if (!state || picked.length === 0 || sending) return;
    setSending(true);
    try {
      const sent = await sendAttack({ targetId: picked[0].id, kind });
      // 앞에 쌓인 것이 있으면 지금 걸리지 않으므로 시작 시각도 함께 알려 준다.
      setHit({
        key: Date.now(),
        name: picked[0].name,
        kind,
        startsIn: Math.max(
          0,
          Math.round((new Date(sent.startsAt).getTime() - (Date.now() + clockOffset)) / 1000)
        ),
        stack: sent.stack,
      });
      // 보낸 뒤에도 고른 사람을 그대로 둔다. 같은 사람에게 이어 보내는 일이 많은데,
      // 비우면 그때마다 이름을 다시 쳐야 한다.
      await queryClient.invalidateQueries({ queryKey: attendanceKeys.attack }).catch(() => {});
      onSpent?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err, '공격권을 사용하지 못했습니다.'));
    } finally {
      setSending(false);
    }
  };

  const rules = state?.rules;
  const cost = !rules ? 0 : kind === 'hide' ? rules.hideCost : rules.cost;
  const soldOut = (state?.remainingToday ?? 0) <= 0;
  const affordable = (state?.balance ?? 0) >= cost;
  const chosen = KINDS.find(k => k.kind === kind);

  return (
    <PointsSection
      icon={<Zap className="h-5 w-5" />}
      tone="rose"
      title="퇴근 공격권"
      badge={
        state && rules ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-2xs font-semibold tabular-nums text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            오늘 {state.remainingToday}/{rules.dailyLimit}
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <LoadingSpinner size="sm" message="공격권을 불러오는 중..." />
      ) : failed || !state || !rules ? (
        <ListState>공격권 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            근무 중인 사람의 퇴근 버튼을 {rules.blockSeconds}초 동안 성가시게 하거나(방해·문제 내기){' '}
            {rules.hideSeconds}초 동안 감춥니다. 기록되는 퇴근 시각은 어느 쪽이든 실제로 누른 순간
            그대로입니다. 한 사람에게 최대 {rules.maxStack}개까지 쌓이고, 쌓인 만큼 이어지며 더
            사나워집니다.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {KINDS.map(option => (
              <button
                key={option.kind}
                type="button"
                onClick={() => setKind(option.kind)}
                aria-pressed={kind === option.kind}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-sm transition-all ${
                  kind === option.kind
                    ? 'border-rose-500 bg-rose-50 font-semibold text-rose-700 shadow-sm shadow-rose-500/20 dark:bg-rose-900/30 dark:text-rose-300'
                    : 'border-slate-200 text-slate-700 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  aria-hidden
                  className={`text-2xl transition-transform ${kind === option.kind ? 'scale-110' : ''}`}
                >
                  {option.face}
                </span>
                {option.label}
                <span className="text-xs font-normal tabular-nums text-slate-400">
                  {(option.kind === 'hide' ? rules.hideCost : rules.cost).toLocaleString()}P
                </span>
              </button>
            ))}
          </div>
          {chosen && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {chosen.hint}
            </p>
          )}

          <div className="mt-3">
            <UserPicker
              selected={picked}
              onChange={setPicked}
              single
              excludeIds={[myId]}
              placeholder="공격할 사람을 검색"
            />
          </div>

          <button
            type="button"
            disabled={picked.length === 0 || sending || soldOut || !affordable}
            onClick={() => void handleSend()}
            // 옆 판의 '대결 신청' 과 같은 무게의 주 버튼
            className="btn-primary mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {soldOut
              ? '오늘은 모두 사용했어요'
              : !affordable
                ? '포인트가 모자랍니다'
                : `보내기 (−${cost.toLocaleString()}P)`}
          </button>

          {hit && (
            <p
              key={hit.key}
              role="status"
              className="animate-popIn mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <span aria-hidden className="text-lg">
                💥
              </span>
              {hit.name}님에게 명중!
              <span className="text-xs font-normal text-rose-500 dark:text-rose-400">
                {hit.startsIn > 2
                  ? `앞에 ${hit.stack - 1}개 대기 · ${formatLeft(hit.startsIn)} 뒤에 걸립니다`
                  : {
                      chaos: '퇴근 버튼이 날뛰기 시작합니다',
                      hide: '퇴근 버튼이 사라졌습니다',
                      quiz: '퇴근하려면 문제를 풀어야 합니다',
                    }[hit.kind]}
              </span>
            </p>
          )}
        </>
      )}
    </PointsSection>
  );
}
