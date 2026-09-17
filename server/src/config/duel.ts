// server/src/config/duel.ts
// 포인트 대결(가위바위보)의 규칙.
//
// 승패 판정은 순수 함수로 떼어 둔다 — 포인트가 오가는 판단이라 눈으로 읽어
// 확인할 수 있어야 하고, DB 없이 그대로 시험할 수 있어야 한다.

import type { DuelHand, DuelResult } from '../models/PointDuel';

export const DUEL_HANDS = ['rock', 'paper', 'scissors'] as const;

export const DUEL_RULES = {
  /** 한 판에 걸 수 있는 최소 포인트 */
  minStake: 10,
  /** 한 판에 걸 수 있는 최대 포인트. 한 판에 전 재산이 오가지 않게 상한을 둔다. */
  maxStake: 10_000,
  /** 상대가 이 시간 안에 답하지 않으면 무효가 되고 건 포인트를 돌려준다 */
  expireMinutes: 10,
  /**
   * 한 사람이 동시에 걸어 둘 수 있는 대결 수.
   *
   * 거는 순간 포인트가 맡겨지므로 제한이 없으면 잔액을 잘게 쪼개 수십 명에게
   * 동시에 신청할 수 있다 — 받는 쪽에는 그냥 스팸이다.
   */
  maxOpenPerUser: 3,
} as const;

/** 이 손이 이기는 상대 */
const BEATS: Record<DuelHand, DuelHand> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

/** 신청자 기준 승패. a 가 신청자의 손, b 가 상대의 손이다. */
export function judge(a: DuelHand, b: DuelHand): DuelResult {
  if (a === b) return 'draw';
  return BEATS[a] === b ? 'challenger' : 'opponent';
}

export function isDuelHand(value: unknown): value is DuelHand {
  return typeof value === 'string' && (DUEL_HANDS as readonly string[]).includes(value);
}
