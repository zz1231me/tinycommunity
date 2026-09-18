// client/src/components/attendance/AttackNotice.tsx
// 출근 화면의 공격 안내 — 한 줄.
//
// 출근은 업무 화면이다. 방어권을 사는 일(포인트를 쓰는 일)은 포인트 탭에 두고, 여기에는
// 퇴근 버튼이 왜 이상한지와 언제 풀리는지, 방어하러 갈 길만 남긴다.
// 이것마저 없으면 버튼이 도망다니거나 사라진 이유를 알 수 없어 고장으로 보인다.

import { Link } from 'react-router-dom';
import { ATTACK_FACE, ATTACK_LABEL, type IncomingAttack } from '../../api/attendance';
import { useCountdown } from '../../hooks/useCountdown';

export function AttackNotice({
  incoming,
  onExpire,
}: {
  incoming: IncomingAttack;
  /** 시간이 다 되면 — 공격 상태를 다시 읽는다 */
  onExpire: () => void;
}) {
  const left = useCountdown(incoming.expiresAt, onExpire);

  return (
    <p
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    >
      <span aria-hidden>{ATTACK_FACE[incoming.kind]}</span>
      <span>
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {incoming.attackerName}
        </span>
        님의 {ATTACK_LABEL[incoming.kind]}
      </span>
      <span className="tabular-nums text-slate-500 dark:text-slate-400">
        · {left > 0 ? `${left}초 남음` : '곧 풀립니다'}
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
