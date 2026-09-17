// client/src/api/points.ts
import api from './axios';
import { unwrap } from './utils';

export interface LotteryPrize {
  amount: number;
  weight: number;
}

export interface PointStatus {
  balance: number;
  drawsToday: number;
  dailyLimit: number;
  drawsLeft: number;
  attendanceBonus: number;
  /** 한 번 뽑는 데 드는 포인트. 0 이면 공짜 */
  drawCost: number;
  /** 지금 잔액으로 한 번 더 뽑을 수 있는가 */
  canAfford: boolean;
  attendanceClaimedToday: boolean;
  /** 확률표는 공개다 — 가려 두면 신뢰할 수 없는 뽑기가 된다 */
  prizes: LotteryPrize[];
  /** 확률 합이 100 미만일 때 남는 몫(꽝) */
  blankWeight: number;
}

export interface DrawResult {
  amount: number;
  /** 이번 뽑기에 든 참가비 (0 이면 공짜) */
  cost: number;
  isBlank: boolean;
  balance: number;
  drawsToday: number;
  drawsLeft: number;
}

export interface PointEntry {
  id: number;
  amount: number;
  reason: 'lottery' | 'lottery_cost' | 'attendance' | 'admin';
  memo: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface RankingEntry {
  rank: number;
  userId: string;
  name: string;
  balance: number;
}

export interface PointRanking {
  top: RankingEntry[];
  /** 호출한 본인의 자리 — 상위권 밖이어도 늘 내려온다. 포인트가 없으면 null */
  me: RankingEntry | null;
}

export const fetchPointStatus = async (): Promise<PointStatus> =>
  unwrap(await api.get('/points/me'));

export const fetchPointRanking = async (): Promise<PointRanking> =>
  unwrap(await api.get('/points/ranking'));

export const drawLottery = async (): Promise<DrawResult> =>
  unwrap(await api.post('/points/lottery'));

export const fetchPointHistory = async (
  page = 1
): Promise<{ entries: PointEntry[]; total: number; page: number; totalPages: number }> =>
  unwrap(await api.get(`/points/history?page=${page}`));
