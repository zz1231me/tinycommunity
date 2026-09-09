// server/src/config/features.ts
// 관리자가 켜고 끌 수 있는 기능 목록(카탈로그).
//
// 실제로 구현되어 있고, 꺼도 나머지가 정상 동작하는 기능만 올린다.
//
// 스위치는 서버에서 강제한다(requireFeature 미들웨어). 화면에서 버튼만 숨기면
// API 를 직접 호출하는 쪽에는 제약이 걸리지 않는다.
//
// 새 기능을 추가할 때: 이 파일에 한 줄 넣고, 해당 라우트에 requireFeature 를 건다.
// 저장되지 않은 키는 여기 적힌 기본값을 쓰므로 DB 마이그레이션은 필요 없다.

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
  /**
   * 이 기능이 의미를 가지려면 함께 켜져 있어야 하는 기능들.
   * FeatureKey 가 FEATURES 에서 파생되므로 여기서 그 타입을 쓰면 순환 참조가 된다.
   * 대신 아래 assertFeatureCatalog 가 기동 시 오타를 잡는다.
   */
  requires?: readonly string[];
  /**
   * API 표면이 없어 화면에서만 적용되는 기능인지.
   *
   * 대부분의 스위치는 서버(requireFeature)에서 막지만, 표시 방식만 바꾸는 기능은
   * 막을 API 가 없다. 관리자 화면도 이 표시를 보고 "화면에만 적용" 이라고 안내한다.
   */
  clientOnly?: boolean;
}

export const FEATURES = {
  // ── 게시판 ──────────────────────────────────────────────────────────────
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

  // ── 글쓰기 ──────────────────────────────────────────────────────────────
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
    // 저장된 마크업을 카드로 그릴지 말지의 문제라 막을 API 가 없다.
    // 꺼도 이미 꽂아 둔 참조는 파일명 그대로 본문에 남는다.
    clientOnly: true,
  },
  'post.drafts': {
    label: '임시저장',
    description: '쓰다 만 글을 서버에 저장해 다른 기기에서 이어 씁니다.',
    group: 'writing',
    defaultEnabled: true,
  },

  // ── 탐색 ────────────────────────────────────────────────────────────────
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

  // ── 소통 ────────────────────────────────────────────────────────────────
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

  // ── 도구 ────────────────────────────────────────────────────────────────
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

/** requires 에 적힌 키가 실제로 존재하는지 — 오타를 조용히 넘기면 의존성이 무시된다 */
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

/**
 * 의존성을 반영한 실효 상태.
 *
 * 예를 들어 '파일 첨부' 를 끄면 '문단별 첨부' 는 저장값이 켜짐이라도 꺼진 것으로 본다.
 * 이걸 하지 않으면 관리자 화면에는 켜져 있는데 실제로는 동작하지 않는,
 * 설명할 수 없는 상태가 생긴다.
 */
export function resolveFeatures(
  stored: Partial<Record<FeatureKey, boolean>>
): Record<FeatureKey, boolean> {
  const state = defaultFeatureState();
  for (const key of FEATURE_KEYS) {
    if (stored[key] !== undefined) state[key] = stored[key] as boolean;
  }

  // 의존성은 한 단계만 두는 것을 전제로 하지 않고, 더 이상 바뀌지 않을 때까지 훑는다.
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
