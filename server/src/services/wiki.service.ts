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
      // 사이드바 트리와 breadcrumb 에만 쓰이므로 본문은 빼고 준다.
      attributes: [
        'id',
        'slug',
        'title',
        'parentId',
        'order',
        'isPublished',
        'authorId',
        'lastEditorId',
        'createdAt',
        'updatedAt',
      ],
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
        // 모델에 FK 가 없다. LOCK.UPDATE 로 부모를 잠가 동시 삭제로 고아가 생기는 것을 막는다.
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
        const parentExists = await WikiPage.findByPk(data.parentId, {
          attributes: ['id'],
          transaction: t,
        });
        if (!parentExists) {
          throw new AppError(404, '상위 페이지를 찾을 수 없습니다.');
        }
        // 상위 체인을 따라가며 순환 참조를 막는다.
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

      // page.update() 가 인스턴스를 그 자리에서 바꾸므로 갱신 전 값을 미리 떠 둔다.
      const prevTitle = page.title;
      const prevContent = page.content ?? '';

      await page.update({ ...data, lastEditorId: editorId }, { transaction: t });

      // 값이 왔는지가 아니라 실제로 달라졌는지로 판단해야 같은 내용의 리비전이 쌓이지 않는다.
      const titleChanged = page.title !== prevTitle;
      const contentChanged = (page.content ?? '') !== prevContent;
      if (titleChanged || contentChanged) {
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
          required: false, // LEFT JOIN 이라 탈퇴 사용자의 이력도 남는다
        },
      ],
    });
  }

  // 지워진 페이지가 무엇이었는지 남길 수 있도록 식별 정보를 돌려준다.
  async deletePage(slug: string): Promise<{ id: number; title: string; slug: string }> {
    return sequelize.transaction(async t => {
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
      return { id: page.id, title: page.title, slug: page.slug };
    });
  }
}

export const wikiService = new WikiService();
