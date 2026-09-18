// server/src/config/duel.ts
// 포인트 대결(가위바위보)의 규칙과 기본값.
//
// 금액·시간·판 수는 코드가 아니라 관리자 설정에 있다. 여기 있는 값은 아직 아무것도
// 저장하지 않았을 때 쓰는 출발점일 뿐이다(config/lottery 와 같은 방식).
// 실제로 쓰는 값은 settingsCache 의 getDuelSettings() 에서 온다.
//
// 이 파일은 settingsCache 를 부르지 않는다 — settingsCache 가 여기 기본값을
// 가져다 쓰기 때문에, 반대로 부르면 서로를 기다리는 순환 참조가 된다.

import type { DuelHand, DuelResult } from '../models/PointDuel';

export const DUEL_HANDS = ['rock', 'paper', 'scissors'] as const;

export const DUEL_DEFAULTS = {
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
  // as const 를 붙이지 않는다. 붙이면 각 값이 리터럴 타입(10, 10000 …)으로 굳어,
  // 이 기본값으로 만든 설정 칸에 DB 에서 읽은 number 를 넣을 수 없게 된다.
  // config/lottery 의 LOTTERY_DEFAULTS 도 같은 이유로 붙이지 않았다.
};

/**
 * 입력 검증(zod)이 쓰는 절대 상한.
 *
 * zod 스키마는 서버가 뜰 때 한 번 만들어지므로 관리자가 바꾼 값을 따라갈 수 없다.
 * 그래서 스키마는 "말이 되는 범위" 만 막고, 실제로 정해진 범위는 서비스가 확인한다
 * (duel.service.create). 두 겹 중 안쪽이 진짜 규칙이다.
 */
export const DUEL_STAKE_HARD_MAX = 1_000_000;

/** 신청하며 남길 수 있는 말의 길이 */
export const DUEL_MESSAGE_MAX = 40;
/** 이긴 사람이 남길 수 있는 한마디의 길이 */
export const DUEL_TAUNT_MAX = 30;

/**
 * 한 줄 말로 다듬는다 — 제어 문자를 지우고, 줄바꿈·연속 공백을 한 칸으로 줄이고, 자른다.
 *
 * 화면(React)과 알림은 이 값을 글자로만 그리므로 HTML 을 걷어 낼 필요는 없다.
 * 줄바꿈을 남기면 알림 한 줄·도전장 말풍선이 제멋대로 늘어난다.
 * 비면 null — '말 없음' 과 '빈 말' 을 가르지 않는다.
 */
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
