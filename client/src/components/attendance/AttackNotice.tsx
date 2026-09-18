// client/src/components/attendance/AttackNotice.tsx
// 출근 화면의 공격 안내 — 한 줄.
//
// 출근은 업무 화면이다. 방어권을 사는 일(포인트를 쓰는 일)은 포인트 탭에 두고, 여기에는
// 퇴근 버튼이 왜 이상한지와 언제 풀리는지, 방어하러 갈 길만 남긴다.
// 이것마저 없으면 버튼이 도망다니거나 사라진 이유를 알 수 없어 고장으로 보인다.
//
// 공격은 쌓인다(최대 10개). 쌓인 수와 전부 풀리기까지의 시간을 함께 알린다.

import { Link } from 'react-router-dom';
import { ATTACK_FACE, ATTACK_LABEL, type IncomingAttack } from '../../api/attendance';
import { formatLeft, useCountdown } from '../../hooks/useCountdown';

export function AttackNotice({
  incoming,
  queue = [incoming],
  onExpire,
}: {
  /** 지금 걸려 있는 공격 — 줄의 맨 앞 */
  incoming: IncomingAttack;
  /** 쌓여 있는 공격 전부(맨 앞 포함). 없으면 맨 앞 하나로 본다. */
  queue?: IncomingAttack[];
  /** 맨 앞 공격이 끝나면 — 공격 상태를 다시 읽어 다음 공격으로 넘어간다 */
  onExpire: () => void;
}) {
  // 맨 앞이 끝나는 순간을 따로 센다. 전체가 끝날 때까지 기다리면 다음 공격의 종류로
  // 넘어가지 못한다(방해 다음에 숨기기가 쌓여 있을 수 있다).
  useCountdown(incoming.expiresAt, onExpire);
  const endsAt = queue[queue.length - 1]?.expiresAt ?? incoming.expiresAt;
  const totalLeft = useCountdown(endsAt);
  const count = Math.max(1, queue.length);

  return (
    <p
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    >
      <span aria-hidden>
        {ATTACK_FACE[incoming.kind]}
        {count > 1 && <span className="ml-0.5 font-semibold tabular-nums">×{count}</span>}
      </span>
      <span>
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {incoming.attackerName}
        </span>
        님의 {ATTACK_LABEL[incoming.kind]}
        {count > 1 && <span className="text-slate-500"> · {count - 1}개 대기</span>}
      </span>
      <span className="tabular-nums text-slate-500 dark:text-slate-400">
        ·{' '}
        {totalLeft > 0 ? `${count > 1 ? '전체 ' : ''}${formatLeft(totalLeft)} 남음` : '곧 풀립니다'}
      </span>
      <Link
        to="/profile?tab=points"
        className="ml-auto font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
      >
        포인트에서 방어하기 →
      </Link>
    </p>
  );
}
