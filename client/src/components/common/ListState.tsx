// client/src/components/common/ListState.tsx
// 목록 자리에 들어가는 "불러오는 중 / 실패 / 비어 있음" 안내.
//
// 같은 문구와 같은 여백을 화면마다 손으로 다시 쓰고 있었다. 마크업이 조금씩
// 달라지면 화면끼리 톤이 어긋나고, 문구를 다듬을 때 한 곳만 고쳐진다.
//
// 페이지 전체가 비어 있을 때 쓰는 PageSkeleton/PageError 와는 자리가 다르다 —
// 이건 카드나 패널 "안" 의 목록 자리를 채운다.

interface Props {
  /** 안내 문구. 여러 줄이면 ReactNode 로 넘긴다 */
  children: React.ReactNode;
  /** 위아래 여백 — 목록이 통째로 비었으면 넉넉하게(roomy) */
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

/** 불러오는 중 — 문구를 한 곳에서만 정한다 */
export function ListLoading() {
  return <ListState>불러오는 중…</ListState>;
}

/**
 * 불러오지 못함.
 * 무엇을 못 불러왔는지 밝힌다 — "오류가 발생했습니다" 만으로는
 * 화면의 어느 부분이 비어 있는지 알 수 없다.
 */
export function ListError({ what }: { what: string }) {
  return <ListState>{what}을(를) 불러오지 못했습니다.</ListState>;
}
