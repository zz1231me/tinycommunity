import axios from './axios';
import { unwrap } from './utils';
import { BoardManagerRecord, BoardWithManagers } from '../types/boardManager.types';

export async function getAllBoardsWithManagers(): Promise<BoardWithManagers[]> {
  const res = await axios.get('/board-managers/boards');
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

export async function checkIsBoardManager(boardType: string): Promise<boolean> {
  const res = await axios.get(`/board-managers/check/${boardType}`);
  const data = unwrap<{ isManager: boolean }>(res);
  return data.isManager;
}
