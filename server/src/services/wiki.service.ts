import { WikiPage } from '../models/WikiPage';
import { WikiRevision } from '../models/WikiRevision';
import User from '../models/User';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/sequelize';

export class WikiService extends BaseService {
  async getPageTree(showAll = false): Promise<WikiPage[]> {
    const where = showAll ? {} : { isPublished: true };
    return WikiPage.findAll({
      where,
      order: [
        ['parentId', 'ASC'],
        ['order', 'ASC'],
        ['title', 'ASC'],
      ],
    });
  }

  async getPageBySlug(slug: string, privileged = false): Promise<WikiPage> {
    const page = await WikiPage.findOne({ where: { slug } });
    if (!page || (!page.isPublished && !privileged)) {
      throw new AppError(404, '위키 페이지를 찾을 수 없습니다.');
    }
    return page;
  }

  async createPage(
    data: {
      slug: string;
      title: string;
      content?: string;
      parentId?: number | null;
      isPublished?: boolean;
    },
    authorId: string
  ): Promise<WikiPage> {
    try {
      return await sequelize.transaction(async t => {
        // parentId가 들어오면 존재하는 페이지인지 확인 (모델에 FK 없음 — 고아 페이지 방지)
        // LOCK.UPDATE로 부모 행을 잠가, 동시에 부모가 삭제되어 고아가 생기는 레이스 방지
        if (data.parentId !== undefined && data.parentId !== null) {
          const parent = await WikiPage.findByPk(data.parentId, {
            attributes: ['id'],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!parent) {
            throw new AppError(400, '부모 위키 페이지를 찾을 수 없습니다.');
          }
        }

        const page = await WikiPage.create(
          {
            slug: data.slug,
            title: data.title,
            content: data.content || '',
            parentId: data.parentId || null,
            authorId,
            lastEditorId: authorId,
            isPublished: data.isPublished !== undefined ? data.isPublished : true,
          },
          { transaction: t }
        );
        await WikiRevision.create(
          {
            wikiPageId: page.id,
            editorId: authorId,
            title: page.title,
            content: page.content ?? '',
          },
          { transaction: t }
        );
        return page;
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, `슬러그 '${data.slug}'가 이미 사용 중입니다.`);
      }
      throw err;
    }
  }

  async updatePage(
    slug: string,
    data: Partial<{
      title: string;
      content: string;
      parentId: number | null;
      isPublished: boolean;
      order: number;
    }>,
    editorId: string
  ): Promise<WikiPage> {
    return sequelize.transaction(async t => {
      const page = await WikiPage.findOne({ where: { slug }, transaction: t, lock: t.LOCK.UPDATE });
      if (!page) throw new AppError(404, '위키 페이지를 찾을 수 없습니다.');
      if (data.parentId !== undefined && data.parentId !== null) {
        if (Number(data.parentId) === Number(page.id)) {
          throw new AppError(400, '자기 자신을 상위 페이지로 설정할 수 없습니다.');
        }
        // parentId가 실제로 존재하는 페이지인지 검증
        const parentExists = await WikiPage.findByPk(data.parentId, {
          attributes: ['id'],
          transaction: t,
        });
        if (!parentExists) {
          throw new AppError(404, '상위 페이지를 찾을 수 없습니다.');
        }
        // 간접 순환 참조 방지: 새 parentId의 상위 체인을 따라가며 현재 페이지가 나오는지 확인
        const visited = new Set<number>();
        let currentId: number | null = Number(data.parentId);
        while (currentId !== null && visited.size < 100) {
          if (visited.has(currentId)) break; // 이미 순환이 있는 기존 데이터 방어
          if (currentId === Number(page.id)) {
            throw new AppError(
              400,
              '순환 참조가 발생합니다. 해당 페이지를 상위 페이지로 설정할 수 없습니다.'
            );
          }
          visited.add(currentId);
          const ancestor: WikiPage | null = await WikiPage.findByPk(currentId, {
            attributes: ['id', 'parentId'],
            transaction: t,
          });
          if (!ancestor) break;
          currentId = ancestor.parentId ?? null;
        }
      }

      await page.update({ ...data, lastEditorId: editorId }, { transaction: t });

      // 제목 또는 내용이 변경된 경우에만 revision 저장
      if (data.content !== undefined || data.title !== undefined) {
        await WikiRevision.create(
          {
            wikiPageId: page.id,
            editorId,
            title: page.title,
            content: page.content ?? '',
          },
          { transaction: t }
        );
      }

      return page;
    });
  }

  async getPageHistory(slug: string, privileged = false): Promise<WikiRevision[]> {
    const page = await WikiPage.findOne({ where: { slug } });
    if (!page || (!page.isPublished && !privileged)) {
      throw new AppError(404, '위키 페이지를 찾을 수 없습니다.');
    }

    return WikiRevision.findAll({
      where: { wikiPageId: page.id },
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [
        {
          model: User,
          as: 'editor',
          attributes: ['id', 'name'],
          required: false, // LEFT JOIN — 탈퇴 사용자도 이력 유지
        },
      ],
    });
  }

  async deletePage(slug: string): Promise<void> {
    await sequelize.transaction(async t => {
      const page = await WikiPage.findOne({
        where: { slug },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!page) throw new AppError(404, '위키 페이지를 찾을 수 없습니다.');

      const children = await WikiPage.count({ where: { parentId: page.id }, transaction: t });
      if (children > 0)
        throw new AppError(
          400,
          '하위 페이지가 있어 삭제할 수 없습니다. 하위 페이지를 먼저 삭제하세요.'
        );

      await page.destroy({ transaction: t });
    });
  }
}

export const wikiService = new WikiService();
