import axios from './axios';
import { unwrap } from './utils';
import { BoardManagerRecord, BoardWithManagers } from '../types/boardManager.types';

export async function getAllBoardsWithManagers(): Promise<BoardWithManagers[]> {
  const res = await axios.get('/board-managers/boards');
  return unwrap(res);
}

/** 게시판 한 곳의 담당자 목록. 서버 권한은 admin·manager 다. */
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
