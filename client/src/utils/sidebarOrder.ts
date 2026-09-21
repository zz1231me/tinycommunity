// 관리자와 사용자가 보는 게시판 수가 달라, 위치가 아닌 order 값으로 비교한다.

/** 정렬된 게시판 order 목록에서 위키가 들어갈 위치 */
export function wikiInsertIndex(boardOrders: number[], wikiOrder: number): number {
  const at = boardOrders.findIndex(order => order >= wikiOrder);
  return at === -1 ? boardOrders.length : at;
}
