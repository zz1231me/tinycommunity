// client/src/pages/boards/PostDetail.tsx
// 글 상세 — 업무용 정보 구조.
//
// 위에서 아래로 "어디에 있나 → 무엇인가 → 어떤 상태인가 → 내용 → 근거 → 확인 → 대화"
// 순서로 배치한다. 담당자·업무 상태를 지표(조회수·좋아요 등)보다 위에 둔다.
//
//  1. 이동 줄     — 게시판 breadcrumb + 목록/수정/삭제
//  2. 제목 블록   — 고정 표시, 제목, 태그, 작성자·시각·조회
//  3. 상태 줄     — 담당자·업무 상태 (TaskPanel)
//  4. 본문
//  5. 첨부(+개정 이력)
//  6. 참여 줄     — 좋아요·스크랩·신고 (읽고 난 뒤에 하는 행동이라 본문 끝에 둔다)
//  7. 활동 기록   — 업무용 게시판만 (누가 언제 무엇을 바꿨나)
//  8. 읽음 확인   — 작성자·게시판 담당자만
//  9. 관련 글 → 댓글
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DEFAULT_TAG_COLOR } from '../../constants/colors';
import {
  ArrowLeft,
  ChevronRight,
  Pin,
  Eye,
  Heart,
  MessageCircle,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { useAccessibleBoards } from '../../hooks/useAccessibleBoards';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
const CommentSection = lazyWithRetry(() => import('./CommentSection'));
import AttachmentList from '../../components/AttachmentList';
// diff2html·diff 라이브러리를 끌어오므로, 이력을 펼칠 때만 로드한다.
const PostHistory = lazyWithRetry(() => import('../../components/PostHistory'));
import ImageViewer from '../../components/ImageViewer';
import SecretPostModal from '../../components/boards/SecretPostModal';
import { EncryptedPostView } from '../../components/boards/EncryptedPostView';
import { ReportButton } from '../../components/boards/ReportButton';
import { PinButton } from '../../components/boards/PinButton';
import { TaskPanel } from '../../components/boards/TaskPanel';
import { ReadReceipts } from '../../components/boards/ReadReceipts';
import { PostActivityLog } from '../../components/boards/PostActivityLog';
import { ScrapButton } from '../../components/discovery/ScrapButton';
import { RelatedPosts } from '../../components/discovery/RelatedPosts';
import hljs from 'highlight.js/lib/common';
import { usePostDetail } from '../../hooks/usePostDetail';
import { useContentImageHandler } from '../../hooks/useContentImageHandler';
import { useAttachmentRefs, type AttachmentRefTarget } from '../../hooks/useAttachmentRefs';
import { highlightMentions, sanitizeHTML } from '../../utils/htmlSanitizer';
import { formatFullDateTime, toISOString } from '../../utils/date';
import { PageSkeleton, PageError, PageNotFound } from '../../components/common/LoadingStates';
import { PageContainer } from '../../components/common/PageContainer';
import { ConfirmationModal } from '../../components/admin/common/ConfirmationModal';
import { markPostRead } from '../../api/posts';
import type { TaskState } from '../../api/tasks';
import { useAuth } from '../../store/auth';
import { useFeature } from '../../store/features';
import { useSiteSettings } from '../../store/siteSettings';
import { Tag } from '../../types/board.types';

// TagBadge/PostListItem과 동일한 색상 안전 검증
const isSafeColor = (color: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(color) ||
  /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color) ||
  /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/.test(color);

import '../../styles/ContentImageStyles.css';
import '../../styles/CKContentView.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import { ListState } from '../../components/common/ListState';

// 보안이 강화된 HTML 콘텐츠 렌더링 + 코드 구문 하이라이팅
const CKContentRenderer: React.FC<{
  content: string;
  attachments: AttachmentRefTarget[];
  onPreviewImage: (url: string, alt: string) => void;
}> = ({ content, attachments, onPreviewImage }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // 문단별 첨부가 꺼져 있으면 참조를 카드로 바꾸지 않는다.
  // 이미 꽂아 둔 참조는 파일명 그대로 본문에 남는다 — 지우면 증적이 있었다는 사실이 사라진다.
  const inlineAttachmentsEnabled = useFeature('post.inlineAttachments');

  // 본문에 꽂힌 증적 참조를 첨부 카드로 바꾼다 (정화 이후 DOM 단계)
  useAttachmentRefs(containerRef, attachments, onPreviewImage, inlineAttachmentsEnabled);

  // 코드 블록 syntax highlight (CKEditor 출력: <pre><code class="language-xxx">)
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.querySelectorAll<HTMLElement>('pre code').forEach(block => {
      if (!block.dataset.highlighted) {
        hljs.highlightElement(block);
      }
    });
  }, [content]);

  if (!content) {
    return <ListState>내용이 없습니다.</ListState>;
  }

  // 정화 이후에 멘션을 강조한다
  const sanitizedContent = highlightMentions(sanitizeHTML(content));

  return (
    <div
      ref={containerRef}
      className="ck-content-view"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};

const PostDetail = () => {
  const { boardType, id } = useParams<{ boardType: string; id: string }>();

  const {
    post,
    loading,
    error,
    isDeleting,
    canEditOrDelete,
    isBoardManager,
    scrapped,
    isLocked,
    lockedMeta,
    verifyError,
    verifying,
    liked,
    likeCount,
    likeLoading,
    getBoardTitle,
    formatDate,
    handleBack,
    handleEdit,
    handleDelete,
    handleVerifyPassword,
    handleToggleLike,
  } = usePostDetail({ boardType, id });

  // 게시판 이름은 글과 함께 서버가 준다. 접근 가능 게시판 목록에서 찾으면, 그 목록에
  // 없는 게시판(역할 권한 밖이지만 관리자로 열람되는 경우)에서 게시판 id 가 그대로 나온다.
  // 목록은 서버 값이 아직 없을 때의 대비책으로만 쓴다.
  const { getBoardById } = useAccessibleBoards();
  const boardTitle =
    post?.board?.name || getBoardById(boardType ?? '')?.name || getBoardTitle(boardType!);

  const { imageViewer, closeImageViewer } = useContentImageHandler();
  // 본문 증적 참조가 이미지일 때 같은 뷰어로 띄운다
  const [refImage, setRefImage] = useState<{ url: string; alt: string } | null>(null);
  const showRefImage = useCallback((url: string, alt: string) => setRefImage({ url, alt }), []);
  const { getUserRole, getUserId } = useAuth();
  // 페이지 타이틀에 쓸 사이트 정체성 — 하드코딩 'MyHome' 대신 관리자 설정값을 사용
  const siteName = useSiteSettings(s => s.settings.siteName);
  const siteTitle = useSiteSettings(s => s.settings.siteTitle);
  const userRole = getUserRole();
  // 관리자가 끈 기능은 버튼·섹션째로 숨긴다
  const likeEnabled = useFeature('post.like');
  const scrapEnabled = useFeature('post.scrap');
  const reportEnabled = useFeature('post.report');
  const relatedEnabled = useFeature('discovery.related');
  const revisionsEnabled = useFeature('post.revisions');
  const profilesEnabled = useFeature('social.profiles');
  const tasksEnabled = useFeature('post.tasks');
  const readReceiptsEnabled = useFeature('post.readReceipts');
  const canPin = userRole === 'admin' || isBoardManager;

  const [isPinned, setIsPinned] = useState<boolean>(false);
  // 고정 만료 시각 — 무기한 고정이면 null
  const [pinnedUntil, setPinnedUntil] = useState<string | null>(null);
  // 업무 상태는 이 화면에서 바꾸므로 로컬로 들고 있는다 (핀과 같은 방식)
  const [task, setTask] = useState<TaskState>({ workStatus: 'none', assignee: null });
  const [postTags, setPostTags] = useState<Tag[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Mark post as read
  useEffect(() => {
    if (boardType && id && post && !loading) {
      markPostRead(boardType, id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardType, id, post?.id, loading]);

  // 글이 바뀌면 이 화면이 들고 있는 값들을 새 글의 것으로 맞춘다.
  // 태그는 상세 응답에 함께 오므로 따로 묻지 않는다.
  useEffect(() => {
    if (!post) return;
    setIsPinned(post.isPinned || false);
    setPinnedUntil(post.pinnedUntil ?? null);
    setTask({ workStatus: post.workStatus ?? 'none', assignee: post.assignee ?? null });
    setPostTags(post.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.tags]);

  // 게시글 로드 시 Open Graph 동적 메타 태그 업데이트
  useEffect(() => {
    if (!post || isLocked) return;

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const plainContent = post.content?.replace(/<[^>]+>/g, '').slice(0, 160) ?? '';
    setMeta('og:title', post.title);
    setMeta('og:description', plainContent);
    setMeta('og:type', 'article');
    setMeta('og:url', window.location.href);
    document.title = `${post.title} | ${siteName}`;

    return () => {
      document.title = siteTitle;
      ['og:title', 'og:description', 'og:type', 'og:url'].forEach(prop => {
        document.querySelector(`meta[property="${prop}"]`)?.removeAttribute('content');
      });
    };
  }, [post, isLocked, siteName, siteTitle]);

  // 공통 컴포넌트 사용
  if (loading) return <PageSkeleton />;
  if (error) return <PageError message={error} onBack={handleBack} />;
  if (isLocked && lockedMeta) {
    // E2EE: ciphertext가 있으면 암호화된 내용 먼저 보여주고 인라인 복호화
    if (lockedMeta.isEncrypted && lockedMeta.ciphertext) {
      return (
        <EncryptedPostView
          boardTitle={boardTitle}
          postTitle={lockedMeta.title}
          ciphertext={lockedMeta.ciphertext}
          onDecrypt={handleVerifyPassword}
          onBack={handleBack}
          verifying={verifying}
          error={verifyError}
        />
      );
    }
    // 일반 비밀글: 기존 모달 방식 유지
    return (
      <SecretPostModal
        postTitle={lockedMeta.title}
        error={verifyError}
        verifying={verifying}
        isEncrypted={lockedMeta.isEncrypted}
        onVerify={handleVerifyPassword}
        onBack={handleBack}
      />
    );
  }
  if (!post) return <PageNotFound onBack={handleBack} />;

  const isEdited = new Date(post.updatedAt).getTime() !== new Date(post.createdAt).getTime();
  // 담당자 본인도 자기 상태를 바꿀 수 있다 — 못 바꾸면 작성자에게 부탁해야 한다
  const canManageTask = canEditOrDelete || task.assignee?.id === getUserId();

  return (
    <PageContainer className="space-y-5">
      {/* 1. 이동 줄 — 어디에 있는지와 이 글로 할 수 있는 일 */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700/60">
        <nav aria-label="위치" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link
            to={`/dashboard/posts/${boardType}`}
            className="truncate font-medium text-slate-600 transition-colors hover:text-primary-600 dark:text-slate-300 dark:hover:text-primary-400"
          >
            {boardTitle}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" aria-hidden="true" />
          <span aria-current="page" className="truncate text-slate-400">
            글 보기
          </span>
        </nav>

        <div className="flex flex-shrink-0 items-center gap-2">
          <button onClick={handleBack} aria-label="목록으로 돌아가기" className="btn-secondary">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            목록
          </button>
          {canEditOrDelete && (
            <>
              <button
                onClick={handleEdit}
                disabled={isDeleting}
                aria-label="게시글 수정"
                className="btn-secondary flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline">수정</span>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                aria-label="게시글 삭제"
                className="btn-danger flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{isDeleting ? '삭제 중' : '삭제'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. 본문 카드 */}
      <main className="card overflow-hidden">
        <header className="card-body border-b border-slate-200 dark:border-slate-700">
          <div className="mb-3 flex items-start gap-2">
            {isPinned && (
              <span className="mt-1 flex-shrink-0" title="고정된 게시글">
                <Pin className="h-5 w-5 text-amber-500" fill="currentColor" />
              </span>
            )}
            <h1 className="flex-1 text-2xl font-bold leading-snug text-slate-900 dark:text-slate-100">
              {post.title}
            </h1>
            {/* 핀은 상태를 바꾸는 관리 동작이라 제목 옆에 둔다 */}
            {canPin && boardType && id && (
              <PinButton
                boardType={boardType}
                postId={id}
                isPinned={isPinned}
                pinnedUntil={pinnedUntil}
                onChange={next => {
                  setIsPinned(next.isPinned);
                  setPinnedUntil(next.pinnedUntil);
                }}
              />
            )}
          </div>

          {postTags.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {postTags.map(tag => {
                const safeColor = isSafeColor(tag.color) ? tag.color : DEFAULT_TAG_COLOR;
                return (
                  <span
                    key={tag.id}
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: safeColor + '20',
                      color: safeColor,
                      border: `1px solid ${safeColor}40`,
                    }}
                  >
                    #{tag.name}
                  </span>
                );
              })}
            </div>
          )}

          {/* 작성자·시각·조회수 — 한 줄에 모아 "누가 언제" 를 한눈에 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                user={{
                  id: post.user?.id || '',
                  name: post.author,
                  avatar: post.user?.avatar || null,
                }}
                size="sm"
              />
              <div className="min-w-0">
                {/* 작성자 이름에서 프로필로 — 비밀글은 작성자를 가리므로 user.id 가 없다 */}
                {profilesEnabled && post.user?.id ? (
                  <Link
                    to={`/dashboard/users/${post.user.id}`}
                    // a 는 인라인이라 block 을 주지 않으면 아래 작성 시각과 한 줄로 붙는다
                    className="block truncate text-sm font-semibold text-slate-900 hover:text-primary-600 dark:text-slate-100 dark:hover:text-primary-400"
                  >
                    {post.author}
                  </Link>
                ) : (
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {post.author}
                  </div>
                )}
                <time
                  dateTime={toISOString(post.createdAt)}
                  title={formatFullDateTime(post.createdAt)}
                  className="cursor-default text-xs text-slate-500 dark:text-slate-400"
                >
                  {formatDate(post.createdAt)}
                </time>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {post.viewCount !== undefined && (
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">조회수</span>
                  {post.viewCount.toLocaleString()}
                </span>
              )}

              {/* 수정됨 표시 — 클릭하면 수정 이력을 펼친다 */}
              {revisionsEnabled && isEdited && (
                <button
                  type="button"
                  onClick={() => setShowHistory(v => !v)}
                  aria-expanded={showHistory}
                  className="badge badge-warning cursor-pointer transition hover:brightness-95"
                  title="수정 이력 보기"
                >
                  수정됨
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 3. 상태 줄 — 업무용으로 켠 게시판에서만. 사이트 전체 스위치와 게시판 용도,
            둘 다 켜져 있어야 한다. 서버도 같은 선을 지킨다(업무용이 아니면 400). */}
        {tasksEnabled && post.board?.taskEnabled && boardType && id && (
          <TaskPanel
            boardType={boardType}
            postId={id}
            state={task}
            editable={canManageTask}
            onChange={setTask}
          />
        )}

        {showHistory && (
          <div className="card-body border-b border-slate-200 dark:border-slate-700">
            {/* PostHistory 는 lazy 라 자체 Suspense 경계가 필요하다 */}
            <React.Suspense
              fallback={<div className="py-4 text-sm text-slate-400">이력 로딩 중…</div>}
            >
              <PostHistory
                boardType={boardType as string}
                postId={String(post.id)}
                currentContent={post.content ?? ''}
                onClose={() => setShowHistory(false)}
              />
            </React.Suspense>
          </div>
        )}

        {/* 4. 본문 */}
        {/* 본문만 위아래로 더 연다 — 읽는 자리이기 때문이다 */}
        <section className="px-4 py-6 sm:px-6 sm:py-7">
          {post.content && (
            <CKContentRenderer
              content={post.content}
              attachments={post.attachments || []}
              onPreviewImage={showRefImage}
            />
          )}
        </section>

        {/* 5. 첨부 — 본문의 근거이므로 본문 바로 뒤 */}
        <AttachmentList attachments={post.attachments || []} boardType={boardType} postId={id} />

        {/* 6. 참여 줄 — 다 읽고 난 뒤에 하는 행동들 */}
        {(likeEnabled || scrapEnabled || (reportEnabled && !canEditOrDelete)) && (
          <footer className="card-footer">
            {likeEnabled && (
              <button
                onClick={handleToggleLike}
                disabled={likeLoading}
                aria-label={liked ? '좋아요 취소' : '좋아요'}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  liked
                    ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
                }`}
              >
                <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
                <span>{likeCount.toLocaleString()}</span>
              </button>
            )}

            {/* 스크랩 — 나만 보는 "나중에 보기" */}
            {scrapEnabled && boardType && post?.id && (
              <ScrapButton
                boardType={boardType}
                postId={String(post.id)}
                initialScrapped={scrapped}
              />
            )}

            {reportEnabled && !canEditOrDelete && post?.id && (
              <span className="ml-auto">
                <ReportButton targetType="post" targetId={Number(post.id)} />
              </span>
            )}
          </footer>
        )}
      </main>

      {/* 7. 활동 기록 — 업무용 게시판에서만. 누가 언제 무엇을 바꿨는지 한 줄기로 본다.
          일반 게시판에도 기록은 쌓이지만(나중에 업무용으로 바꿔도 이력이 비지 않게)
          화면에는 업무로 쓰는 곳에서만 꺼낸다. */}
      {tasksEnabled && post.board?.taskEnabled && boardType && id && (
        <PostActivityLog
          boardType={boardType}
          postId={id}
          onOpenRevisions={revisionsEnabled ? () => setShowHistory(true) : undefined}
        />
      )}

      {/* 8. 읽음 확인 — 서버도 같은 사람만 허용한다(403). 여기서 감추는 것은 헛된 요청을 줄이기 위함 */}
      {readReceiptsEnabled && canEditOrDelete && boardType && id && (
        <ReadReceipts boardType={boardType} postId={id} />
      )}

      {/* 9. 관련 글 — 읽을 것이 없으면 스스로 숨는다 */}
      {relatedEnabled && boardType && post?.id && (
        <RelatedPosts boardType={boardType} postId={String(post.id)} />
      )}

      {/* 댓글 */}
      <section className="card overflow-hidden">
        <header className="card-header">
          <MessageCircle
            className="h-4 w-4 text-slate-400"
            fill="currentColor"
            aria-hidden="true"
          />
          <h2 className="card-title">댓글</h2>
        </header>

        <div className="card-body">
          <React.Suspense
            fallback={
              <div className="py-4 text-center text-sm text-slate-400">댓글 로딩 중...</div>
            }
          >
            <CommentSection postId={id!} />
          </React.Suspense>
        </div>
      </section>

      {/* 이미지 뷰어 */}
      <ImageViewer
        isOpen={imageViewer.isOpen}
        onClose={closeImageViewer}
        imageUrl={imageViewer.imageUrl}
        altText={imageViewer.altText}
      />

      {/* 본문 증적 참조로 연 이미지 */}
      <ImageViewer
        isOpen={!!refImage}
        onClose={() => setRefImage(null)}
        imageUrl={refImage?.url ?? ''}
        altText={refImage?.alt ?? ''}
      />

      {/* 삭제 확인 모달 — 공용 ConfirmationModal 사용 (포커스 트랩/ESC/포커스 복원 포함) */}
      <ConfirmationModal
        open={showDeleteConfirm}
        title="게시글 삭제"
        message="정말 이 게시글을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다."
        confirmLabel={isDeleting ? '삭제 중...' : '삭제'}
        cancelLabel="취소"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </PageContainer>
  );
};

export default PostDetail;
