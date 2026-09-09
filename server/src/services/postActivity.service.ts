// server/src/services/postActivity.service.ts
// 글 하나에 일어난 일을 시간순으로 합친 기록.
//
// 세 곳에서 읽어 온다 — 기록을 한 테이블에 몰아 적지 않기 때문이다:
//   PostRevision          수정 직전 스냅샷 (누가·언제, 되돌려 볼 diff 까지)
//   PostAttachmentVersion 같은 이름으로 교체돼 밀려난 첨부 (누가·언제·무슨 파일)
//   PostActivity          상태·담당자 변경 (다른 데 흔적이 없는 것만)
// 여기에 '작성' 한 줄을 글 자체에서 만들어 맨 아래에 둔다.
//
// 접근 판정은 getPostById 에 위임한다. 비밀글 규칙을 다시 구현하면 두 곳이 어긋나
// 기록이 본문보다 느슨하게 열릴 수 있다.

import { PostRevision } from '../models/PostRevision';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { PostActivity, type PostActivityKind } from '../models/PostActivity';
import User from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { postService } from './post.service';

/**
 * 한 번에 돌려주는 줄 수.
 *
 * 오래 굴러간 글은 수정만 수십 번이다. 화면은 접힌 상태에서 몇 줄만 보여 주고
 * 펼쳐도 사람이 읽는 양은 한정적인데, 세 테이블에서 100~200줄씩 긁어 오면
 * 쓰지도 않을 자료를 매번 실어 보내게 된다. 최근 것부터 이만큼만 준다.
 */
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

/** 담당자 id 들을 이름으로 바꾸기 위한 조회 — 한 번에 모아서 한다(줄마다 조회하지 않는다) */
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
    // 판정만 필요하다 — 본문과 조인은 읽지 않는다(getPostById 의 minimal 참고)
    const access = await postService.getPostById(postId, userId, true, userRole, boardType, {
      minimal: true,
    });
    if (!access) throw new AppError(404, '게시글을 찾을 수 없습니다.');
    if (access.isLocked) throw new AppError(403, '비밀글은 잠금 해제 후 기록을 볼 수 있습니다.');

    const editorInclude = {
      model: User,
      attributes: ['id', 'name'],
      required: false, // LEFT JOIN — 탈퇴한 사람의 기록도 남는다
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

    // 최신이 위로.
    //
    // 같은 밀리초에 여러 줄이 생기는 일은 드물지 않다 — 상태와 담당자가 한 번에 바뀌면
    // 같은 트랜잭션에서 같은 시각으로 적히고, 방금 쓴 글을 곧바로 고치면 작성과 수정이
    // 붙는다. 그때 순서를 정해 두지 않으면 목록이 요청마다 뒤집힌다.
    // '작성' 은 언제나 맨 아래여야 한다: 시각이 같다는 이유로 그 위로 올라오면
    // "쓰기도 전에 고쳤다" 처럼 읽힌다.
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
      // 같은 종류끼리는 원본 id 로 — 문자열 비교는 'edited:100' 을 'edited:99' 보다
      // 앞에 두므로(자릿수 비교) 숫자로 본다
      return numericId(b.id) - numericId(a.id);
    });

    // 합친 뒤 다시 자른다 — 세 곳에서 각각 MAX_ENTRIES 를 가져왔으므로 합은 그보다 많다.
    // 다만 '작성' 은 잘려 나가면 안 된다. 글이 언제 시작됐는지가 기록의 기준점이다.
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
