import { Op, literal, WhereOptions } from 'sequelize';
import { Post, Attachment, PostInstance } from '../models/Post';
import { User } from '../models/User';
import { Board } from '../models/Board';
import { BoardManager } from '../models/BoardManager';
import { Tag } from '../models/Tag';
import { WikiPage } from '../models/WikiPage';
import { Event } from '../models/Event';
import EventPermission from '../models/EventPermission';
import { Memo } from '../models/Memo';
import { ROLES } from '../config/constants';
import {
  getPostTitleMaxLength,
  getPostContentMaxLength,
  getPostSecretPasswordMinLength,
  getGlobalSearchLimit,
  getBcryptRounds,
  getSettings,
} from '../utils/settingsCache';
import { BoardAccess } from '../models/BoardAccess';
import { Comment } from '../models/Comment';
import { PostLike } from '../models/PostLike';
import { PostTag } from '../models/PostTag';
import { PostRead } from '../models/PostRead';
import { PostBookmark } from '../models/PostBookmark';
import { CommentLike } from '../models/CommentLike';
import { Notification } from '../models/Notification';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { extractTextFromTiptap } from '../utils/tiptapRenderer';
import { sequelize } from '../config/sequelize';
import { logError } from '../utils/logger';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

// DTO Interfaces
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

export class PostService extends BaseService {
  // ✅ 파일 삭제 유틸리티
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
    } catch (error) {
      logError(`파일 삭제 실패: ${filename}`, error);
    }
  }

  // ✅ 안전한 첨부파일 파싱
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

  // ✅ originalFilenames JSON 파싱 (파싱 실패 시 인덱스 기반 이름 사용)
  private parseOriginalNames(originalFilenames: string | undefined, count: number): string[] {
    if (originalFilenames) {
      try {
        return JSON.parse(originalFilenames);
      } catch (_error) {
        // 파싱 실패 시 폴백
      }
    }
    return Array.from({ length: count }, (_, i) => `file_${i + 1}`);
  }

  // ✅ 첨부파일 배열을 클라이언트 응답 형식으로 변환
  private formatAttachments(rawValue: Attachment[] | string | null | undefined) {
    return this.parseAttachments(rawValue).map(file => ({
      url: `/api/uploads/download/${file.filename}?originalName=${encodeURIComponent(file.originalname)}`,
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size || 0,
      mimeType: file.mimetype || 'application/octet-stream',
    }));
  }

  // ✅ 글로벌 검색
  async globalSearch(params: SearchPostsParams) {
    const { userId, userRole, searchTerm } = params;

    if (searchTerm.length < 2) {
      throw new AppError(400, '검색어를 2자 이상 입력해주세요.');
    }
    if (searchTerm.length > 100) {
      throw new AppError(400, '검색어는 100자 이내로 입력해주세요.');
    }

    const escapedSearchTerm = searchTerm.replace(/[%_\\]/g, '\\$&');

    // 병렬로 접근 가능한 게시판 조회
    const [generalBoards, managedBoards, personalBoard] = await Promise.all([
      // 일반 게시판: 단일 JOIN 쿼리
      BoardAccess.findAll({
        where: {
          roleId: userRole,
          canRead: true,
        },
        include: [
          {
            model: Board,
            as: 'board',
            where: {
              isActive: true,
              isPersonal: false,
            },
            required: true,
            attributes: ['id'],
          },
        ],
        attributes: ['boardId'],
      }),
      // 담당자(BoardManager)로 지정된 게시판 — 역할 권한이 없어도 읽을 수 있으므로 검색에 포함
      // (getUserAccessibleBoards/사이드바와 동일 기준. 비활성 게시판은 제외)
      BoardManager.findAll({
        where: { userId },
        include: [
          {
            model: Board,
            as: 'board',
            where: { isActive: true, isPersonal: false },
            required: true,
            attributes: ['id'],
          },
        ],
        attributes: ['boardId'],
      }),
      // 개인 폴더
      Board.findOne({
        where: {
          isPersonal: true,
          ownerId: userId,
          isActive: true,
        },
        attributes: ['id'],
      }),
    ]);

    // 역할 기반 + 담당자 게시판 + 개인 폴더를 합쳐 중복 제거
    const accessibleBoardTypes = [
      ...new Set([
        ...generalBoards.map(access => access.boardId),
        ...managedBoards.map(rec => rec.boardId),
        ...(personalBoard ? [personalBoard.id] : []),
      ]),
    ];

    if (accessibleBoardTypes.length === 0) {
      return { results: [], count: 0, query: searchTerm };
    }

    // 검색 실행 (최적화된 쿼리)
    // 비밀글은 작성자 본인에게만 노출 (secretType='users' 허용 대상 포함 불가 — SQL JSON 검색 복잡도 문제)
    const posts = await Post.findAll({
      where: {
        boardType: { [Op.in]: accessibleBoardTypes },
        status: 'published', // 초안/보관 게시글 검색 결과 제외
        [Op.and]: [
          {
            [Op.or]: [{ isSecret: false }, { isSecret: true, UserId: userId }],
          },
          {
            // contentText(평문)로 검색 — 원본 HTML에 LIKE를 걸면 서식 태그가 단어 사이에
            // 끼어 "볼드 이탤릭" 같은 구절이 매치되지 않으므로 평문 컬럼을 사용한다.
            [Op.or]: [
              { title: { [Op.like]: `%${escapedSearchTerm}%` } },
              { contentText: { [Op.like]: `%${escapedSearchTerm}%` } },
            ],
          },
        ],
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar'],
          required: false,
        },
        {
          model: Board,
          as: 'board',
          attributes: ['name', 'isPersonal'],
          required: false,
        },
      ],
      attributes: ['id', 'title', 'content', 'boardType', 'createdAt', 'UserId'],
      order: [['createdAt', 'DESC']],
      limit: getGlobalSearchLimit(),
    });

    const postResults = posts.map(post => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plainPost = post.get({ plain: true }) as any;
      const contentSummary = extractTextFromTiptap(plainPost.content, 200);
      const boardName = plainPost.board?.isPersonal
        ? '📁 나의 개인공간'
        : plainPost.board?.name || plainPost.boardType;

      return {
        id: String(plainPost.id),
        type: 'post' as const,
        title: plainPost.title,
        content: contentSummary,
        boardType: plainPost.boardType,
        boardName,
        createdAt: plainPost.createdAt,
        User: plainPost.user,
      };
    });

    // 위키 검색 (발행된 페이지만)
    const wikiPages = await WikiPage.findAll({
      where: {
        isPublished: true,
        // contentText(평문) 검색 — 원본 HTML 태그로 인한 매칭 누락 방지
        [Op.or]: [
          { title: { [Op.like]: `%${escapedSearchTerm}%` } },
          { contentText: { [Op.like]: `%${escapedSearchTerm}%` } },
        ],
      },
      attributes: ['id', 'slug', 'title', 'content', 'createdAt'],
      order: [['updatedAt', 'DESC']],
      limit: getGlobalSearchLimit(),
    });

    const wikiResults = wikiPages.map(page => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plain = page.get({ plain: true }) as any;
      return {
        id: String(plain.id),
        type: 'wiki' as const,
        title: plain.title,
        content: extractTextFromTiptap(plain.content || '', 200),
        boardType: 'wiki',
        boardName: '📖 위키',
        slug: plain.slug,
        createdAt: plain.createdAt,
        User: undefined,
      };
    });

    // 이벤트 검색 — admin은 항상 허용, 일반 역할은 EventPermission.canRead 확인
    let canReadEvents = userRole === ROLES.ADMIN;
    if (!canReadEvents) {
      const ep = await EventPermission.findOne({ where: { roleId: userRole } });
      canReadEvents = ep ? ep.canRead : false; // 권한 레코드 없으면 기본 차단
    }

    const events = canReadEvents
      ? await Event.findAll({
          where: {
            // bodyText(평문) 검색 — 원본 HTML 태그로 인한 매칭 누락 방지
            [Op.or]: [
              { title: { [Op.like]: `%${escapedSearchTerm}%` } },
              { bodyText: { [Op.like]: `%${escapedSearchTerm}%` } },
            ],
          },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name'],
              required: false,
            },
          ],
          attributes: ['id', 'title', 'body', 'start', 'end', 'createdAt'],
          order: [['start', 'DESC']],
          limit: getGlobalSearchLimit(),
        })
      : [];

    const eventResults = events.map(event => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plain = event.get({ plain: true }) as any;
      return {
        id: String(plain.id),
        type: 'event' as const,
        title: plain.title,
        content: extractTextFromTiptap(plain.body || '', 200),
        boardType: 'event',
        boardName: '📅 일정',
        start: plain.start,
        end: plain.end,
        createdAt: plain.createdAt,
        User: plain.user,
      };
    });

    // 메모 검색 (본인 것만)
    const memos = await Memo.findAll({
      where: {
        UserId: userId,
        [Op.or]: [
          { title: { [Op.like]: `%${escapedSearchTerm}%` } },
          { content: { [Op.like]: `%${escapedSearchTerm}%` } },
        ],
      },
      attributes: ['id', 'title', 'content', 'createdAt'],
      order: [['updatedAt', 'DESC']],
      limit: getGlobalSearchLimit(),
    });

    const memoResults = memos.map(memo => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plain = memo.get({ plain: true }) as any;
      return {
        id: String(plain.id),
        type: 'memo' as const,
        title: plain.title || '제목 없음',
        content: extractTextFromTiptap(plain.content || '', 200),
        boardType: 'memo',
        boardName: '📝 메모',
        createdAt: plain.createdAt,
        User: undefined,
      };
    });

    const results = [...postResults, ...wikiResults, ...eventResults, ...memoResults];
    return { results, count: results.length, query: searchTerm };
  }

  // ✅ 게시글 목록 조회
  async getPosts(
    boardType: string,
    page: number = 1,
    limit: number = 10,
    search: string = '',
    userId?: string,
    tagIds?: number[]
  ) {
    const andConditions: (ReturnType<typeof literal> | WhereOptions<PostInstance>)[] = [];

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
      // 검색은 타 사용자 비밀글의 제목/본문을 매칭하면 안 된다 — 매칭 여부 자체가 비밀 내용의
      // 정보유출 오라클이 되기 때문. 비밀글은 소유자에게만 검색되도록 스코프(globalSearch와 동일 정책).
      andConditions.push(
        userId ? { [Op.or]: [{ isSecret: false }, { UserId: userId }] } : { isSecret: false }
      );
    }

    const whereCondition: WhereOptions<PostInstance> & { [key: symbol]: unknown } = {
      boardType,
      status: 'published', // 초안/보관 게시글은 목록에서 제외
      ...(andConditions.length > 0 ? { [Op.and]: andConditions } : {}),
    };

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
        order: [
          ['isPinned', 'DESC'],
          ['createdAt', 'DESC'],
        ],
        limit,
        offset,
        // subQuery 기본값(true) 사용 — Tag(belongsToMany) include와 함께 subQuery:false면 LIMIT이
        // 조인된 행에 적용돼 태그가 여러 개인 글이 LIMIT 슬롯을 여러 개 차지, 페이지에 글이 누락되고
        // 마지막 페이지의 글에 도달 못 하는 버그가 있었다. 태그 필터는 WHERE EXISTS라 영향 없음.
      }),
    ]);

    const formattedPosts = posts.map(post => {
      const postData = post.get({ plain: true }) as any;
      const isOwnSecret = postData.isSecret && postData.UserId === userId;
      // 본인 글이 아닌 비밀글은 작성자 정보 마스킹
      const revealAuthor = !postData.isSecret || isOwnSecret;
      return {
        id: postData.id,
        title: postData.isSecret ? '🔒 비밀글입니다.' : postData.title,
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

  // ✅ 게시글 상세 조회 (requestUserId: 비밀글 접근 체크용, skipViewCount: 수정/삭제 시 조회수 증가 방지)
  // expectedBoardType 제공 시 board 교차 검증 — 조회수 증가 전에 수행해 다른 게시판 URL로 viewCount 인플레이션 방지
  async getPostById(
    id: string,
    requestUserId?: string,
    skipViewCount = false,
    requestUserRole?: string,
    expectedBoardType?: string
  ): Promise<
    | { isLocked: false; post: InstanceType<typeof Post>; postData: any; attachments: any[] }
    | LockedPostMeta
    | null
  > {
    const post = await Post.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
    });

    if (!post) return null;

    // ✅ boardType 교차 검증: 조회수 증가/비밀글 처리 전에 확인 (viewCount 인플레이션 방지)
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

        if (!isOwner && post.secretType === 'users') {
          // 관리자/매니저는 users 비밀글에도 접근 가능
          const isPrivileged = requestUserRole === ROLES.ADMIN || requestUserRole === ROLES.MANAGER;
          const allowedIds = post.secretUserIds || [];
          if (!isPrivileged && !allowedIds.includes(requestUserId)) {
            throw new AppError(403, '이 비밀글에 접근할 권한이 없습니다.');
          }
        }
      }
    }

    // ✅ 조회수 증가 (수정/삭제 시 skipViewCount=true 로 우회)
    // increment는 원자적으로 실행되며, 이후 reload로 최신 값을 반영
    // silent: true — 조회수 증가가 updatedAt을 건드리지 않도록 (조회만 해도 '수정됨' 표시되는 버그 방지)
    if (!skipViewCount) {
      await Post.increment('viewCount', { by: 1, where: { id: post.id }, silent: true });
      await post.reload();
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

  // ✅ 비밀글 비밀번호 검증 후 전체 데이터 반환
  async verifySecretPost(id: string, password: string, boardType?: string) {
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

    // silent: true — 조회수 증가가 updatedAt을 건드리지 않도록 ('수정됨' 오표시 방지)
    await Post.increment('viewCount', { by: 1, where: { id: post.id }, silent: true });
    await post.reload();

    const attachments = this.formatAttachments(post.attachments);
    const postData = post.get({ plain: true }) as any;
    return { post, postData, attachments };
  }

  // ✅ 게시글 생성
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
      const originalNames = this.parseOriginalNames(originalFilenames, files.length);
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
      if (!secretPassword || secretPassword.trim().length < getPostSecretPasswordMinLength()) {
        throw new AppError(
          400,
          `비밀글 비밀번호는 ${getPostSecretPasswordMinLength()}자 이상이어야 합니다.`
        );
      }
      hashedPassword = await bcrypt.hash(secretPassword.trim(), getBcryptRounds());
    }

    // ✅ 트랜잭션으로 원자적 생성 보장
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

  // ✅ 게시글 수정
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

    let finalFiles: Attachment[] = keepExistingFiles === 'true' ? [...existingFiles] : [];

    if (keepExistingFiles !== 'true') {
      existingFiles.forEach(file => filesToDelete.push(file));
    }

    if (files && files.length > 0) {
      const originalNames = this.parseOriginalNames(originalFilenames, files.length);
      const newFiles: Attachment[] = files.map((file, index) => ({
        filename: file.filename,
        originalname: originalNames[index] || `file_${index + 1}`,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
      }));

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

    // users 타입 비밀글: 명시적으로 빈 배열이 전달된 경우에만 거부
    // undefined는 "기존 허용 목록 유지" 의미이므로 허용
    if (
      isSecret &&
      secretType === 'users' &&
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
          lockedPost.secretType = secretType || null;
          if (secretType === 'password') {
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
          } else if (secretType === 'users') {
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

    return updatedPost;
  }

  // ✅ 게시글 삭제
  async deletePost(
    postId: string,
    userId: string,
    userRole?: string,
    expectedBoardType?: string
  ): Promise<void> {
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

    // DB 레코드를 먼저 삭제한 뒤 파일 삭제 (DB 실패 시 파일은 유지됨)
    // ✅ 게시글은 paranoid(soft-delete)이므로 destroy 시 자식이 cascade되지 않는다.
    //    자식 정리를 하나의 트랜잭션으로 묶어 orphan(댓글/리액션/조회기록/태그/알림) 누적을 방지.
    await sequelize.transaction(async t => {
      // 댓글의 CommentLike는 댓글이 soft-delete(UPDATE)라 onDelete:CASCADE가 발동하지 않으므로
      // 명시적으로 정리한다(deleteComment와 동일 패턴). paranoid:false로 모든 댓글 id를 수집.
      const commentRows = await Comment.findAll({
        where: { PostId: post.id },
        attributes: ['id'],
        paranoid: false,
        transaction: t,
      });
      const commentIds = commentRows.map(c => c.id);
      // 댓글이 많은 글에서 IN(...) 바인드 변수가 SQLite 상한(보수적으로 999)을 넘지 않도록
      // 청크 단위로 삭제(purgeExpiredPosts와 동일 방어). 빈 배열이면 루프가 돌지 않는다.
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
      await PostBookmark.destroy({ where: { PostId: post.id }, transaction: t });
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

    // 배치 처리: 한 번에 IN(...)에 넣는 id 수를 제한한다. SQLite는 SQL 변수 상한(기본 999)이
    // 있어, 만료 글이 많으면(최초 배포 후 백로그 등) 단일 IN 절이 실패할 수 있다. 또한 거대한
    // 단일 트랜잭션으로 DB가 오래 잠기는 것도 방지하기 위해 청크별 트랜잭션으로 나눈다.
    const BATCH = 500;
    for (let i = 0; i < allIds.length; i += BATCH) {
      const postIds = allIds.slice(i, i + BATCH);
      // 게시글 + 자식을 한 트랜잭션에서 hard-delete (force:true는 soft-deleted 행도 실제 삭제)
      await sequelize.transaction(async t => {
        const childWhere = { PostId: { [Op.in]: postIds } };
        await Comment.destroy({ where: childWhere, transaction: t, force: true });
        await PostLike.destroy({ where: childWhere, transaction: t });
        await PostRead.destroy({ where: childWhere, transaction: t });
        await PostBookmark.destroy({ where: childWhere, transaction: t });
        await PostTag.destroy({ where: childWhere, transaction: t });
        await Post.destroy({ where: { id: { [Op.in]: postIds } }, transaction: t, force: true });
      });
    }

    // 첨부파일 정리 — deletePost에서 이미 삭제됐지만, 다른 경로로 soft-delete된 경우까지
    // 방어적으로 처리(deleteFileIfExists는 파일이 없으면 무시).
    for (const post of expired) {
      for (const att of this.parseAttachments(post.attachments)) {
        try {
          this.deleteFileIfExists(att.filename, att.path);
        } catch (fileErr) {
          logError(`만료 게시글 첨부파일 삭제 실패: ${att.filename}`, fileErr);
        }
      }
    }

    return expired.length;
  }

  // ✅ 게시글 고정/해제 (admin 또는 해당 게시판 담당자만 가능)
  async togglePin(
    postId: string,
    userId: string,
    userRole: string
  ): Promise<{ isPinned: boolean }> {
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

    // ✅ LOCK.UPDATE로 read-modify-write 원자화 — 동시 요청 시 이중 토글 방지
    const updated = await sequelize.transaction(async t => {
      const post = await Post.findByPk(postId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');
      post.isPinned = !post.isPinned;
      await post.save({ transaction: t });
      return post;
    });

    return { isPinned: updated.isPinned };
  }
}

export const postService = new PostService();
