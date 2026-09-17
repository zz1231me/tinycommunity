// client/src/components/attendance/AttendanceAttack.tsx
// 퇴근 공격을 '받는 쪽' 의 화면 — 경고 띠와 받은 쪽지.
//
// 보내는 쪽(공격권 사용)은 포인트 화면으로 옮겼다(components/points/AttackPanel).
// 포인트를 쓰는 일이니 포인트가 있는 곳에서 하는 편이 자연스럽고, 이 화면에는
// 방해받는 당사자에게 필요한 것만 남는다.
//
// ⚠️ 방해할 뿐 막지는 않는다. 서버의 퇴근 기록은 이 기능을 쳐다보지도 않고,
// 퇴근 버튼도 끝까지 살아 있다(ChaosButton 참고). 여기서 하는 일은
// '누르기 성가시게 만드는 것' 이지 '못 누르게 하는 것' 이 아니다.

import { useEffect, useState } from 'react';
import { Shield, Swords, MessageSquareWarning, Loader2 } from 'lucide-react';
import type { IncomingAttack, IncomingPopup } from '../../api/attendance';
import { ModalShell } from '../common/ModalShell';

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/** 1초마다 남은 시간을 다시 센다. 0 이 되면 한 번만 알린다. */
function useCountdown(expiresAt: string, onDone: () => void): number {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt));

  useEffect(() => {
    setLeft(secondsLeft(expiresAt));
    const id = window.setInterval(() => {
      const next = secondsLeft(expiresAt);
      setLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
        onDone();
      }
    }, 1000);
    return () => window.clearInterval(id);
    // onDone 이 매 렌더 새 함수여도 타이머를 다시 깔지 않는다 — 시각이 기준이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return left;
}

/** 방해받는 중임을 알리고, 방어권을 살 기회를 준다 */
export function AttackBanner({
  incoming,
  defendCost,
  balance,
  defending,
  onDefend,
  onExpire,
}: {
  incoming: IncomingAttack;
  defendCost: number;
  balance: number;
  defending: boolean;
  onDefend: () => void;
  onExpire: () => void;
}) {
  const left = useCountdown(incoming.expiresAt, onExpire);
  const affordable = balance >= defendCost;

  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10"
    >
      <Swords className="h-5 w-5 flex-shrink-0 text-rose-500" />
      <p className="min-w-0 flex-1 text-sm text-rose-800 dark:text-rose-300">
        <span className="font-semibold">{incoming.attackerName}</span>님이 공격권을 사용했습니다!
        <span className="ml-1.5 tabular-nums">{left}초 동안 퇴근 버튼이 말을 안 듣습니다.</span>
      </p>
      <button
        type="button"
        onClick={onDefend}
        disabled={defending || !affordable}
        title={affordable ? undefined : '포인트가 모자랍니다'}
        className="btn-primary inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {defending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        방어권 구매 ({defendCost.toLocaleString()}P)
      </button>
    </div>
  );
}

/** 받은 쪽지 — 한 번 뜨고 닫으면 끝이다 */
export function PopupAlert({ popup, onClose }: { popup: IncomingPopup; onClose: () => void }) {
  return (
    <ModalShell label="받은 쪽지" onClose={onClose} className="w-full max-w-sm">
      <div className="p-5 text-center">
        <MessageSquareWarning className="mx-auto h-8 w-8 text-rose-500" />
        {/*
          보낸 사람을 늘 함께 보여 준다. 익명으로 남의 화면에 글을 띄울 수 있으면
          그건 장난이 아니라 괴롭힘 창구가 된다.
        */}
        <h2 className="card-title mt-3">{popup.attackerName}님의 쪽지</h2>
        {/* 글은 그대로 글로만 그린다 — 보낸 내용이 화면의 일부가 되게 두지 않는다 */}
        <p className="mt-2 break-words text-base font-medium text-slate-800 dark:text-slate-100">
          {popup.message}
        </p>
        <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">
          닫기
        </button>
      </div>
    </ModalShell>
  );
}

