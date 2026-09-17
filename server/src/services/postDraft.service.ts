// server/src/services/postDraft.service.ts
// 작성 중인 글의 임시저장. 모든 질의는 소유자로 좁힌다 —
// 초안은 본인 외에는 관리자에게도 보이지 않아야 하는 미완성 글이다.

import { PostDraft } from '../models/PostDraft';
import Board from '../models/Board';
import { AppError } from '../middlewares/error.middleware';
import { getPostContentMaxLength, getPostTitleMaxLength } from '../utils/settingsCache';

/** 목록에 보여줄 미리보기 길이 — 본문 전체를 목록에 실어 보내지 않는다 */
const PREVIEW_LENGTH = 120;

function toPlainPreview(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

function assertWithinLimits(title: string, content: string) {
  // 초안도 결국 게시글이 되므로 같은 상한을 적용한다.
  // 여기서 막지 않으면 저장은 되는데 발행이 안 되는 글이 쌓인다.
  if (title.length > getPostTitleMaxLength()) {
    throw new AppError(400, `제목은 ${getPostTitleMaxLength()}자를 초과할 수 없습니다.`);
  }
  if (content.length > getPostContentMaxLength()) {
    throw new AppError(400, '본문이 너무 깁니다. 내용을 줄여주세요.');
  }
}

export const postDraftService = {
  /** 내 임시저장 목록 (최근에 손댄 순) */
  async list(userId: string) {
    const drafts = await PostDraft.findAll({
      where: { UserId: userId },
      order: [['updatedAt', 'DESC']],
      limit: 50,
    });

    // 게시판 이름을 붙여 준다 — 어느 게시판에 쓰던 글인지 모르면 이어 쓸 수 없다.
    const boardIds = [...new Set(drafts.map(d => d.boardType))];
    const boards = boardIds.length
      ? await Board.findAll({ where: { id: boardIds }, attributes: ['id', 'name'] })
      : [];
    const boardName = new Map(boards.map(b => [b.id, b.name]));

    return drafts.map(d => ({
      id: d.id,
      boardType: d.boardType,
      // 사라진 게시판의 초안도 목록에는 남긴다 — 내용을 복사해 갈 수 있어야 한다
      boardName: boardName.get(d.boardType) ?? null,
      title: d.title,
      preview: toPlainPreview(d.content),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  },

  /** 이어쓰기용 단건 조회 (본문 포함) */
  async get(id: string, userId: string) {
    const draft = await PostDraft.findOne({ where: { id, UserId: userId } });
    if (!draft) throw new AppError(404, '임시저장을 찾을 수 없습니다.');
    return {
      id: draft.id,
      boardType: draft.boardType,
      title: draft.title,
      content: draft.content,
      updatedAt: draft.updatedAt,
    };
  },

  async create(userId: string, boardType: string, title: string, content: string) {
    assertWithinLimits(title, content);
    const draft = await PostDraft.create({ UserId: userId, boardType, title, content });
    return { id: draft.id, updatedAt: draft.updatedAt };
  },

  async update(id: string, userId: string, title: string, content: string) {
    assertWithinLimits(title, content);
    const draft = await PostDraft.findOne({ where: { id, UserId: userId } });
    if (!draft) throw new AppError(404, '임시저장을 찾을 수 없습니다.');
    draft.title = title;
    draft.content = content;
    // 내용이 그대로여도 updatedAt 을 올린다 — 자동저장이 살아 있다는 표시이자
    // 목록의 "마지막 저장" 시각이므로 실제로 저장한 시점이어야 한다.
    draft.changed('updatedAt', true);
    await draft.save();
    return { id: draft.id, updatedAt: draft.updatedAt };
  },

  async remove(id: string, userId: string): Promise<void> {
    const deleted = await PostDraft.destroy({ where: { id, UserId: userId } });
    if (deleted === 0) throw new AppError(404, '임시저장을 찾을 수 없습니다.');
  },
};
