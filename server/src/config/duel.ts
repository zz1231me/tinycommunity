// 포인트 대결 기본값. 실제 값은 settingsCache 의 getDuelSettings() 에서 온다.
// settingsCache 가 이 파일을 참조하므로 여기서 settingsCache 를 부르면 순환 참조가 된다.

import type { DuelHand, DuelResult } from '../models/PointDuel';

export const DUEL_HANDS = ['rock', 'paper', 'scissors'] as const;

export const DUEL_DEFAULTS = {
  /** 한 판에 걸 수 있는 최소 포인트 */
  minStake: 10,
  /** 한 판에 걸 수 있는 최대 포인트 */
  maxStake: 10_000,
  /** 상대가 이 시간 안에 답하지 않으면 무효가 되고 건 포인트를 돌려준다 */
  expireMinutes: 10,
  /** 한 사람이 동시에 걸어 둘 수 있는 대결 수 */
  maxOpenPerUser: 3,
  // as const 를 붙이지 않는다. 리터럴 타입으로 굳으면 DB 에서 읽은 number 를 넣을 수 없다.
};

/** 입력 검증(zod)용 절대 상한. 관리자가 정한 실제 범위는 duel.service.create 가 검사한다. */
export const DUEL_STAKE_HARD_MAX = 1_000_000;

/** 신청하며 남길 수 있는 말의 길이 */
export const DUEL_MESSAGE_MAX = 40;
/** 이긴 사람이 남길 수 있는 한마디의 길이 */
export const DUEL_TAUNT_MAX = 30;

/** 한 줄로 다듬는다. 제어 문자와 연속 공백을 한 칸으로 줄이고 max 자로 자르며, 비면 null. */
export function cleanLine(text: unknown, max: number): string | null {
  if (typeof text !== 'string') return null;
  const line = text
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return line || null;
}

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
