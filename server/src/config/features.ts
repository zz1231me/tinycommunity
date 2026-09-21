// 관리자가 켜고 끌 수 있는 기능 카탈로그. 스위치는 requireFeature 미들웨어로 서버에서 강제한다.

export const FEATURE_GROUPS = {
  boards: '게시판',
  writing: '글쓰기',
  discovery: '탐색',
  social: '소통',
  tools: '도구',
} as const;

export type FeatureGroup = keyof typeof FEATURE_GROUPS;

export interface FeatureDefinition {
  label: string;
  description: string;
  group: FeatureGroup;
  /** 저장된 값이 없을 때 쓰는 값 */
  defaultEnabled: boolean;
  /** 함께 켜져 있어야 하는 선행 기능. FeatureKey 를 쓰면 순환 참조라 string 으로 둔다. */
  requires?: readonly string[];
  /** API 표면이 없어 화면에서만 적용되는 기능인지. */
  clientOnly?: boolean;
}

export const FEATURES = {
  'post.like': {
    label: '좋아요',
    description: '게시글에 좋아요를 누를 수 있습니다. 끄면 인기글 점수에도 반영되지 않습니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'post.scrap': {
    label: '스크랩',
    description: '나중에 볼 글을 개인 목록에 담아 둡니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'post.report': {
    label: '신고',
    description: '게시글·댓글을 신고해 관리자에게 알립니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'post.tags': {
    label: '태그',
    description: '게시글에 태그를 달고 태그로 걸러 봅니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'post.revisions': {
    label: '수정 이력',
    description: '게시글을 고칠 때마다 이전 내용을 남기고 비교해 볼 수 있습니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'post.tasks': {
    label: '담당자·업무 상태',
    description:
      '글에 담당자와 진행 상태(할 일·진행 중·완료)를 붙여 게시판을 업무 목록처럼 씁니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'post.readReceipts': {
    label: '읽음 확인',
    description: '공지를 누가 확인했는지 볼 수 있습니다. 작성자와 게시판 담당자만 볼 수 있습니다.',
    group: 'boards',
    defaultEnabled: true,
  },
  'comment.reactions': {
    label: '댓글 이모지 반응',
    description: '댓글에 이모지로 반응합니다. 끄면 좋아요만 남습니다.',
    group: 'boards',
    defaultEnabled: true,
  },

  'post.attachments': {
    label: '파일 첨부',
    description: '게시글에 파일을 첨부합니다. 끄면 이미 올라간 첨부는 그대로 열람됩니다.',
    group: 'writing',
    defaultEnabled: true,
  },
  'post.inlineAttachments': {
    label: '문단별 첨부(증적)',
    description: '본문 원하는 위치에 첨부를 꽂아 어느 문단의 근거인지 표시합니다.',
    group: 'writing',
    defaultEnabled: true,
    requires: ['post.attachments'],
    // 저장된 마크업을 카드로 그릴지의 문제라 막을 API 가 없다
    clientOnly: true,
  },
  'post.drafts': {
    label: '임시저장',
    description: '쓰다 만 글을 서버에 저장해 다른 기기에서 이어 씁니다.',
    group: 'writing',
    defaultEnabled: true,
  },

  'discovery.popular': {
    label: '인기글',
    description: '좋아요·댓글·조회를 합산해 읽을 만한 글을 모아 보여 줍니다.',
    group: 'discovery',
    defaultEnabled: true,
  },
  'discovery.related': {
    label: '관련 글 추천',
    description: '글 아래에 태그가 겹치는 다른 글을 보여 줍니다.',
    group: 'discovery',
    defaultEnabled: true,
  },
  'discovery.tagCloud': {
    label: '태그 클라우드',
    description: '어떤 주제가 활발한지 태그 크기로 보여 줍니다.',
    group: 'discovery',
    defaultEnabled: true,
    requires: ['post.tags'],
  },
  'search.global': {
    label: '전역 검색',
    description: '읽을 수 있는 모든 게시판을 한 번에 검색합니다.',
    group: 'discovery',
    defaultEnabled: true,
  },

  'social.mentions': {
    label: '@멘션 알림',
    description: '본문에서 @아이디로 부르면 그 사람에게 알림이 갑니다.',
    group: 'social',
    defaultEnabled: true,
  },
  'social.subscriptions': {
    label: '구독 알림',
    description: '게시판을 구독하거나 사람을 팔로우해 새 글 알림을 받습니다.',
    group: 'social',
    defaultEnabled: true,
  },
  'social.dm': {
    label: '다이렉트 메시지',
    description: '회원끼리 1:1 로 메시지를 주고받습니다. 끄면 기존 대화도 열리지 않습니다.',
    group: 'social',
    defaultEnabled: true,
  },
  'social.profiles': {
    label: '사용자 프로필',
    description: '다른 사람의 활동(작성 글·댓글)을 볼 수 있는 프로필 화면입니다.',
    group: 'social',
    defaultEnabled: true,
  },

  'tools.wiki': {
    label: '위키',
    description: '여러 사람이 함께 고치는 문서 공간입니다.',
    group: 'tools',
    defaultEnabled: true,
  },
  'tools.memo': {
    label: '메모',
    description: '나만 보는 메모장입니다.',
    group: 'tools',
    defaultEnabled: true,
  },
  'tools.calendar': {
    label: '일정',
    description: '공유 일정과 이벤트입니다.',
    group: 'tools',
    defaultEnabled: true,
  },
  'tools.lottery': {
    label: '포인트 뽑기',
    description: '하루 정해진 횟수만큼 뽑아 포인트를 얻고, 접속하면 출석 포인트를 받습니다.',
    group: 'tools',
    defaultEnabled: false,
  },
  'tools.pointDuel': {
    label: '포인트 대결',
    description:
      '포인트를 걸고 다른 사람과 가위바위보를 합니다. 건 포인트는 신청하는 순간 맡겨지고, 이긴 쪽이 두 배를 가져갑니다.',
    group: 'tools',
    defaultEnabled: false,
    // 포인트 자체가 없으면 걸 것도 없다
    requires: ['tools.lottery'],
  },
  'tools.attendance': {
    label: '출퇴근 기록',
    description: '직원이 출근·퇴근을 직접 기록하고, 관리자는 인원별 기록을 봅니다.',
    group: 'tools',
    defaultEnabled: true,
  },
  'tools.attendanceAttack': {
    label: '퇴근 공격권·방어권',
    description:
      '포인트로 공격권을 사서 남의 퇴근 버튼을 잠깐 잠급니다. 화면에서만 잠기고 기록되는 퇴근 시각은 실제로 누른 순간 그대로입니다. 받은 사람은 방어권을 사서 바로 풀 수 있습니다.',
    group: 'tools',
    defaultEnabled: false,
    // 출퇴근 기록이 없으면 잠글 버튼이 없고, 포인트가 없으면 살 수 없다
    requires: ['tools.attendance', 'tools.lottery'],
  },
  'tools.tempShare': {
    label: '임시 파일 공유',
    description: '기한이 지나면 사라지는 링크로 파일을 건네줍니다.',
    group: 'tools',
    defaultEnabled: true,
  },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURES;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureKey(key: string): key is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURES, key);
}

/** requires 에 적힌 키가 실제로 존재하는지 검증한다. */
export function assertFeatureCatalog(): void {
  for (const key of FEATURE_KEYS) {
    for (const dep of requiredKeys(key)) {
      if (!isFeatureKey(dep)) {
        throw new Error(`기능 카탈로그 오류: '${key}' 가 존재하지 않는 '${dep}' 를 요구합니다.`);
      }
    }
  }
}

/** 해당 기능이 요구하는 선행 기능들 (없으면 빈 배열) */
export function requiredKeys(key: FeatureKey): readonly string[] {
  const def = FEATURES[key] as FeatureDefinition;
  return def.requires ?? [];
}

/** 저장된 값이 하나도 없을 때의 기본 상태 */
export function defaultFeatureState(): Record<FeatureKey, boolean> {
  const state = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) state[key] = FEATURES[key].defaultEnabled;
  return state;
}

/** 의존성을 반영한 실효 상태. 선행 기능이 꺼져 있으면 저장값이 켜짐이라도 꺼짐으로 본다. */
export function resolveFeatures(
  stored: Partial<Record<FeatureKey, boolean>>
): Record<FeatureKey, boolean> {
  const state = defaultFeatureState();
  for (const key of FEATURE_KEYS) {
    if (stored[key] !== undefined) state[key] = stored[key] as boolean;
  }

  // 의존성이 여러 단계일 수 있어 더 이상 바뀌지 않을 때까지 훑는다.
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of FEATURE_KEYS) {
      if (!state[key]) continue;
      const blocked = requiredKeys(key).some(dep => isFeatureKey(dep) && !state[dep]);
      if (blocked) {
        state[key] = false;
        changed = true;
      }
    }
  }
  return state;
}
