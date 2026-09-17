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
      // 본문은 빼고 준다. 이 응답은 사이드바 트리와 breadcrumb 에만 쓰여
      // 제목·슬러그·부모만 있으면 되는데, 본문까지 실으면 문서가 늘어날수록
      // 위키를 열 때마다 전체 문서를 통째로 내려받게 된다.
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

      // 갱신 전 값을 들고 있는다 — page.update() 가 인스턴스를 그 자리에서 바꾸므로
      // 뒤에서 비교하려면 미리 떠 둬야 한다.
      const prevTitle = page.title;
      const prevContent = page.content ?? '';

      await page.update({ ...data, lastEditorId: editorId }, { transaction: t });

      // 실제로 달라진 경우에만 revision 을 남긴다.
      // 편집 화면은 저장할 때마다 제목·내용을 함께 보내므로, '값이 왔는가' 로 판단하면
      // 한 글자도 고치지 않은 저장이나 공개 여부만 바꾼 저장에도 같은 내용의 리비전이
      // 쌓인다 — 이력이 똑같은 줄로 채워져 어디서 무엇이 바뀌었는지 못 찾게 된다.
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
          required: false, // LEFT JOIN — 탈퇴 사용자도 이력 유지
        },
      ],
    });
  }

  // 지워진 페이지가 무엇이었는지 남길 수 있도록 식별 정보를 돌려준다.
  // sequelize.transaction 은 콜백의 반환값을 그대로 돌려주므로 따로 변수를 끌어낼 필요가 없다.
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
