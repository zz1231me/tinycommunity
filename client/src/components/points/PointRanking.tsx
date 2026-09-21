// 포인트 순위표. 상위 목록과 본인 순위를 함께 보여 주며, 같은 화면의 LotteryPanel 과 같이 useEffect 로 받아 온다.

import { useEffect, useState } from 'react';
import { Crown, Trophy } from 'lucide-react';
import { fetchPointRanking, type PointRanking as Ranking } from '../../api/points';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { Avatar } from '../Avatar';
import { PointsSection } from './PointsSection';

/**
 * 1~3 등 시상대 색. 등수(rank)로 고르므로 공동 1등이면 둘 다 금이다.
 * ring: 사진 둘레 띠 / badge: 등수 딱지 / plinth: 받침대
 */
const MEDAL = {
  1: {
    ring: 'from-amber-200 via-yellow-400 to-amber-500 shadow-lg shadow-amber-400/40',
    badge: 'from-yellow-400 to-amber-500',
    plinth:
      'from-amber-200 to-amber-50 dark:from-amber-500/40 dark:to-amber-500/5 border-amber-300 dark:border-amber-400/40',
  },
  2: {
    ring: 'from-slate-100 via-slate-300 to-slate-400 shadow-md shadow-slate-400/30',
    badge: 'from-slate-300 to-slate-500',
    plinth:
      'from-slate-200 to-slate-50 dark:from-slate-500/40 dark:to-slate-500/5 border-slate-300 dark:border-slate-500/40',
  },
  3: {
    ring: 'from-orange-200 via-amber-600 to-amber-800 shadow-md shadow-amber-700/30',
    badge: 'from-amber-600 to-amber-800',
    plinth:
      'from-orange-200 to-orange-50 dark:from-amber-700/40 dark:to-amber-700/5 border-orange-300 dark:border-amber-700/40',
  },
} as const;

/**
 * 자리별 배치와 받침대 높이.
 * 화면에는 2·1·3 순으로 놓지만(order) 문서 순서는 1·2·3 으로 둬야 낭독기가 1등부터 읽는다.
 */
const SLOT = [
  { order: 'order-2', height: 'h-20', delay: '240ms', size: 'xl' },
  { order: 'order-1', height: 'h-14', delay: '120ms', size: 'lg' },
  { order: 'order-3', height: 'h-10', delay: '0ms', size: 'lg' },
] as const;

type Entry = Ranking['top'][number];

function Podium({ entries, myId }: { entries: Entry[]; myId?: string }) {
  return (
    <ol data-testid="podium" className="mt-1 flex items-end justify-center gap-2 sm:gap-4">
      {entries.map((e, i) => {
        const slot = SLOT[i];
        const medal = MEDAL[Math.min(3, Math.max(1, e.rank)) as 1 | 2 | 3];
        const mine = e.userId === myId;
        return (
          <li
            key={e.userId}
            className={`flex w-1/3 max-w-[9rem] min-w-0 flex-col items-center ${slot.order}`}
          >
            {/* 왕관 자리는 모든 칸에 비워 둔다. 1등에만 두면 사진 높이가 어긋난다. */}
            <span className="flex h-6 items-end" aria-hidden>
              {e.rank === 1 && (
                <Crown className="h-5 w-5 fill-amber-300 text-amber-500 animate-crownFloat" />
              )}
            </span>
            <div className={`relative rounded-[11px] bg-gradient-to-br p-[3px] ${medal.ring}`}>
              <Avatar
                user={{ id: e.userId, name: e.name, avatar: e.avatar }}
                size={slot.size}
                className="ring-2 ring-white dark:ring-slate-900"
              />
              <span
                className={`absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br text-xs font-bold tabular-nums text-white ring-2 ring-white dark:ring-slate-900 ${medal.badge}`}
              >
                {e.rank}
              </span>
            </div>
            <p className="mt-2 w-full truncate text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
              {e.name}
            </p>
            {mine && (
              <span className="badge mt-0.5 bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                나
              </span>
            )}
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
              {e.balance.toLocaleString()}
              <span className="ml-0.5 font-medium text-slate-400">P</span>
            </p>
            <div
              aria-hidden
              className={`mt-2 w-full origin-bottom rounded-t-lg border border-b-0 bg-gradient-to-b animate-podiumRise ${slot.height} ${medal.plinth}`}
              style={{ animationDelay: slot.delay }}
            />
          </li>
        );
      })}
    </ol>
  );
}

function Row({
  rank,
  userId,
  name,
  avatar,
  balance,
  mine,
}: {
  rank: number;
  userId: string;
  name: string;
  avatar?: string | null;
  balance: number;
  mine: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
        mine ? 'bg-primary-50 dark:bg-primary-900/20' : ''
      }`}
    >
      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-400">
        {rank}
      </span>
      <Avatar user={{ id: userId, name, avatar }} size="sm" className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
        {name}
        {mine && <span className="ml-1.5 text-xs text-primary-600 dark:text-primary-400">나</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {balance.toLocaleString()}
        <span className="ml-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">P</span>
      </span>
    </li>
  );
}

/**
 * @param refreshSignal 값이 바뀌면 순위와 잔액을 다시 읽는다.
 */
export function PointRanking({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [data, setData] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetchPointRanking()
      .then(r => {
        if (alive) setData(r);
      })
      .catch(() => {
        // 실패와 '순위 없음' 을 구분해서 보여 준다.
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshSignal]);

  const inTop = Boolean(data?.me) && data!.top.some(t => t.userId === data!.me?.userId);

  return (
    <PointsSection
      icon={<Trophy className="h-5 w-5" />}
      tone="gold"
      title="포인트 순위"
      description="보유 포인트가 많은 순서입니다."
    >
      {loading ? (
        <LoadingSpinner size="sm" message="순위를 불러오는 중..." />
      ) : failed ? (
        <ListState>순위를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      ) : !data || data.top.length === 0 ? (
        <ListState>아직 순위가 없습니다.</ListState>
      ) : (
        <>
          <Podium entries={data.top.slice(0, 3)} myId={data.me?.userId} />

          {data.top.length > 3 && (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-700/60">
              {data.top.slice(3).map(entry => (
                <Row
                  key={entry.userId}
                  rank={entry.rank}
                  userId={entry.userId}
                  name={entry.name}
                  avatar={entry.avatar}
                  balance={entry.balance}
                  mine={entry.userId === data.me?.userId}
                />
              ))}
            </ul>
          )}

          {/* 상위 목록 밖이면 본인 자리를 따로 붙인다 */}
          {data.me && !inTop && (
            <>
              <p className="mt-2 text-center text-xs text-slate-400">⋯</p>
              <ul className="mt-1">
                <Row
                  rank={data.me.rank}
                  userId={data.me.userId}
                  name={data.me.name}
                  avatar={data.me.avatar}
                  balance={data.me.balance}
                  mine
                />
              </ul>
            </>
          )}
        </>
      )}
    </PointsSection>
  );
}
