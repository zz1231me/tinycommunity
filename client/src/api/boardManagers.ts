import axios from './axios';
import { unwrap } from './utils';
import { BoardManagerRecord, BoardWithManagers } from '../types/boardManager.types';

export async function getAllBoardsWithManagers(): Promise<BoardWithManagers[]> {
  const res = await axios.get('/board-managers/boards');
  return unwrap(res);
}

/**
 * 게시판 한 곳의 담당자 목록.
 *
 * 전체 목록(getAllBoardsWithManagers)은 관리자 전용이고 모든 게시판을 끌어온다.
 * 게시판 관리 패널처럼 한 곳만 필요한 자리에서는 이쪽을 쓴다.
 * 서버 권한: admin · manager (게시판 담당자 본인은 조회할 수 없다)
 */
export async function getBoardManagers(boardId: string): Promise<BoardManagerRecord[]> {
  const res = await axios.get(`/board-managers/boards/${boardId}`);
  return unwrap(res);
}

export async function addBoardManager(
  boardId: string,
  userId: string
): Promise<BoardManagerRecord> {
  const res = await axios.post(`/board-managers/boards/${boardId}`, { userId });
  return unwrap(res);
}

export async function removeBoardManager(id: string): Promise<void> {
  await axios.delete(`/board-managers/${id}`);
}
