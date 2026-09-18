// client/src/components/points/PointRanking.tsx
// 포인트 순위표 — 상위 몇 명과, 보는 사람 본인의 자리.
//
// 상위권만 보여 주면 대부분의 사람에게는 남의 이야기가 된다. 본인이 몇 등인지
// 늘 함께 내려받아, 목록 밖에 있으면 아래에 따로 붙인다.
//
// 같은 폴더의 LotteryPanel 과 같은 방식으로 받아 온다(React Query 대신 useEffect) —
// 한 화면 안에서 방식이 갈리면 로딩·실패 처리도 따로 놀게 된다.

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { fetchPointRanking, type PointRanking as Ranking } from '../../api/points';
import { ListState } from '../common/ListState';
import { LoadingSpinner } from '../common/LoadingStates';
import { Avatar } from '../Avatar';

/** 1~3 등만 색을 준다 — 전부 칠하면 순위가 눈에 안 들어온다 */
function medal(rank: number): string {
  if (rank === 1) return 'text-amber-500';
  if (rank === 2) return 'text-slate-400';
  if (rank === 3) return 'text-amber-700';
  return 'text-slate-400';
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
      <span className={`w-6 shrink-0 text-center text-sm font-bold tabular-nums ${medal(rank)}`}>
        {rank}
      </span>
      {/* 사진이 없으면 Avatar 가 이니셜·무늬로 대신 그린다 */}
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

export function PointRanking() {
  const [data, setData] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPointRanking()
      .then(r => {
        if (alive) setData(r);
      })
      .catch(() => {
        // 실패를 '아무도 없습니다' 로 보여 주면 순위표가 비어 있는 것으로 오해한다
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const inTop = Boolean(data?.me) && data!.top.some(t => t.userId === data!.me?.userId);

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Trophy className="h-4 w-4 text-amber-500" />
        포인트 순위
      </h3>

      {loading ? (
        <LoadingSpinner size="sm" message="순위를 불러오는 중..." />
      ) : failed ? (
        <ListState>순위를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</ListState>
      ) : !data || data.top.length === 0 ? (
        <ListState>아직 순위가 없습니다.</ListState>
      ) : (
        <>
          <ul className="mt-3 space-y-1">
            {data.top.map(entry => (
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
    </div>
  );
}
