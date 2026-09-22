// 하루에 쓸 수 있는 공격 횟수는 퇴근 공격과 포인트 절반 날리기가 함께 쓴다.
// 두 곳에서 따로 세면 합이 제한을 넘으므로 세는 자리를 여기 하나로 둔다.

import type { Transaction } from 'sequelize';
import { AttendanceAttack } from '../models/AttendanceAttack';
import { PointAttack } from '../models/PointAttack';

/** 오늘 이 사람이 쓴 공격 횟수 (종류를 가리지 않는다) */
export async function attacksUsedToday(
  attackerId: string,
  day: string,
  t?: Transaction
): Promise<number> {
  const [attendance, points] = await Promise.all([
    AttendanceAttack.count({ where: { attackerId, workDate: day }, transaction: t }),
    PointAttack.count({ where: { attackerId, workDate: day }, transaction: t }),
  ]);
  return attendance + points;
}
