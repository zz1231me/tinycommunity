// client/src/components/points/AttackPanel.tsx
// 퇴근 공격권 — 포인트를 주고 남의 퇴근 버튼을 잠깐 성가시게 만든다.
//
// 보내는 쪽이다. 받는 쪽은 둘로 나뉜다 — 방어권 구매·경고 띠는 같은 포인트 탭 맨 위
// (IncomingAttack), 도망다니는 퇴근 버튼과 안내 한 줄은 출근 화면이다.
//
// 공격 상태는 그 둘과 같은 쿼리 키(attendanceKeys.attack)로 읽는다. 예전에는 여기만
// 따로 읽어서, 같은 탭에서 방어권을 산 뒤에도 이 판의 잔액은 그대로 남았다.
//
// ⚠️ 방해할 뿐 막지는 않는다. 서버의 퇴근 기록은 이 기능을 쳐다보지도 않고, 퇴근
// 버튼도 끝까지 살아 있다. 하는 일은 '누르기 성가시게 만드는 것' 이지 '못 누르게
// 하는 것' 이 아니다.

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
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

// 얼굴과 이름은 받는 쪽(경고 띠·출근 안내 줄)과 같은 정의다 — 보낸 것과 받은 것이 이어져 보이게.
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
];

/**
 * @param myId 나 자신은 고를 수 없게 빼기 위한 것
 * @param onSpent 포인트를 쓴 뒤 — 같은 화면의 잔액 표시를 다시 불러오게 한다
 */
export function AttackPanel({
  myId,
  onSpent,
  refreshSignal = 0,
}: {
  myId: string;
  onSpent?: () => void;
  /** 같은 화면의 다른 판이 포인트를 움직이면 바뀐다 — 잔액을 다시 읽는다 */
  refreshSignal?: number;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: attendanceKeys.attack, queryFn: fetchAttackState });
  const state = query.data ?? null;
  const loading = query.isLoading;
  // 실패를 빈 화면으로 두면 '공격권 기능이 없는 화면' 처럼 보인다
  const failed = query.isError;
  const [sending, setSending] = useState(false);

  // 다른 판(뽑기·대결)에서 포인트가 움직이면 잔액을 다시 읽는다. 이것이 없어서 대결에서
  // 이겨 포인트가 생겨도 여기 버튼은 '포인트가 모자랍니다' 로 막혀 있었다.
  useEffect(() => {
    if (refreshSignal === 0) return;
    void queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });
  }, [refreshSignal, queryClient]);

  const [picked, setPicked] = useState<UserSuggestion[]>([]);
  const [kind, setKind] = useState<AttackKind>('chaos');

  // 보낸 직후 잠깐 띄우는 '명중' 표시. 토스트 한 줄로는 보낸 맛이 없다.
  // key 를 함께 둬서 같은 사람에게 연달아 보내도 매번 다시 튀어나오게 한다.
  const [hit, setHit] = useState<{ key: number; name: string; kind: AttackKind } | null>(null);
  useEffect(() => {
    if (!hit) return;
    const id = window.setTimeout(() => setHit(null), 3000);
    return () => window.clearTimeout(id);
  }, [hit]);

  const handleSend = async () => {
    if (!state || picked.length === 0 || sending) return;
    setSending(true);
    try {
      await sendAttack({ targetId: picked[0].id, kind });
      setHit({ key: Date.now(), name: picked[0].name, kind });
      // 보내진 뒤에만 비운다. 한도 초과·포인트 부족처럼 거절당하는 길이 여럿이라,
      // 미리 비우면 그때마다 상대를 다시 찾아야 한다.
      setPicked([]);
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
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {/* 대결(⚔️)과 같은 아이콘을 쓰면 옆 판과 구분되지 않는다 */}
        <Zap className="h-4 w-4 text-rose-500" />
        퇴근 공격권
      </h3>

      {loading ? (
        <LoadingSpinner size="sm" message="공격권을 불러오는 중..." />
      ) : failed || !state || !rules ? (
        <ListState>공격권 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            근무 중인 사람의 퇴근 버튼을 {rules.blockSeconds}초 동안 성가시게 하거나{' '}
            {rules.hideSeconds}초 동안 감춥니다. 기록되는 퇴근 시각은 어느 쪽이든 실제로 누른 순간
            그대로입니다. 한 사람에게 최대 {rules.maxStack}개까지 쌓이고, 쌓인 만큼 이어지며 더
            사나워집니다. 오늘 {state.remainingToday}/{rules.dailyLimit}번 남았습니다.
          </p>

          <div className="mt-3 flex gap-1.5">
            {KINDS.map(option => (
              <button
                key={option.kind}
                type="button"
                onClick={() => setKind(option.kind)}
                aria-pressed={kind === option.kind}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  kind === option.kind
                    ? 'border-rose-500 bg-rose-50 font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <span aria-hidden className="mr-1">
                  {option.face}
                </span>
                {option.label}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {(option.kind === 'hide' ? rules.hideCost : rules.cost).toLocaleString()}P
                </span>
              </button>
            ))}
          </div>
          {chosen && <p className="mt-1.5 text-xs text-slate-500">{chosen.hint}</p>}

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
            // 옆 판의 '대결 신청' 과 같은 무게의 주 버튼이다. 한 화면의 핵심 버튼들이
            // 서로 다른 무게면 어느 쪽이 중요한지 헷갈린다.
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
                {hit.kind === 'hide' ? '퇴근 버튼이 사라졌습니다' : '퇴근 버튼이 날뛰기 시작합니다'}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
