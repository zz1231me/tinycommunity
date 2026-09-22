// 포인트 절반 날리기 기록.
//
// 이 공격은 당한 사람에게 익명이고 되돌릴 수도 없다. 그래서 '관리자는 누가 걸었는지 안다' 가
// 익명을 감수하는 유일한 근거다 — 이 화면이 없으면 그 근거가 실제로는 없는 것이 된다.
// 한 사람만 집요하게 노리는 일도 여기 말고는 드러날 곳이 없다.

import { fetchPointAttackLog } from '../../../api/admin';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { VirtualLogTable, LogColumn } from '../common/VirtualLogTable';
import { formatDateTime } from '../../../utils/date';
import { useAdminLogQuery } from '../../../hooks/admin/useAdminLogQuery';

interface PointAttackRow {
  id: number;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  succeeded: boolean;
  cost: number;
  amountLost: number;
  createdAt: string;
}

const COLUMNS: LogColumn[] = [
  { label: '일시', width: '170px' },
  // 이름 두 칸은 폭을 정하지 않아 남는 공간을 나눠 갖는다. 여기까지 고정 폭을 주면
  // 마지막 칸이 0 으로 찌그러져 사라진 포인트가 보이지 않는다.
  { label: '던진 사람' },
  { label: '당한 사람' },
  { label: '사라진 포인트', width: '140px' },
];

const Who = ({ name, id }: { name: string; id: string }) => (
  <div className="flex flex-col">
    <span className="font-semibold">{name}</span>
    <span className="text-xs text-slate-400">{id}</span>
  </div>
);

export const PointAttackManagement = () => {
  const { records, total, totalPages, loading, error, page, goPrev, goNext } =
    useAdminLogQuery<PointAttackRow>({
      kind: 'point-attack',
      filters: {},
      fetcher: async (params, signal) => {
        const data = await fetchPointAttackLog(params, signal);
        return {
          items: data.rows ?? [],
          total: data.total ?? 0,
          totalPages: data.totalPages ?? 1,
        };
      },
    });

  if (loading && records.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="포인트 절반 날리기"
        actions={<span className="text-sm text-slate-500 dark:text-slate-400">총 {total}건</span>}
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          실제로 포인트가 사라진 건만 보여 줍니다. 당한 사람에게는 누가 걸었는지 알리지 않으며, 이
          목록은 관리자만 봅니다.
        </p>

        <VirtualLogTable
          columns={COLUMNS}
          rows={records}
          loading={loading}
          emptyMessage="아직 통한 공격이 없습니다."
          error={error}
          page={page}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
          renderRow={row => (
            <>
              <td className="admin-td whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
              <td className="admin-td whitespace-nowrap">
                <Who name={row.attackerName} id={row.attackerId} />
              </td>
              <td className="admin-td whitespace-nowrap">
                <Who name={row.targetName} id={row.targetId} />
              </td>
              <td className="admin-td whitespace-nowrap font-semibold tabular-nums">
                {row.amountLost.toLocaleString()}P
              </td>
            </>
          )}
        />
      </AdminSection>
    </div>
  );
};

export default PointAttackManagement;
