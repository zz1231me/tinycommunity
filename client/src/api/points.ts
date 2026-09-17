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
  reason:
    | 'lottery'
    | 'lottery_cost'
    | 'attendance'
    | 'admin'
    | 'duel_stake'
    | 'duel_win'
    | 'duel_refund'
    | 'attack_cost'
    | 'defend_cost';
  memo: string | null;
  balanceAfter: number;
  createdAt: string;
}

// ── 포인트 대결 ────────────────────────────────────────────────────────────

export type DuelHand = 'rock' | 'paper' | 'scissors';
export type DuelStatus = 'waiting' | 'done' | 'canceled';
export type DuelResult = 'challenger' | 'opponent' | 'draw';

export interface Duel {
  id: number;
  stake: number;
  status: DuelStatus;
  result: DuelResult | null;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  /**
   * 승부가 나기 전에는 신청자 본인에게만 내려온다. 받은 쪽에서는 null 이다 —
   * 서버가 가리는 값이라 화면에서 다시 확인할 필요는 없지만, 타입이 null 을
   * 허용해야 "있겠지" 하고 쓰는 코드가 생기지 않는다.
   */
  challengerHand: DuelHand | null;
  opponentHand: DuelHand | null;
  expiresAt: string;
  settledAt: string | null;
  createdAt: string;
}

export interface DuelBoard {
  balance: number;
  rules: { minStake: number; maxStake: number; expireMinutes: number; maxOpenPerUser: number };
  /** 나에게 온 대결 */
  incoming: Duel[];
  /** 내가 건 대결 */
  outgoing: Duel[];
  /** 끝난 판 (양쪽 모두) */
  recent: Duel[];
}

export const fetchDuels = async (): Promise<DuelBoard> => unwrap(await api.get('/points/duels'));

export const createDuel = async (body: {
  opponentId: string;
  stake: number;
  hand: DuelHand;
}): Promise<Duel> => unwrap(await api.post('/points/duels', body));

export const acceptDuel = async (id: number, hand: DuelHand): Promise<Duel> =>
  unwrap(await api.post(`/points/duels/${id}/accept`, { hand }));

export const declineDuel = async (id: number): Promise<void> => {
  await api.post(`/points/duels/${id}/decline`);
};

export const cancelDuel = async (id: number): Promise<void> => {
  await api.delete(`/points/duels/${id}`);
};

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
