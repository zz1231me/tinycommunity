// 글 하나의 활동 기록. 접근 판정은 getPostById 에 위임한다(비밀글 규칙을 다시 구현하면 어긋난다).

import { PostRevision } from '../models/PostRevision';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { PostActivity, type PostActivityKind } from '../models/PostActivity';
import User from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { postService } from './post.service';

/** 한 번에 돌려주는 줄 수 */
const MAX_ENTRIES = 50;

/** 화면이 그대로 그릴 수 있는 한 줄 */
export interface ActivityEntry {
  /** 같은 시각에 여러 줄이 있을 수 있어 종류+원본 id 로 구분한다 */
  id: string;
  kind: 'created' | 'edited' | 'attachment' | PostActivityKind;
  at: Date;
  actor: { id: string; name: string } | null;
  /** 수정 줄에서 diff 를 열 때 쓸 PostRevision id */
  revisionId?: number;
  /** 첨부 줄의 파일 이름 */
  fileName?: string;
  /** 상태·담당자 줄의 이전/이후 값. 담당자는 이름까지 붙여 준다 */
  from?: { value: string | null; label: string | null };
  to?: { value: string | null; label: string | null };
}

/** 담당자 id 를 이름으로 바꾼다. 줄마다 조회하지 않고 한 번에 모아서 한다 */
async function loadNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await User.findAll({ where: { id: unique }, attributes: ['id', 'name'] });
  return new Map(users.map(u => [u.id, u.name]));
}

export const postActivityService = {
  async list(
    postId: string,
    boardType: string,
    userId: string,
    userRole: string
  ): Promise<ActivityEntry[]> {
    // 판정만 필요하므로 본문과 조인은 읽지 않는다.
    const access = await postService.getPostById(postId, userId, true, userRole, boardType, {
      minimal: true,
    });
    if (!access) throw new AppError(404, '게시글을 찾을 수 없습니다.');
    if (access.isLocked) throw new AppError(403, '비밀글은 잠금 해제 후 기록을 볼 수 있습니다.');

    const editorInclude = {
      model: User,
      attributes: ['id', 'name'],
      required: false, // LEFT JOIN. 탈퇴한 사람의 기록도 남는다
    };

    const [revisions, attachments, changes] = await Promise.all([
      PostRevision.findAll({
        where: { postId },
        attributes: ['id', 'editorId', 'createdAt'],
        include: [{ ...editorInclude, as: 'editor' }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: MAX_ENTRIES,
      }),
      PostAttachmentVersion.findAll({
        where: { postId },
        attributes: ['id', 'originalName', 'uploadedBy', 'createdAt'],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: MAX_ENTRIES,
      }),
      PostActivity.findAll({
        where: { postId },
        include: [{ ...editorInclude, as: 'actor' }],
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: MAX_ENTRIES,
      }),
    ]);

    // 담당자 변경 줄의 이전/이후 이름과, 첨부를 올린 사람의 이름
    const names = await loadNames([
      ...changes
        .filter(c => c.kind === 'assignee')
        .flatMap(c => [c.fromValue, c.toValue])
        .filter((v): v is string => !!v),
      ...attachments.map(a => a.uploadedBy).filter((v): v is string => !!v),
      ...(access.post.UserId ? [access.post.UserId] : []),
    ]);

    const entries: ActivityEntry[] = [
      ...revisions.map(r => ({
        id: `edited:${r.id}`,
        kind: 'edited' as const,
        at: r.createdAt,
        actor: r.editor ? { id: r.editor.id, name: r.editor.name } : null,
        revisionId: r.id,
      })),
      ...attachments.map(a => ({
        id: `attachment:${a.id}`,
        kind: 'attachment' as const,
        at: a.createdAt,
        actor: a.uploadedBy
          ? { id: a.uploadedBy, name: names.get(a.uploadedBy) ?? a.uploadedBy }
          : null,
        fileName: a.originalName,
      })),
      ...changes.map(c => ({
        id: `${c.kind}:${c.id}`,
        kind: c.kind,
        at: c.createdAt,
        actor: c.actor ? { id: c.actor.id, name: c.actor.name } : null,
        from: { value: c.fromValue, label: labelFor(c.kind, c.fromValue, names) },
        to: { value: c.toValue, label: labelFor(c.kind, c.toValue, names) },
      })),
    ];

    // '작성' 은 항상 마지막(가장 오래된) 줄이다
    entries.push({
      id: 'created',
      kind: 'created',
      at: access.post.createdAt,
      actor: access.post.UserId
        ? {
            id: access.post.UserId,
            name: names.get(access.post.UserId) ?? access.post.author ?? '알 수 없음',
          }
        : null,
    });

    // 최신이 위로. 시각이 같아도 순서가 흔들리지 않게 종류로 순위를 주고 '작성' 은 맨 아래에 둔다.
    const rank: Record<ActivityEntry['kind'], number> = {
      created: 9, // 낮은 순위 = 아래쪽
      edited: 0,
      attachment: 1,
      status: 2,
      assignee: 3,
    };
    entries.sort((a, b) => {
      const byTime = new Date(b.at).getTime() - new Date(a.at).getTime();
      if (byTime !== 0) return byTime;
      const byKind = rank[a.kind] - rank[b.kind];
      if (byKind !== 0) return byKind;
      // 같은 종류끼리는 숫자 id 로 비교한다. 문자열 비교는 'edited:100' 을 'edited:99' 앞에 둔다.
      return numericId(b.id) - numericId(a.id);
    });

    // 세 곳에서 각각 MAX_ENTRIES 를 가져오므로 합친 뒤 다시 자른다. '작성' 줄은 남긴다.
    if (entries.length <= MAX_ENTRIES) return entries;
    const created = entries[entries.length - 1];
    return [...entries.slice(0, MAX_ENTRIES - 1), created];
  },
};

/** 'edited:12' 에서 12 를 꺼낸다. '작성' 처럼 번호가 없는 줄은 0 */
function numericId(entryId: string): number {
  const n = Number(entryId.split(':')[1]);
  return Number.isFinite(n) ? n : 0;
}

/** 담당자는 이름으로, 상태는 키 그대로(라벨은 상태 카탈로그를 가진 화면이 붙인다) */
function labelFor(
  kind: PostActivityKind,
  value: string | null,
  names: Map<string, string>
): string | null {
  if (value === null) return null;
  return kind === 'assignee' ? (names.get(value) ?? value) : value;
}
