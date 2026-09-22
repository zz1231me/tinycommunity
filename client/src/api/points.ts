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
  /** 한 번 뽑는 데 드는 포인트. 0 이면 공짜. */
  drawCost: number;
  /** 지금 잔액으로 한 번 더 뽑을 수 있는가 */
  canAfford: boolean;
  attendanceClaimedToday: boolean;
  /** 확률표 */
  prizes: LotteryPrize[];
  /** 확률 합이 100 미만일 때 남는 몫(꽝) */
  blankWeight: number;
}

export interface DrawResult {
  amount: number;
  /** 이번 뽑기에 든 참가비 */
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
  /** 승부가 나기 전에는 신청자 본인에게만 내려온다. 받은 쪽에서는 null 이다. */
  challengerHand: DuelHand | null;
  opponentHand: DuelHand | null;
  expiresAt: string;
  settledAt: string | null;
  createdAt: string;
  /** 신청하며 남긴 말 */
  message: string | null;
  /** 이긴 사람이 남긴 한마디. 한 판에 한 번. */
  taunt: string | null;
}

/** 서버(config/duel)의 상한과 같아야 한다 */
export const DUEL_MESSAGE_MAX = 40;
export const DUEL_TAUNT_MAX = 30;

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
  message?: string;
}): Promise<Duel> => unwrap(await api.post('/points/duels', body));

/** 이긴 사람의 한마디. 한 판에 한 번. */
export const tauntDuel = async (id: number, message: string): Promise<Duel> =>
  unwrap(await api.post(`/points/duels/${id}/taunt`, { message }));

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
  /** 프로필 사진 주소 */
  avatar?: string | null;
  /** 1등과 본인 것만 온다. 나머지는 null — 서버가 아예 내보내지 않는다. */
  balance: number | null;
}

export interface PointRanking {
  top: RankingEntry[];
  /** 호출한 본인의 자리. 상위권 밖이어도 내려온다. */
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

export interface PointAttackState {
  /** 한 번 던지는 값. 실패해도 돌아오지 않는다. */
  cost: number;
  /** 성공 확률(%) */
  successPercent: number;
  balance: number;
  dailyLimit: number;
  /** 퇴근 공격권과 합쳐 센 오늘 사용 횟수 */
  usedToday: number;
  remainingToday: number;
}

export interface PointAttackResult {
  succeeded: boolean;
  targetName: string;
  /** 값을 낸 뒤 내 잔액 */
  balance: number;
  // 사라진 액수는 오지 않는다 — 절반을 알면 상대의 잔액을 아는 것과 같다.
}

export const fetchPointAttackState = async (): Promise<PointAttackState> =>
  unwrap(await api.get('/points/attack'));

export const halvePoints = async (targetId: string): Promise<PointAttackResult> =>
  unwrap(await api.post('/points/attack/halve', { targetId }));
