// 작성 중인 글의 임시저장. 모든 질의는 소유자로 좁힌다(관리자에게도 보이지 않는다).

import { Op } from 'sequelize';
import { PostDraft } from '../models/PostDraft';
import Board from '../models/Board';
import { AppError } from '../middlewares/error.middleware';
import { getPostContentMaxLength, getPostTitleMaxLength } from '../utils/settingsCache';

/** 목록 미리보기 길이. 본문 전체를 목록에 싣지 않는다 */
const PREVIEW_LENGTH = 120;

/**
 * 한 사람이 둘 수 있는 임시저장 수. 목록이 보여 주는 수와 같게 둔다 — 그 너머는
 * 화면에서 지울 길도 없이 본문을 통째로 쥐고 남는다. 자동 저장 중에 거절하면 쓰던
 * 글을 잃으므로, 막는 대신 가장 오래 손대지 않은 것부터 정리한다.
 */
export const MAX_DRAFTS_PER_USER = 50;

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
  if (title.length > getPostTitleMaxLength()) {
    throw new AppError(400, `제목은 ${getPostTitleMaxLength()}자를 초과할 수 없습니다.`);
  }
  if (content.length > getPostContentMaxLength()) {
    throw new AppError(400, '본문이 너무 깁니다. 내용을 줄여주세요.');
  }
}

/** 상한을 넘은 몫을 오래된 것부터 지운다. 내 것만 본다. */
async function pruneOldest(userId: string): Promise<void> {
  // 남길 것의 '목록' 이 아니라 '경계 시각' 으로 지운다.
  //
  // 처음에는 최근 50개의 id 를 읽어 두고 그 밖을 지웠다. 두 곳에서 동시에 저장하면,
  // 먼저 읽은 쪽의 목록에는 나중에 들어온 줄이 없어서 그것까지 지웠다 — 한꺼번에
  // 60개를 만들어 보니 50개가 아니라 40개만 남았다. 아직 보이던 초안이 사라진 것이다.
  //
  // 경계 시각보다 '오래된' 것만 지우면, 그 뒤에 들어온 줄은 언제나 경계보다 새것이라
  // 남의 손에 지워지지 않는다. 그 줄의 몫은 그 줄의 정리가 맡는다.
  const boundary = await PostDraft.findAll({
    where: { UserId: userId },
    // offset 을 쓰므로 2차 정렬이 있어야 경계가 흔들리지 않는다(paginationOrder 가 본다).
    order: [
      ['updatedAt', 'DESC'],
      ['id', 'DESC'],
    ],
    attributes: ['updatedAt'],
    offset: MAX_DRAFTS_PER_USER - 1,
    limit: 1,
  });
  const oldestKept = boundary[0]?.updatedAt;
  if (!oldestKept) return;

  await PostDraft.destroy({
    where: { UserId: userId, updatedAt: { [Op.lt]: oldestKept } },
    force: true,
  });
}

export const postDraftService = {
  /** 내 임시저장 목록 (최근에 손댄 순) */
  async list(userId: string) {
    const drafts = await PostDraft.findAll({
      where: { UserId: userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_DRAFTS_PER_USER,
    });

    // 어느 게시판의 글인지 알 수 있게 게시판 이름을 붙인다.
    const boardIds = [...new Set(drafts.map(d => d.boardType))];
    const boards = boardIds.length
      ? await Board.findAll({ where: { id: boardIds }, attributes: ['id', 'name'] })
      : [];
    const boardName = new Map(boards.map(b => [b.id, b.name]));

    return drafts.map(d => ({
      id: d.id,
      boardType: d.boardType,
      // 사라진 게시판의 초안도 목록에는 남긴다.
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
    await pruneOldest(userId);
    return { id: draft.id, updatedAt: draft.updatedAt };
  },

  async update(id: string, userId: string, title: string, content: string) {
    assertWithinLimits(title, content);
    const draft = await PostDraft.findOne({ where: { id, UserId: userId } });
    if (!draft) throw new AppError(404, '임시저장을 찾을 수 없습니다.');
    draft.title = title;
    draft.content = content;
    // 내용이 그대로여도 updatedAt 을 올린다. 목록의 '마지막 저장' 시각이다.
    draft.changed('updatedAt', true);
    await draft.save();
    return { id: draft.id, updatedAt: draft.updatedAt };
  },

  async remove(id: string, userId: string): Promise<void> {
    const deleted = await PostDraft.destroy({ where: { id, UserId: userId } });
    if (deleted === 0) throw new AppError(404, '임시저장을 찾을 수 없습니다.');
  },
};
