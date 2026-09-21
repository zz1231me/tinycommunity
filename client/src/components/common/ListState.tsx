// 목록 자리에 들어가는 불러오는 중·실패·비어 있음 안내. 페이지 전체에는 PageSkeleton/PageError 를 쓴다.

interface Props {
  /** 안내 문구. 여러 줄이면 ReactNode 로 넘긴다 */
  children: React.ReactNode;
  /** 위아래 여백. 목록이 통째로 비었으면 roomy. */
  size?: 'compact' | 'roomy';
}

export function ListState({ children, size = 'compact' }: Props) {
  return (
    <p
      className={`px-4 text-center text-sm text-slate-500 dark:text-slate-400 ${
        size === 'roomy' ? 'py-10' : 'py-6'
      }`}
    >
      {children}
    </p>
  );
}

export function ListLoading() {
  return <ListState>불러오는 중…</ListState>;
}

export function ListError({ what }: { what: string }) {
  return <ListState>{what}을(를) 불러오지 못했습니다.</ListState>;
}
