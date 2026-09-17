// client/src/pages/profile/parts.tsx
// 마이페이지 탭들이 함께 쓰는 작은 조각들.
//
// 목록 자리의 안내(ListState)와 달리 아이콘·재시도 버튼처럼 마이페이지에서만 쓰는
// 모양이라 공용 컴포넌트로 올리지 않았다.

export function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-slate-400">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700/60">
        {icon}
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
      ))}
    </div>
  );
}

export function RetryState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
      <p className="text-sm">데이터를 불러오지 못했습니다.</p>
      <button
        onClick={onRetry}
        className="rounded-lg border border-primary-300 px-4 py-1.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:border-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/20"
      >
        다시 시도
      </button>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-700">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
      >
        이전
      </button>
      <span className="min-w-16 text-center text-sm text-slate-600 dark:text-slate-400">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
      >
        다음
      </button>
    </div>
  );
}

/** 마이페이지 목록의 카드 껍데기 — 제목줄 + 건수 */
export function TabCard({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {count !== undefined && (
          <span className="text-sm text-slate-500 dark:text-slate-400">{count}건</span>
        )}
      </div>
      {children}
    </div>
  );
}
