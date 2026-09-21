import { Op, literal, WhereOptions } from 'sequelize';
import { Post, Attachment, PostInstance } from '../models/Post';
import { User } from '../models/User';
import { Board } from '../models/Board';
import { BoardManager } from '../models/BoardManager';
import { Tag } from '../models/Tag';
import { ROLES } from '../config/constants';
import {
  getPostTitleMaxLength,
  getPostContentMaxLength,
  getPostSecretPasswordMinLength,
  getBcryptRounds,
  getSettings,
} from '../utils/settingsCache';
import { BoardAccess } from '../models/BoardAccess';
import { Comment } from '../models/Comment';
import { PostLike } from '../models/PostLike';
import { PostTag } from '../models/PostTag';
import { PostRead } from '../models/PostRead';
import { CommentLike } from '../models/CommentLike';
import { Notification } from '../models/Notification';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { logError } from '../utils/logger';
import { shouldCountView } from '../utils/cache';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { deleteThumbnail } from './thumbnail.service';
import { PostRevision } from '../models/PostRevision';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { getAccessibleBoardTypes } from './accessibleBoards';
import type { WorkStatus } from '../config/workStatus';

export interface SearchPostsParams {
  userId: string;
  userRole: string;
  searchTerm: string;
}

export interface CreatePostParams {
  title: string;
  content: string;
  boardType: string;
  authorName: string;
  userId: string;
  files?: Express.Multer.File[];
  originalFilenames?: string;
  isSecret?: boolean;
  secretType?: 'password' | 'users';
  secretPassword?: string;
  secretUserIds?: string[];
  isEncrypted?: boolean;
  secretSalt?: string;
}

export interface UpdatePostParams {
  postId: string;
  expectedBoardType?: string;
  /** 이동할 대상 게시판 ID (현재와 다르면 게시판 이동) */
  targetBoardType?: string;
  title: string;
  content: string;
  userId: string;
  userRole: string;
  files?: Express.Multer.File[];
  keepExistingFiles?: string;
  originalFilenames?: string;
  deletedFileNames?: string;
  isSecret?: boolean;
  secretType?: 'password' | 'users' | null;
  secretPassword?: string | null;
  secretUserIds?: string[] | null;
  isEncrypted?: boolean;
  secretSalt?: string | null;
}

/**
 * multipart 헤더에서 깨진 파일명을 되돌린다.
 * busboy(multer)가 파일명을 latin1 로 읽어 한글이 깨진다. 클라이언트의 originalFilenames 가 없을 때의 2차 방어.
 * 되돌린 값을 다시 latin1 로 인코딩해 원본과 같을 때만 바꾼다.
 */
function repairMultipartFilename(name: string | undefined): string | undefined {
  if (!name || !/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded.includes('\ufffd')) return name;
  return Buffer.from(decoded, 'utf8').toString('latin1') === name ? decoded : name;
}

export interface LockedPostMeta {
  isLocked: true;
  id: string;
  title: string; // 목록에서 이미 노출되는 정보이므로 허용
  boardType: string;
  secretType: 'password';
  isEncrypted: boolean;
  // E2EE 게시물: 서버도 복호화 불가이므로 ciphertext 노출 허용
  ciphertext?: string;
  secretSalt?: string | null;
  // author/createdAt은 비밀번호 없이 노출하지 않음
}

/**
 * 고정 만료 스윕 주기. 목록 조회마다 UPDATE 를 내보내지 않기 위한 것으로, 만료 반영이 그만큼 늦을 수 있다.
 */
const SWEEP_INTERVAL_MS = 60_000;
let lastPinSweepAt = 0;

/**
 * 스윕 주기를 초기화한다. 테스트 전용.
 */
export function resetPinSweepThrottle(): void {
  lastPinSweepAt = 0;
}

export class PostService extends BaseService {
  private deleteFileIfExists(filename: string, storagePath?: string): void {
    try {
      const uploadsRoot = path.resolve(process.cwd(), 'uploads');
      let filePath: string;
      if (storagePath) {
        // storagePath가 제공된 경우: 절대 경로 또는 /uploads/... 상대 경로
        if (path.isAbsolute(storagePath)) {
          filePath = path.resolve(storagePath);
        } else {
          // /uploads/files/xxx 또는 /uploads/images/xxx 형태
          filePath = path.resolve(
            process.cwd(),
            storagePath.startsWith('/') ? storagePath.slice(1) : storagePath
          );
        }
      } else {
        // 하위 호환: filename만으로 files 디렉토리 검색
        filePath = path.resolve(process.cwd(), 'uploads/files', filename);
      }
      // 경로 탈출(path traversal) 방지: uploads/ 디렉토리 내부만 허용
      if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
        logError(`파일 삭제 거부 (경계 이탈): ${filePath}`);
        return;
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // 지연 생성된 썸네일 캐시도 함께 정리(없으면 무시)
      void deleteThumbnail(path.basename(filePath));
    } catch (error) {
      logError(`파일 삭제 실패: ${filename}`, error);
    }
  }

  private parseAttachments(rawValue: Attachment[] | string | null | undefined): Attachment[] {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) return rawValue;

    if (typeof rawValue === 'string') {
      try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        logError('JSON 파싱 실패', error);
        return [];
      }
    }
    return [];
  }

  /**
   * 첨부의 표시 이름을 정한다.
   * multipart 헤더의 한글 파일명이 깨지므로 클라이언트가 보낸 originalFilenames 를 우선 쓰고,
   * 없으면 file.originalname, 그것도 없으면 file_1 같은 번호를 붙인다.
   */
  private parseOriginalNames(originalFilenames: string | undefined, files: Express.Multer.File[]) {
    if (originalFilenames) {
      try {
        const parsed: unknown = JSON.parse(originalFilenames);
        if (Array.isArray(parsed)) return parsed as string[];
      } catch (_error) {
        // 파싱 실패 시 아래 폴백
      }
    }
    return files.map((file, i) => repairMultipartFilename(file.originalname) || `file_${i + 1}`);
  }

  private formatAttachments(rawValue: Attachment[] | string | null | undefined) {
    return this.parseAttachments(rawValue).map(file => ({
      url: `/api/uploads/download/${file.filename}?originalName=${encodeURIComponent(file.originalname)}`,
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size || 0,
      mimeType: file.mimetype || 'application/octet-stream',
    }));
  }

  // 접근 가능한 게시판들의 최신 게시글 (헤더 드롭다운용). 비밀글은 작성자 본인만.
  async getRecentPosts(userId: string, userRole: string, limit = 8) {
    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (boardTypes.length === 0) return [];
    // 최근 7일 이내 게시글만 노출
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const posts = await Post.findAll({
      where: {
        boardType: { [Op.in]: boardTypes },
        status: 'published',
        createdAt: { [Op.gte]: weekAgo },
        [Op.or]: [{ isSecret: false }, { isSecret: true, UserId: userId }],
      },
      include: [
        { model: User, as: 'user', attributes: ['id', 'name'], required: false },
        { model: Board, as: 'board', attributes: ['name'], required: false },
      ],
      attributes: [
        'id',
        'title',
        'boardType',
        'createdAt',
        'isSecret',
        // 확인(열람) 여부 — PostReads에 (post,user) 기록이 있으면 읽음
        [
          literal(
            `EXISTS(SELECT 1 FROM PostReads AS pr WHERE pr.PostId = Post.id AND pr.UserId = ${sequelize.escape(userId)})`
          ),
          'isRead',
        ],
      ],
      order: [['createdAt', 'DESC']],
      limit: Math.min(Math.max(1, limit), 20),
    });
    return posts.map(p => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plain = p.get({ plain: true }) as any;
      return {
        id: plain.id,
        title: plain.title,
        boardType: plain.boardType,
        boardName: plain.board?.name ?? plain.boardType,
        authorName: plain.user?.name ?? '알 수 없음',
        isSecret: !!plain.isSecret,
        isRead: Boolean(plain.isRead),
        createdAt: plain.createdAt,
      };
    });
  }

  async getPosts(
    boardType: string,
    page: number = 1,
    limit: number = 10,
    search: string = '',
    userId?: string,
    tagIds?: number[],
    workStatuses?: WorkStatus[]
  ) {
    const andConditions: (ReturnType<typeof literal> | WhereOptions<PostInstance>)[] = [];

    // 업무 상태 필터 — "지금 진행 중인 것만" 을 보려는 요청이 가장 흔하다
    if (workStatuses && workStatuses.length > 0) {
      andConditions.push({ workStatus: { [Op.in]: workStatuses } });
    }

    if (tagIds && tagIds.length > 0) {
      // sequelize.escape()로 각 ID를 이스케이프하여 파라미터화된 쿼리와 동등한 안전성 확보
      const safeTagIds = tagIds.map(id => sequelize.escape(id)).join(',');
      andConditions.push(
        literal(
          `EXISTS(SELECT 1 FROM PostTags AS pt WHERE pt.PostId = Post.id AND pt.TagId IN (${safeTagIds}))`
        )
      );
    }

    if (search) {
      const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
      andConditions.push({
        [Op.or]: [
          { title: { [Op.like]: `%${escapedSearch}%` } },
          // contentText(평문) 검색 — 원본 HTML 태그로 인한 매칭 누락 방지
          { contentText: { [Op.like]: `%${escapedSearch}%` } },
        ],
      });
      // 비밀글은 매칭 여부 자체가 정보 유출이므로 소유자에게만 검색된다(globalSearch 와 같은 정책).
      andConditions.push(
        userId ? { [Op.or]: [{ isSecret: false }, { UserId: userId }] } : { isSecret: false }
      );
    }

    const whereCondition: WhereOptions<PostInstance> & { [key: symbol]: unknown } = {
      boardType,
      status: 'published', // 초안/보관 게시글은 목록에서 제외
      ...(andConditions.length > 0 ? { [Op.and]: andConditions } : {}),
    };

    await this.expirePins();

    const offset = (page - 1) * limit;

    // isRead 서브쿼리 (userId 제공 시에만)
    const isReadAttribute = userId
      ? [
          [
            literal(
              `EXISTS(SELECT 1 FROM PostReads AS pr WHERE pr.PostId = Post.id AND pr.UserId = ${sequelize.escape(userId)})`
            ),
            'isRead',
          ] as any,
        ]
      : [];

    const [totalCount, posts] = await Promise.all([
      Post.count({ where: whereCondition }),
      Post.findAll({
        where: whereCondition,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'avatar'],
            required: false,
          },
          {
            // 담당자 이름 — 목록에서 "누가 맡았는지" 를 보려면 id 만으로는 부족하다
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'avatar'],
            required: false,
          },
          {
            model: Tag,
            as: 'tags',
            attributes: ['id', 'name', 'color'],
            through: { attributes: [] },
            required: false,
          },
        ],
        attributes: [
          'id',
          'title',
          'createdAt',
          'author',
          'content',
          'UserId',
          'viewCount',
          'isSecret',
          'secretType',
          'isPinned',
          'pinnedUntil',
          'workStatus',
          'assigneeId',
          'attachments',
          [
            literal(
              `(SELECT COUNT(*) FROM comments AS c WHERE c.PostId = Post.id AND c.deletedAt IS NULL)`
            ),
            'commentCount',
          ],
          [
            literal(`(SELECT COUNT(*) FROM PostLikes AS pl WHERE pl.PostId = Post.id)`),
            'likeCount',
          ],
          ...isReadAttribute,
        ],
        // 마지막 id 가 동점을 가른다. isPinned·createdAt 은 둘 다 겹칠 수 있다.
        order: [
          ['isPinned', 'DESC'],
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit,
        offset,
        // subQuery 기본값(true)을 쓴다. false 면 Tag include 때문에 LIMIT 이 조인 행에 적용돼 글이 누락된다.
      }),
    ]);

    // 목록에 미리보기로 쓸 첫 이미지 첨부를 고른다(없으면 null)
    const firstImageAttachment = (attachments: unknown): string | null => {
      if (!Array.isArray(attachments)) return null;
      const hit = (attachments as Attachment[]).find(a =>
        typeof a?.mimetype === 'string' ? a.mimetype.startsWith('image/') : false
      );
      return hit?.filename ?? null;
    };

    const formattedPosts = posts.map(post => {
      const postData = post.get({ plain: true }) as any;
      const isOwnSecret = postData.isSecret && postData.UserId === userId;
      // 본인 글이 아닌 비밀글은 작성자 정보 마스킹
      const revealAuthor = !postData.isSecret || isOwnSecret;
      return {
        id: postData.id,
        // 비밀글도 제목은 보인다. 목록에서 제목까지 덮으면 자기가 쓴 글도 찾지 못한다. 자물쇠 표시는 화면이 isSecret 으로 그린다.
        title: postData.title,
        author: revealAuthor ? postData.user?.name || postData.author || 'Unknown' : null,
        createdAt: postData.createdAt,
        UserId: revealAuthor ? postData.UserId : null,
        viewCount: postData.viewCount || 0,
        commentCount: parseInt(postData.commentCount, 10) || 0,
        likeCount: parseInt(postData.likeCount, 10) || 0,
        isSecret: postData.isSecret || false,
        // 본인 비밀글이 아니면 secretType도 마스킹 (password/users 타입 노출 방지)
        secretType: isOwnSecret ? postData.secretType || null : null,
        isPinned: postData.isPinned || false,
        // 만료 시각을 함께 내려 목록에서 "n일 남음" 을 보여줄 수 있게 한다
        pinnedUntil: postData.pinnedUntil ?? null,
        // 업무 상태는 목록에서 바로 보여야 훑어볼 수 있다
        workStatus: postData.workStatus ?? 'none',
        assignee: postData.assignee
          ? {
              id: postData.assignee.id,
              name: postData.assignee.name,
              avatar: postData.assignee.avatar ?? null,
            }
          : null,
        // 첨부파일 존재 표시(개수만) — 파일명 등 상세는 노출하지 않고, 타인 비밀글은 마스킹
        attachmentCount:
          revealAuthor && Array.isArray(postData.attachments) ? postData.attachments.length : 0,
        // 목록 썸네일용 첫 이미지의 저장 파일명. /api/uploads/thumb 이 권한을 다시 검사하므로 이 값만으로는 받을 수 없다.
        thumbnailName: revealAuthor ? firstImageAttachment(postData.attachments) : null,
        isRead: userId ? Boolean(postData.isRead) : undefined,
        tags: postData.tags || [],
        user: revealAuthor ? postData.user : null,
      };
    });

    return {
      posts: formattedPosts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * 글 하나를 읽는다. 비밀글 규칙과 게시판 교차 검증이 이 함수에 모여 있고, 접근 여부만 필요한 곳도 재사용한다.
   *
   * requestUserId: 비밀글 접근 판정용
   * skipViewCount: 수정·삭제 시 조회수 증가 방지
   * expectedBoardType: 게시판 교차 검증. 조회수 증가 전에 수행해 다른 게시판 URL 로
   *                    viewCount 를 부풀리지 못하게 한다.
   * minimal: 본문과 조인을 빼고 판정에 필요한 컬럼만 읽는다.
   */
  async getPostById(
    id: string,
    requestUserId?: string,
    skipViewCount = false,
    requestUserRole?: string,
    expectedBoardType?: string,
    options: { minimal?: boolean } = {}
  ): Promise<
    | { isLocked: false; post: InstanceType<typeof Post>; postData: any; attachments: any[] }
    | LockedPostMeta
    | null
  > {
    const post = await Post.findByPk(id, {
      // 본문은 판정에 쓰이지 않는다 — 얕게 부를 때는 읽지 않는다
      ...(options.minimal ? { attributes: { exclude: ['content', 'contentText'] } } : {}),
      include: options.minimal
        ? []
        : [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'avatar'],
            },
            {
              // 담당자 — 상세에서 이름과 얼굴을 보여 주려면 assigneeId 만으로는 부족하다
              model: User,
              as: 'assignee',
              attributes: ['id', 'name', 'avatar'],
              required: false,
            },
            {
              // 게시판 이름과 용도를 함께 준다. 클라이언트가 목록에서 찾으면 권한 밖 게시판의 id 가 드러난다.
              model: Board,
              as: 'board',
              attributes: ['id', 'name', 'taskEnabled'],
              required: false,
            },
            {
              // 태그도 여기서 함께 읽어 상세에서 추가 조회가 없게 한다.
              model: Tag,
              as: 'tags',
              attributes: ['id', 'name', 'color'],
              through: { attributes: [] },
              required: false,
            },
          ],
    });

    if (!post) return null;

    // boardType 교차 검증: 조회수 증가/비밀글 처리 전에 확인 (viewCount 인플레이션 방지)
    if (expectedBoardType !== undefined && post.boardType !== expectedBoardType) {
      return null;
    }

    // 비밀글 접근 체크 (requestUserId 제공 시)
    if (requestUserId !== undefined && post.isSecret) {
      const isOwner = post.UserId === requestUserId;

      // E2EE 암호화 글은 작성자 본인도 비밀번호 입력 필요 (서버가 평문을 모름)
      if (!isOwner || post.isEncrypted) {
        if (post.secretType === 'password') {
          // 비밀번호 입력 필요 → 최소 메타만 반환 (author/createdAt 노출 방지)
          // E2EE 게시물은 서버도 복호화 불가이므로 ciphertext+salt 함께 반환
          return {
            isLocked: true as const,
            id: post.id,
            title: post.title,
            boardType: post.boardType,
            secretType: 'password' as const,
            isEncrypted: post.isEncrypted || false,
            ...(post.isEncrypted && {
              ciphertext: post.content,
              secretSalt: post.secretSalt,
            }),
          };
        }

        if (!isOwner) {
          // 관리자/매니저는 users 비밀글에도 접근 가능
          const isPrivileged = requestUserRole === ROLES.ADMIN || requestUserRole === ROLES.MANAGER;
          // secretType 이 'users' 가 아니면 허용 목록이 없는 것으로 본다. 유형을 모르면 주인만 본다.
          const allowedIds = post.secretType === 'users' ? post.secretUserIds || [] : [];
          if (!isPrivileged && !allowedIds.includes(requestUserId)) {
            throw new AppError(403, '이 비밀글에 접근할 권한이 없습니다.');
          }
        }
      }
    }

    // 조회수 증가 (수정·삭제 시 skipViewCount 로 우회). 같은 사용자가 30분 안에 다시 열면 올리지 않는다.
    // silent: true 로 updatedAt 을 건드리지 않고, 표시값만 메모리에서 +1 한다(reload 조인 조회 회피).
    if (!skipViewCount && requestUserId && shouldCountView(requestUserId, post.id)) {
      await Post.increment('viewCount', { by: 1, where: { id: post.id }, silent: true });
      post.viewCount = (post.viewCount ?? 0) + 1;
    }

    const attachments = this.formatAttachments(post.attachments);
    const postData = post.get({ plain: true }) as any;

    return {
      isLocked: false,
      post,
      postData,
      attachments,
    };
  }

  // 비밀글 비밀번호 검증 후 전체 데이터 반환
  async verifySecretPost(id: string, password: string, boardType?: string, requestUserId?: string) {
    const post = await Post.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }],
    });

    if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');
    // boardType 교차 검증: 조회수 증가 전에 확인 (잘못된 게시판 접근 시 조회수 증가 방지)
    if (boardType && post.boardType !== boardType) {
      throw new AppError(404, '게시글을 찾을 수 없습니다.');
    }
    if (!post.isSecret || post.secretType !== 'password') {
      throw new AppError(400, '비밀번호가 설정된 게시글이 아닙니다.');
    }
    if (!post.secretPassword) {
      throw new AppError(500, '비밀번호 정보가 없습니다.');
    }

    const isMatch = await bcrypt.compare(password, post.secretPassword);
    if (!isMatch) throw new AppError(401, '비밀번호가 올바르지 않습니다.');

    // silent: true 로 updatedAt 을 건드리지 않고 30분 쿨다운을 둔다. 표시값만 메모리에서 올린다.
    if (requestUserId && shouldCountView(requestUserId, post.id)) {
      await Post.increment('viewCount', { by: 1, where: { id: post.id }, silent: true });
      post.viewCount = (post.viewCount ?? 0) + 1;
    }

    const attachments = this.formatAttachments(post.attachments);
    const postData = post.get({ plain: true }) as any;
    return { post, postData, attachments };
  }

  async createPost(params: CreatePostParams) {
    const {
      title,
      content,
      boardType,
      authorName,
      userId,
      files,
      originalFilenames,
      isSecret,
      secretType,
      secretPassword,
      secretUserIds,
      isEncrypted,
      secretSalt,
    } = params;

    if (!title || !content || title.trim().length === 0 || content.trim().length === 0) {
      throw new AppError(400, '제목과 내용을 입력해주세요.');
    }
    if (title.trim().length > getPostTitleMaxLength()) {
      throw new AppError(400, `제목은 ${getPostTitleMaxLength()}자를 초과할 수 없습니다.`);
    }
    if (content.length > getPostContentMaxLength()) {
      throw new AppError(400, '본문이 너무 깁니다. 내용을 줄여주세요.');
    }

    let attachmentsData: Attachment[] = [];
    if (files && files.length > 0) {
      const originalNames = this.parseOriginalNames(originalFilenames, files);
      attachmentsData = files.map((file, index) => ({
        filename: file.filename,
        originalname: originalNames[index] || `file_${index + 1}`,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
      }));
    }

    // 비밀글 secretType 검증
    if (isSecret && secretType !== 'password' && secretType !== 'users') {
      throw new AppError(400, '비밀글 유형(password/users)을 올바르게 지정해주세요.');
    }

    // users 타입 비밀글은 허용 사용자 목록이 반드시 있어야 함
    if (isSecret && secretType === 'users') {
      const validIds = Array.isArray(secretUserIds)
        ? secretUserIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (validIds.length === 0) {
        throw new AppError(400, '허용 사용자를 한 명 이상 지정해주세요.');
      }
    }

    // E2EE 암호화는 비밀번호 비밀글에서만 유효 (users 타입에서는 서버가 공개키를 모름)
    if (isEncrypted && secretType !== 'password') {
      throw new AppError(400, 'E2EE 암호화는 비밀번호 보호 게시글에서만 사용할 수 있습니다.');
    }

    // 비밀글 비밀번호 검증 및 해시
    let hashedPassword: string | null = null;
    if (isSecret && secretType === 'password') {
      // 숫자·객체가 오면 truthy 라 .trim 에서 터진다. 제목·본문처럼 형을 먼저 본다.
      if (typeof secretPassword !== 'string') {
        throw new AppError(400, '비밀글 비밀번호를 입력해주세요.');
      }
      if (!secretPassword || secretPassword.trim().length < getPostSecretPasswordMinLength()) {
        throw new AppError(
          400,
          `비밀글 비밀번호는 ${getPostSecretPasswordMinLength()}자 이상이어야 합니다.`
        );
      }
      hashedPassword = await bcrypt.hash(secretPassword.trim(), getBcryptRounds());
    }

    // 트랜잭션으로 원자적 생성 보장
    const postWithUser = await sequelize.transaction(async t => {
      const post = await Post.create(
        {
          title: title.trim(),
          content,
          boardType,
          author: authorName,
          UserId: userId,
          // setter가 init()에 정의되어 있으므로 create 시에도 JSON 직렬화가 정상 작동
          attachments: attachmentsData.length > 0 ? attachmentsData : null,
          isSecret: isSecret || false,
          secretType: isSecret ? secretType || null : null,
          secretPassword: hashedPassword,
          secretUserIds: isSecret && secretType === 'users' ? secretUserIds || null : null,
          isEncrypted: isEncrypted || false,
          secretSalt: isEncrypted && secretSalt ? secretSalt : null,
        },
        { transaction: t }
      );

      const created = await Post.findByPk(post.id, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'avatar'],
          },
        ],
        transaction: t,
      });

      if (!created) {
        throw new AppError(500, '게시글 생성 중 오류가 발생했습니다.');
      }

      return created;
    });

    return postWithUser;
  }

  async updatePost(params: UpdatePostParams) {
    const {
      postId,
      expectedBoardType,
      targetBoardType,
      title,
      content,
      userId,
      userRole,
      files,
      keepExistingFiles,
      originalFilenames,
      deletedFileNames,
      isSecret,
      secretType,
      secretPassword,
      secretUserIds,
      isEncrypted,
      secretSalt,
    } = params;

    // 권한 체크용 초기 조회 (잠금 없음)
    const postForPerm = await Post.findByPk(postId);
    if (!postForPerm) throw new AppError(404, '게시글을 찾을 수 없습니다.');

    // URL의 boardType과 실제 게시글의 boardType이 일치하는지 검증
    // (다른 게시판 게시글을 무단으로 수정하는 공격 방지)
    if (expectedBoardType && postForPerm.boardType !== expectedBoardType) {
      throw new AppError(404, '게시글을 찾을 수 없습니다.');
    }

    const isOwner = userId === postForPerm.UserId;
    const board = await Board.findByPk(postForPerm.boardType);

    if (!board) {
      throw new AppError(404, '게시판을 찾을 수 없습니다.');
    }

    // 권한 확인 (트랜잭션 전에 차단)
    if (board.isPersonal) {
      if (!isOwner) throw new AppError(403, '개인공간의 게시글은 작성자만 수정할 수 있습니다.');
    } else {
      // 일반 게시판: 작성자, 관리자/매니저, 또는 해당 게시판 담당자만 수정 가능
      const isPrivileged = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;
      if (!isOwner && !isPrivileged) {
        const isBoardManager = await BoardManager.findOne({
          where: { boardId: postForPerm.boardType, userId },
        });
        if (!isBoardManager) {
          throw new AppError(403, '게시글 수정 권한이 없습니다.');
        }
      }
    }

    if (!title || !content || title.trim().length === 0 || content.trim().length === 0) {
      throw new AppError(400, '제목과 내용을 입력해주세요.');
    }
    if (title.trim().length > getPostTitleMaxLength()) {
      throw new AppError(400, `제목은 ${getPostTitleMaxLength()}자를 초과할 수 없습니다.`);
    }
    if (content.length > getPostContentMaxLength()) {
      throw new AppError(400, '본문이 너무 깁니다. 내용을 줄여주세요.');
    }

    // 첨부파일 처리 — 삭제할 파일 목록 계산 (실제 삭제는 트랜잭션 성공 후)
    let existingFiles: Attachment[] = this.parseAttachments(postForPerm.attachments);
    const filesToDelete: Attachment[] = [];

    if (deletedFileNames) {
      try {
        const parsedDeletedFileNames: string[] =
          typeof deletedFileNames === 'string' ? JSON.parse(deletedFileNames) : deletedFileNames;

        existingFiles
          .filter(f => parsedDeletedFileNames.includes(f.filename))
          .forEach(f => filesToDelete.push(f));
        existingFiles = existingFiles.filter(
          file => !parsedDeletedFileNames.includes(file.filename)
        );
      } catch (error) {
        logError('deletedFileNames 파싱 오류', error);
      }
    }

    // 새 버전에 밀려난 예전 파일들 — 지우지 않고 이력 테이블로 옮긴다
    const archivedVersions: Attachment[] = [];

    let finalFiles: Attachment[] = keepExistingFiles === 'true' ? [...existingFiles] : [];

    if (keepExistingFiles !== 'true') {
      existingFiles.forEach(file => filesToDelete.push(file));
    }

    if (files && files.length > 0) {
      const originalNames = this.parseOriginalNames(originalFilenames, files);
      const newFiles: Attachment[] = files.map((file, index) => ({
        filename: file.filename,
        originalname: originalNames[index] || `file_${index + 1}`,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
      }));

      // 같은 이름으로 다시 올린 파일은 새 버전으로 다룬다. 지우면 되돌릴 수 없고, 남겨 두면 증적 참조가 모호해진다.
      const replacedNames = new Set(newFiles.map(f => f.originalname));
      const superseded = finalFiles.filter(f => replacedNames.has(f.originalname));
      if (superseded.length > 0) {
        archivedVersions.push(...superseded);
        // 목록에서만 빼고 디스크에서는 지우지 않는다 — 이력으로 남겨 둔다
        finalFiles = finalFiles.filter(f => !replacedNames.has(f.originalname));
      }

      finalFiles = [...finalFiles, ...newFiles];

      const maxFileCount = getSettings().maxFileCount;
      if (finalFiles.length > maxFileCount) {
        const excessFiles = finalFiles.slice(maxFileCount);
        excessFiles.forEach(file => filesToDelete.push(file));
        finalFiles = finalFiles.slice(0, maxFileCount);
      }
    }

    // 비밀글 secretType 검증
    if (
      isSecret &&
      secretType !== undefined &&
      secretType !== 'password' &&
      secretType !== 'users'
    ) {
      throw new AppError(400, '비밀글 유형(password/users)을 올바르게 지정해주세요.');
    }

    // users 타입: 빈 배열이 명시된 경우에만 거부한다. undefined 는 기존 목록 유지이며,
    // secretType 이 없으면 기존 값으로 본다(유형을 생략한 수정에서 목록이 비어 버리는 것 방지).
    if (
      isSecret &&
      (secretType ?? postForPerm.secretType) === 'users' &&
      Array.isArray(secretUserIds) &&
      secretUserIds.length === 0
    ) {
      throw new AppError(400, '허용 사용자를 한 명 이상 지정해주세요.');
    }

    // 비밀글 비밀번호 해시 (트랜잭션 전)
    let newHashedPassword: string | null | undefined;
    if (isSecret !== undefined && isSecret && secretType === 'password' && secretPassword) {
      if (secretPassword.trim().length < getPostSecretPasswordMinLength()) {
        throw new AppError(
          400,
          `비밀글 비밀번호는 ${getPostSecretPasswordMinLength()}자 이상이어야 합니다.`
        );
      }
      newHashedPassword = await bcrypt.hash(secretPassword.trim(), getBcryptRounds());
    }

    // DB 저장을 트랜잭션으로 처리
    const updatedPost = await sequelize.transaction(async t => {
      // LOCK.UPDATE로 재조회 — 권한 체크 이후 행이 바뀌는 TOCTOU(게시판 이동 등) 방지
      const lockedPost = await Post.findByPk(postId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!lockedPost) throw new AppError(404, '게시글을 찾을 수 없습니다.');

      // 권한 체크 이후 게시판이 이동된 경우 처리: 잠금 후 boardType이 달라졌으면 거부
      if (lockedPost.boardType !== postForPerm.boardType) {
        throw new AppError(
          409,
          '게시글이 다른 게시판으로 이동되었습니다. 페이지를 새로고침 후 다시 시도해주세요.'
        );
      }

      // 수정 이력. 제목·본문이 실제로 달라졌을 때만 남기고, 트랜잭션 안이라 롤백되면 이력도 사라진다.
      const titleChanged = lockedPost.title !== title.trim();
      const contentChanged = lockedPost.content !== content;
      if (titleChanged || contentChanged) {
        await PostRevision.create(
          {
            postId: lockedPost.id,
            editorId: userId,
            title: lockedPost.title,
            content: lockedPost.content ?? '',
          },
          { transaction: t }
        );
      }

      lockedPost.title = title.trim();
      lockedPost.content = content;
      lockedPost.attachments = finalFiles.length > 0 ? finalFiles : null;

      // 비밀글 설정 업데이트
      if (isSecret !== undefined) {
        lockedPost.isSecret = isSecret;
        if (!isSecret) {
          lockedPost.secretType = null;
          lockedPost.secretPassword = null;
          lockedPost.secretUserIds = null;
          lockedPost.isEncrypted = false;
          lockedPost.secretSalt = null;
        } else {
          // secretType 이 없으면 기존 유형을 유지한다. null 로 덮으면 조회 분기가 모두 빗나가 본문이 노출된다.
          const effectiveType = secretType ?? lockedPost.secretType;
          if (effectiveType !== 'password' && effectiveType !== 'users') {
            throw new AppError(400, '비밀글 유형(password/users)을 올바르게 지정해주세요.');
          }
          lockedPost.secretType = effectiveType;
          if (effectiveType === 'password') {
            if (newHashedPassword) {
              lockedPost.secretPassword = newHashedPassword;
              // 새 비밀번호 설정 시에만 E2EE 플래그 업데이트
              // 기존 비밀번호 유지 시에는 isEncrypted/secretSalt를 그대로 보존
              lockedPost.isEncrypted = isEncrypted || false;
              lockedPost.secretSalt = isEncrypted && secretSalt ? secretSalt : null;
            } else if (!lockedPost.secretPassword) {
              // 기존 비밀번호도 없고 새 비밀번호도 없으면 잠금 상태가 되어 접근 불가
              throw new AppError(400, '비밀글 비밀번호를 입력해주세요.');
            }
            // 기존 비밀번호 유지 시: isEncrypted/secretSalt 변경하지 않음
            lockedPost.secretUserIds = null;
          } else {
            // secretUserIds가 undefined이면 기존 허용 목록 유지 (서버 보존)
            if (secretUserIds !== undefined) {
              lockedPost.secretUserIds = secretUserIds || null;
            }
            lockedPost.secretPassword = null;
            lockedPost.isEncrypted = false;
            lockedPost.secretSalt = null;
          }
        }
      }

      // 게시판 이동: targetBoardType이 현재와 다르면 대상 게시판 쓰기 권한 확인 후 이동.
      // 댓글/태그/첨부는 PostId로 연결돼 자동으로 따라간다(별도 이전 불필요).
      if (targetBoardType && targetBoardType !== lockedPost.boardType) {
        const targetBoard = await Board.findByPk(targetBoardType);
        if (!targetBoard) {
          throw new AppError(404, '이동할 게시판을 찾을 수 없습니다.');
        }
        if (targetBoard.isPersonal) {
          throw new AppError(400, '개인 공간으로는 이동할 수 없습니다.');
        }
        if (!targetBoard.isActive) {
          throw new AppError(400, '비활성 게시판으로는 이동할 수 없습니다.');
        }
        const privileged = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;
        if (!privileged) {
          const [targetAccess, targetManager] = await Promise.all([
            BoardAccess.findOne({ where: { boardId: targetBoardType, roleId: userRole } }),
            BoardManager.findOne({ where: { boardId: targetBoardType, userId } }),
          ]);
          if (!targetManager && !targetAccess?.canWrite) {
            throw new AppError(403, '이동할 게시판에 글을 쓸 권한이 없습니다.');
          }
        }
        lockedPost.boardType = targetBoardType;
      }

      await lockedPost.save({ transaction: t });

      const saved = await Post.findByPk(postId, {
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }],
        transaction: t,
      });

      if (!saved) {
        throw new AppError(500, '게시글 수정 중 오류가 발생했습니다.');
      }

      return saved;
    });

    // 트랜잭션 성공 후 파일 삭제 (롤백 시 파일은 유지됨)
    filesToDelete.forEach(att => this.deleteFileIfExists(att.filename, att.path));

    // 새 버전에 밀려난 파일은 지우지 않고 이력으로 남긴다. 트랜잭션 밖에서 하되 실패를 조용히 넘기지는 않는다.
    if (archivedVersions.length > 0) {
      try {
        await PostAttachmentVersion.bulkCreate(
          archivedVersions.map(att => ({
            postId,
            originalName: att.originalname,
            filename: att.filename,
            size: att.size ?? 0,
            mimetype: att.mimetype ?? '',
            uploadedBy: userId,
          }))
        );
      } catch (err) {
        logError('첨부 이전 버전 기록 실패', err, { postId });
      }
    }

    return updatedPost;
  }

  /**
   * 첨부의 이전 버전 목록 (최신 것부터).
   * 접근 판정은 getPostById 에 위임한다. 비밀글 규칙을 다시 구현하면 두 곳이 어긋난다.
   */
  async getAttachmentVersions(postId: string, boardType: string, userId: string, userRole: string) {
    const result = await this.getPostById(postId, userId, true, userRole, boardType, {
      minimal: true,
    });
    if (!result) throw new AppError(404, '게시글을 찾을 수 없습니다.');
    if ('isLocked' in result && result.isLocked) {
      throw new AppError(403, '잠긴 게시글의 첨부 이력은 볼 수 없습니다.');
    }

    const rows = await PostAttachmentVersion.findAll({
      where: { postId },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    // 파일 이름별로 묶는다 — 화면은 "이 파일의 지난 버전" 단위로 보여 준다
    const byName = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const list = byName.get(row.originalName) ?? [];
      list.push({
        filename: row.filename,
        size: row.size,
        mimetype: row.mimetype,
        uploadedBy: row.uploadedBy,
        createdAt: row.createdAt,
        url: `/api/uploads/download/${row.filename}?originalName=${encodeURIComponent(row.originalName)}`,
      });
      byName.set(row.originalName, list);
    }

    return [...byName.entries()].map(([originalName, versions]) => ({
      originalName,
      versions,
    }));
  }

  async deletePost(
    postId: string,
    userId: string,
    userRole?: string,
    expectedBoardType?: string
    // 감사 기록에 남길 수 있도록 지운 글의 제목을 돌려준다.
  ): Promise<{ id: string; title: string }> {
    const post = await Post.findByPk(postId);
    if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');

    // URL의 boardType과 실제 게시글의 boardType이 일치하는지 검증
    if (expectedBoardType && post.boardType !== expectedBoardType) {
      throw new AppError(404, '게시글을 찾을 수 없습니다.');
    }

    const isOwner = post.UserId === userId;

    // 개인공간 게시글은 작성자만 삭제 가능 (updatePost와 동일 규칙)
    const board = await Board.findByPk(post.boardType);
    if (board?.isPersonal && !isOwner) {
      throw new AppError(403, '개인공간의 게시글은 작성자만 삭제할 수 있습니다.');
    }

    // 서비스 레이어 권한 검증: 소유자, 관리자/매니저, 또는 해당 게시판 담당자만 삭제 가능
    const isPrivileged = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;
    if (!isOwner && !isPrivileged) {
      const isBoardManager = await BoardManager.findOne({
        where: { boardId: post.boardType, userId },
      });
      if (!isBoardManager) {
        throw new AppError(403, '게시글 삭제 권한이 없습니다.');
      }
    }

    const attachmentsArray = this.parseAttachments(post.attachments);
    // 같은 이름으로 교체돼 밀려난 예전 파일도 함께 지운다. 남기면 아무도 열 수 없는 파일이 쌓인다.
    const versionFiles = (
      await PostAttachmentVersion.findAll({
        where: { postId: post.id },
        attributes: ['filename'],
      })
    ).map(v => v.filename);

    // DB 레코드를 먼저 삭제한 뒤 파일 삭제 (DB 실패 시 파일은 유지됨)
    // 게시글은 paranoid 라 destroy 시 자식이 cascade 되지 않는다. 한 트랜잭션으로 묶어 orphan 을 막는다.
    await sequelize.transaction(async t => {
      // CommentLike 는 댓글이 soft-delete 라 CASCADE 가 걸리지 않으므로 명시적으로 정리한다.
      const commentRows = await Comment.findAll({
        where: { PostId: post.id },
        attributes: ['id'],
        paranoid: false,
        transaction: t,
      });
      const commentIds = commentRows.map(c => c.id);
      // IN(...) 바인드 변수가 SQLite 상한(999)을 넘지 않도록 청크 단위로 삭제한다.
      const COMMENT_LIKE_CHUNK = 500;
      for (let i = 0; i < commentIds.length; i += COMMENT_LIKE_CHUNK) {
        await CommentLike.destroy({
          where: { CommentId: { [Op.in]: commentIds.slice(i, i + COMMENT_LIKE_CHUNK) } },
          transaction: t,
        });
      }
      // 댓글도 paranoid → soft-delete (감사 추적 유지하되 '살아있는' 쿼리에서 제외)
      await Comment.destroy({ where: { PostId: post.id }, transaction: t });
      // 파생 데이터는 hard-delete (복구 가치 없음)
      await PostLike.destroy({ where: { PostId: post.id }, transaction: t });
      await PostRead.destroy({ where: { PostId: post.id }, transaction: t });
      await PostTag.destroy({ where: { PostId: post.id }, transaction: t });
      // 이 글을 가리키는 알림(댓글/좋아요/멘션)은 링크가 죽으므로 정리 — 사용자 알림이라 감사가치 없음.
      // (신고(Report)는 모더레이션/감사 기록이고 글은 soft-delete라 paranoid:false로 계속 조회되므로 보존)
      await Notification.destroy({ where: { relatedId: post.id }, transaction: t });
      await post.destroy({ transaction: t });
    });

    for (const att of attachmentsArray) {
      try {
        this.deleteFileIfExists(att.filename, att.path);
      } catch (fileErr) {
        logError(`첨부파일 삭제 실패 (DB는 이미 정리됨): ${att.filename}`, fileErr);
      }
    }
    for (const filename of versionFiles) {
      try {
        this.deleteFileIfExists(filename);
      } catch (fileErr) {
        logError(`첨부 이전 버전 파일 삭제 실패: ${filename}`, fileErr);
      }
    }

    // destroy 뒤에도 인스턴스는 값을 들고 있다
    return { id: post.id, title: post.title };
  }

  /**
   * 보관 기간이 지난 soft-deleted 게시글을 DB에서 영구 삭제(purge)한다.
   * 게시글 삭제는 1차로 soft-delete(deletedAt 기록, 숨김)되고, retentionDays가 지나면
   * 주기 작업이 이 메서드로 게시글 + 댓글 + 잔여 파생데이터를 hard-delete한다.
   * @returns 영구 삭제된 게시글 수
   */
  async purgeExpiredPosts(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // paranoid 해제하고 보관 기간이 지난 soft-deleted 게시글만 조회
    const expired = await Post.findAll({
      where: { deletedAt: { [Op.ne]: null, [Op.lte]: cutoff } },
      attributes: ['id', 'attachments'],
      paranoid: false,
    });
    if (expired.length === 0) return 0;

    const allIds = expired.map(p => p.id);

    // 첨부 이전 버전의 파일 이름은 행이 지워지기 전에 모아 둔다.
    const versionFiles = (
      await PostAttachmentVersion.findAll({
        where: { postId: { [Op.in]: allIds } },
        attributes: ['filename'],
      })
    ).map(v => v.filename);

    // SQLite 변수 상한(999)과 긴 트랜잭션 잠금을 피하려고 청크별 트랜잭션으로 나눈다.
    const BATCH = 500;
    for (let i = 0; i < allIds.length; i += BATCH) {
      const postIds = allIds.slice(i, i + BATCH);
      // 게시글 + 자식을 한 트랜잭션에서 hard-delete (force:true는 soft-deleted 행도 실제 삭제)
      await sequelize.transaction(async t => {
        const childWhere = { PostId: { [Op.in]: postIds } };
        await Comment.destroy({ where: childWhere, transaction: t, force: true });
        await PostLike.destroy({ where: childWhere, transaction: t });
        await PostRead.destroy({ where: childWhere, transaction: t });
        await PostTag.destroy({ where: childWhere, transaction: t });
        await Post.destroy({ where: { id: { [Op.in]: postIds } }, transaction: t, force: true });
      });
    }

    // 다른 경로로 soft-delete 된 경우까지 방어적으로 첨부를 정리한다.
    for (const post of expired) {
      for (const att of this.parseAttachments(post.attachments)) {
        try {
          this.deleteFileIfExists(att.filename, att.path);
        } catch (fileErr) {
          logError(`만료 게시글 첨부파일 삭제 실패: ${att.filename}`, fileErr);
        }
      }
    }
    for (const filename of versionFiles) {
      try {
        this.deleteFileIfExists(filename);
      } catch (fileErr) {
        logError(`만료 게시글의 첨부 이전 버전 파일 삭제 실패: ${filename}`, fileErr);
      }
    }

    return expired.length;
  }

  // 게시글 고정/해제 (admin 또는 해당 게시판 담당자만 가능)
  /**
   * 기간이 지난 상단 고정을 해제한다.
   * 스케줄러 대신 목록 조회 길목에서 처리한다. 여러 프로세스가 각자 쓸어도 멱등한 UPDATE 다.
   * 매 요청 UPDATE 를 피해 프로세스 안에 주기를 두므로 만료 반영이 최대 SWEEP_INTERVAL_MS 늦다.
   */
  async expirePins(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastPinSweepAt < SWEEP_INTERVAL_MS) return;
    lastPinSweepAt = now;

    await Post.update(
      { isPinned: false, pinnedUntil: null },
      { where: { isPinned: true, pinnedUntil: { [Op.lte]: new Date() } }, silent: true }
    );
  }

  async togglePin(
    postId: string,
    userId: string,
    userRole: string,
    pinnedUntil: Date | null = null
  ): Promise<{ isPinned: boolean; pinnedUntil: Date | null }> {
    // 권한 사전 체크 (잠금 없이) — 트랜잭션 전에 403 조기 반환
    const postForPerm = await Post.findByPk(postId);
    if (!postForPerm) throw new AppError(404, '게시글을 찾을 수 없습니다.');

    if (userRole !== ROLES.ADMIN && userRole !== ROLES.MANAGER) {
      const isManager = await BoardManager.findOne({
        where: { boardId: postForPerm.boardType, userId },
      });
      if (!isManager) {
        throw new AppError(403, '이 게시판의 담당자만 고정 권한이 있습니다.');
      }
    }

    // LOCK.UPDATE로 read-modify-write 원자화 — 동시 요청 시 이중 토글 방지
    const updated = await sequelize.transaction(async t => {
      const post = await Post.findByPk(postId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');
      post.isPinned = !post.isPinned;
      // 고정을 풀 때 기간도 함께 지운다. 남기면 다음 고정이 지난 만료일로 곧바로 풀린다.
      post.pinnedUntil = post.isPinned ? pinnedUntil : null;
      await post.save({ transaction: t });
      return post;
    });

    return { isPinned: updated.isPinned, pinnedUntil: updated.pinnedUntil ?? null };
  }

  /**
   * 게시글 수정 이력 조회 (최신순).
   * 접근 판정은 getPostById 에 위임한다. 잠긴 글이면 이력도 보여주지 않는다.
   */
  async getPostRevisions(
    postId: string,
    boardType: string,
    userId: string,
    userRole: string
  ): Promise<
    Array<{ id: number; title: string; content: string; createdAt: Date; editor: unknown }>
  > {
    const result = await this.getPostById(postId, userId, true, userRole, boardType, {
      minimal: true,
    });
    if (!result) throw new AppError(404, '게시글을 찾을 수 없습니다.');
    if (result.isLocked) throw new AppError(403, '비밀글은 잠금 해제 후 이력을 볼 수 있습니다.');

    const revisions = await PostRevision.findAll({
      where: { postId },
      // 시각이 같으면 id 로 가른다. 같은 밀리초에 두 번 저장되면 순서가 뒤집힌다.
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
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

    return revisions.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content ?? '',
      createdAt: r.createdAt,
      editor: r.editor ?? null,
    }));
  }
}

export const postService = new PostService();
