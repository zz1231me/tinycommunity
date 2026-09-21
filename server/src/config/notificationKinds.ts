// 알림 종류와 사용자가 끌 수 있는지 여부. 저장된 값이 없으면 기본값을 쓴다.

export interface NotificationKindDefinition {
  label: string;
  description: string;
  /** 저장된 값이 없을 때 */
  defaultEnabled: boolean;
  /**
   * 사용자가 끌 수 있는 종류인지. 운영 공지(SYSTEM)는 끌 수 없다.
   */
  configurable: boolean;
}

export const NOTIFICATION_KINDS = {
  COMMENT: {
    label: '내 글의 댓글',
    description: '내가 쓴 글에 댓글이 달리면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  LIKE: {
    label: '좋아요',
    description: '내가 쓴 글이나 댓글에 좋아요가 달리면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  MENTION: {
    label: '@멘션',
    description: '누군가 본문이나 댓글에서 나를 @아이디로 부르면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  SUBSCRIPTION: {
    label: '구독·팔로우 새 글',
    description: '구독한 게시판이나 팔로우한 사람이 글을 올리면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  ASSIGNMENT: {
    label: '담당자 지정',
    description: '어떤 글의 담당자로 지정되면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  MESSAGE: {
    label: '새 다이렉트 메시지',
    description:
      '새 메시지가 오면 알립니다. 끄면 메시지함을 직접 열어 보기 전까지 새 메시지를 알 수 없습니다.',
    defaultEnabled: true,
    configurable: true,
  },
  DUEL: {
    label: '포인트 대결',
    description: '누가 나에게 대결을 신청하거나, 내가 신청한 대결의 결과가 나오면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  ATTACK: {
    label: '퇴근 공격',
    description: '누가 나에게 퇴근 공격권을 쓰거나, 내 공격을 상대가 방어하면 알립니다.',
    defaultEnabled: true,
    configurable: true,
  },
  SYSTEM: {
    label: '운영 공지',
    description: '점검·계정 관련 안내입니다. 끌 수 없습니다.',
    defaultEnabled: true,
    configurable: false,
  },
} as const satisfies Record<string, NotificationKindDefinition>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

export function isNotificationKind(key: string): key is NotificationKind {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, key);
}

export function isConfigurable(kind: NotificationKind): boolean {
  return NOTIFICATION_KINDS[kind].configurable;
}

/** 저장된 값에 기본값을 채워 완전한 상태로 만든다 */
export function resolveNotificationSettings(
  stored: Partial<Record<NotificationKind, boolean>>
): Record<NotificationKind, boolean> {
  const state = {} as Record<NotificationKind, boolean>;
  for (const kind of NOTIFICATION_KIND_KEYS) {
    const def = NOTIFICATION_KINDS[kind];
    // 끌 수 없는 종류는 저장값과 무관하게 켜진 것으로 본다.
    state[kind] = def.configurable ? (stored[kind] ?? def.defaultEnabled) : true;
  }
  return state;
}
