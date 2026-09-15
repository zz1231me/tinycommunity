// client/src/utils/sidebarOrder.ts
// 사이드바 게시판 목록에서 위키가 들어갈 자리.
//
// 관리자 화면은 모든 게시판을 보고, 사용자는 볼 수 있는 것만 본다. 그래서 '몇 번째'
// 로 기억하면 두 화면이 어긋난다 — 관리자가 다섯 번째에 뒀는데 게시판 셋만 보이는
// 사람에게는 맨 끝이 된다. 그래서 자리가 아니라 order 값으로 견준다.
//
// 값이 같으면 위키를 앞에 둔다. 관리자가 끌어 옮기면 서버가 게시판 order 를
// 0,1,2… 로 다시 매기고 위키는 그 사이 번호를 받는데, 정수 사이에 끼울 값이 없기
// 때문이다. (예: [A0, B1, 위키, C2] → 위키 2, 같은 2 인 C 보다 앞)

/** 정렬된 게시판 order 목록에서 위키가 들어갈 위치 */
export function wikiInsertIndex(boardOrders: number[], wikiOrder: number): number {
  const at = boardOrders.findIndex(order => order >= wikiOrder);
  return at === -1 ? boardOrders.length : at;
}
