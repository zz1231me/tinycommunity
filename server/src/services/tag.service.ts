import { Tag } from '../models/Tag';
import { PostTag } from '../models/PostTag';
import { Post } from '../models/Post';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { UniqueConstraintError, WhereOptions, Op } from 'sequelize';

export class TagService extends BaseService {
  // boardId 지정 시 해당 게시판 태그만, null이면 전체 공용 태그만, undefined면 전체
  async getAllTags(boardId?: string | null): Promise<Tag[]> {
    const where: WhereOptions = boardId !== undefined ? { boardId: boardId ?? null } : {};
    return Tag.findAll({ where, order: [['name', 'ASC']] });
  }

  async createTag(data: {
    name: string;
    color?: string;
    description?: string;
    boardId?: string | null;
  }): Promise<Tag> {
    const name = data.name.toLowerCase().trim();
    const boardId = data.boardId ?? null;
    // 전역 태그(boardId=null)는 (name, boardId) unique 인덱스가 NULL을 서로 distinct로 취급해
    // 전 DB(SQLite/MySQL/MariaDB/PG)에서 중복을 막지 못한다 → null 케이스만 사전 체크로 방지.
    if (boardId === null) {
      const existing = await Tag.findOne({ where: { name, boardId: null } });
      if (existing) {
        throw new AppError(409, `태그 '${name}'이 이미 존재합니다.`);
      }
    }
    // ✅ 보드 태그는 TOCTOU 방지를 위해 사전 체크 없이 UniqueConstraintError에 의존
    try {
      return await Tag.create({
        name,
        color: data.color || '#3b82f6',
        description: data.description,
        boardId,
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, `태그 '${name}'이 이미 존재합니다.`);
      }
      throw err;
    }
  }

  async updateTag(
    id: number,
    data: { name?: string; color?: string; description?: string }
  ): Promise<Tag> {
    const tag = await Tag.findByPk(id);
    if (!tag) throw new AppError(404, '태그를 찾을 수 없습니다.');
    const updateData = { ...data, ...(data.name ? { name: data.name.toLowerCase().trim() } : {}) };
    try {
      await tag.update(updateData);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '이미 존재하는 태그 이름입니다.');
      }
      throw err;
    }
    return tag;
  }

  async deleteTag(id: number): Promise<void> {
    const tag = await Tag.findByPk(id);
    if (!tag) throw new AppError(404, '태그를 찾을 수 없습니다.');
    await sequelize.transaction(async t => {
      await PostTag.destroy({ where: { TagId: id }, transaction: t });
      await tag.destroy({ transaction: t });
    });
  }

  async addTagsToPost(postId: string, tagIds: number[]): Promise<void> {
    // 중복 ID 제거 (UniqueConstraintError 방지)
    const uniqueTagIds = [...new Set(tagIds)];
    await sequelize.transaction(async t => {
      // 게시글 boardType 확인
      const post = await Post.findByPk(postId, { attributes: ['boardType'], transaction: t });
      if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');

      await PostTag.destroy({ where: { PostId: postId }, transaction: t });
      if (uniqueTagIds.length > 0) {
        const existingTags = await Tag.findAll({
          where: { id: { [Op.in]: uniqueTagIds } },
          attributes: ['id', 'boardId'],
          transaction: t,
        });
        if (existingTags.length !== uniqueTagIds.length) {
          throw new AppError(400, '존재하지 않는 태그 ID가 포함되어 있습니다.');
        }
        // ✅ 태그의 boardId가 게시글 boardType과 일치하거나 전역 태그(boardId=null)인지 검증
        const invalidTag = existingTags.find(
          tag => tag.boardId !== null && tag.boardId !== post.boardType
        );
        if (invalidTag) {
          throw new AppError(400, '해당 게시판에서 사용할 수 없는 태그가 포함되어 있습니다.');
        }
        await PostTag.bulkCreate(
          uniqueTagIds.map(TagId => ({ PostId: postId, TagId })),
          { transaction: t }
        );
      }
    });
  }

  async getTagsForPost(postId: string): Promise<Tag[]> {
    const postTags = await PostTag.findAll({ where: { PostId: postId } });
    if (postTags.length === 0) return [];
    const tagIds = postTags.map(pt => pt.TagId as number);
    return Tag.findAll({ where: { id: tagIds } });
  }
}

export const tagService = new TagService();
