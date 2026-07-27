// client/src/pages/boards/PostDetail.tsx - 비밀글 + 좋아요 + 반응 + 핀 + 태그 지원
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText,
  ArrowLeft,
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
const CommentSection = React.lazy(() => import('./CommentSection'));
import AttachmentList from '../../components/AttachmentList';
import ImageViewer from '../../components/ImageViewer';
import SecretPostModal from '../../components/boards/SecretPostModal';
import { EncryptedPostView } from '../../components/boards/EncryptedPostView';
import { ReportButton } from '../../components/boards/ReportButton';
import hljs from 'highlight.js/lib/common';
import { usePostDetail } from '../../hooks/usePostDetail';
import { useContentImageHandler } from '../../hooks/useContentImageHandler';
import { sanitizeHTML } from '../../utils/htmlSanitizer';
import { formatFullDateTime, toISOString } from '../../utils/date';
import { PageSkeleton, PageError, PageNotFound } from '../../components/common/LoadingStates';
import { PageHeader } from '../../components/common/PageHeader';
import { PageContainer } from '../../components/common/PageContainer';
import { ConfirmationModal } from '../../components/admin/common/ConfirmationModal';
import { markPostRead, togglePin } from '../../api/posts';
import { getPostTags } from '../../api/tags';
import { useAuth } from '../../store/auth';
import { useSiteSettings } from '../../store/siteSettings';
import { Tag } from '../../types/board.types';
import { toast } from '../../utils/toast';

// TagBadge/PostListItem과 동일한 색상 안전 검증
const isSafeColor = (color: string): boolean =>
  /^#[0-9a-fA-F]{3,8}$/.test(color) ||
  /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color) ||
  /^hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)$/.test(color);

import '../../styles/ContentImageStyles.css';
import '../../styles/CKContentView.css';
import 'highlight.js/styles/atom-one-dark.min.css';

// ✅ 보안이 강화된 HTML 콘텐츠 렌더링 + 코드 구문 하이라이팅
const CKContentRenderer: React.FC<{ content: string }> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

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
    return (
      <div className="text-slate-500 dark:text-slate-400 italic text-center py-8">
        내용이 없습니다.
      </div>
    );
  }

  const sanitizedContent = sanitizeHTML(content);

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

  // 실제 게시판 이름 우선 — getBoardTitle은 하드코딩 게시판만 알아 커스텀 게시판은 id를 노출하므로,
  // 접근 가능 게시판 목록(API 이름)에서 먼저 찾고 없으면 getBoardTitle로 폴백.
  const { getBoardById } = useAccessibleBoards();
  const boardTitle = getBoardById(boardType ?? '')?.name || getBoardTitle(boardType!);

  const { imageViewer, closeImageViewer } = useContentImageHandler();
  const { getUserRole } = useAuth();
  // 페이지 타이틀에 쓸 사이트 정체성 — 하드코딩 'MyHome' 대신 관리자 설정값을 사용
  const siteName = useSiteSettings(s => s.settings.siteName);
  const siteTitle = useSiteSettings(s => s.settings.siteTitle);
  const userRole = getUserRole();
  const canPin = userRole === 'admin' || isBoardManager;

  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [postTags, setPostTags] = useState<Tag[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mark post as read
  useEffect(() => {
    if (boardType && id && post && !loading) {
      markPostRead(boardType, id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardType, id, post?.id, loading]);

  // Load tags when post loads; reset first to avoid stale state
  useEffect(() => {
    if (!boardType || !id || !post) return;
    let cancelled = false;
    setPostTags([]);
    setIsPinned(post.isPinned || false);
    getPostTags(boardType, id)
      .then(data => {
        if (!cancelled) setPostTags(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardType, id, post?.id]);

  const handlePin = async () => {
    if (!boardType || !id) return;
    try {
      const result = await togglePin(boardType, id);
      setIsPinned(result.isPinned);
      window.dispatchEvent(new Event('post-updated'));
    } catch {
      toast.error('핀 설정에 실패했습니다.');
    }
  };

  // ✅ 게시글 로드 시 Open Graph 동적 메타 태그 업데이트
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

  // ✅ 공통 컴포넌트 사용
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

  return (
    <PageContainer>
      {/* ✅ 표준화된 페이지 헤더 적용 */}
      <PageHeader
        title={boardTitle}
        icon={<FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />}
      >
        <button onClick={handleBack} aria-label="목록으로 돌아가기" className="btn-secondary">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          목록으로
        </button>
      </PageHeader>

      {/* ✅ 게시글 카드 */}
      <main className="card overflow-hidden mb-6">
        {/* 게시글 헤더 */}
        <header className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-start gap-3 mb-4">
            {isPinned && (
              <span className="flex-shrink-0 mt-1" title="고정된 게시글">
                <Pin className="w-5 h-5 text-amber-500" fill="currentColor" />
              </span>
            )}
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex-1 leading-snug">
              {post.title}
            </h1>
          </div>

          {/* Tags */}
          {postTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {postTags.map(tag => {
                const safeColor = isSafeColor(tag.color) ? tag.color : '#3b82f6';
                return (
                  <span
                    key={tag.id}
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
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

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {/* ✅ 작성자 정보 - 올바른 타입 사용 */}
              <div className="flex items-center gap-3">
                <Avatar
                  user={{
                    id: post.user?.id || '',
                    name: post.author,
                    avatar: post.user?.avatar || null,
                  }}
                  size="md"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {post.author}
                  </div>
                  <time
                    dateTime={toISOString(post.createdAt)}
                    title={formatFullDateTime(post.createdAt)}
                    className="text-xs text-slate-500 dark:text-slate-400 cursor-default"
                  >
                    {formatDate(post.createdAt)}
                  </time>
                </div>
              </div>

              {/* 조회수 */}
              {post.viewCount !== undefined && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">조회수</span>
                  <span>{post.viewCount.toLocaleString()}</span>
                </div>
              )}

              {/* 좋아요 */}
              <button
                onClick={handleToggleLike}
                disabled={likeLoading}
                aria-label={liked ? '좋아요 취소' : '좋아요'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  liked
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
                <span>{likeCount.toLocaleString()}</span>
              </button>

              {/* 핀 버튼 (관리자/매니저) */}
              {canPin && (
                <button
                  type="button"
                  onClick={handlePin}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isPinned
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                  aria-label={isPinned ? '고정 해제' : '게시글 고정'}
                >
                  <Pin className="w-3.5 h-3.5" fill="currentColor" />
                  {isPinned ? '고정 해제' : '고정'}
                </button>
              )}

              {/* 수정됨 표시 */}
              {new Date(post.updatedAt).getTime() !== new Date(post.createdAt).getTime() && (
                <span className="badge badge-warning">수정됨</span>
              )}
            </div>

            {/* ✅ 액션 버튼 */}
            <div className="flex items-center gap-2">
              {!canEditOrDelete && post?.id && (
                <ReportButton targetType="post" targetId={Number(post.id)} />
              )}
              {canEditOrDelete && (
                <>
                  <button
                    onClick={handleEdit}
                    disabled={isDeleting}
                    aria-label="게시글 수정"
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>수정</span>
                  </button>

                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                    aria-label="게시글 삭제"
                    className="btn-danger flex items-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>삭제 중</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>삭제</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ✅ 게시글 본문 - 보안이 강화된 HTML 렌더링 */}
        <section className="px-4 sm:px-6 py-6 sm:py-8">
          {post.content && <CKContentRenderer content={post.content} />}
        </section>

        {/* 첨부파일 */}
        <AttachmentList attachments={post.attachments || []} />
      </main>

      {/* ✅ 댓글 섹션 */}
      <section className="card overflow-hidden">
        <header className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MessageCircle
              className="w-5 h-5 text-primary-600 dark:text-primary-400"
              fill="currentColor"
            />
            댓글
          </h2>
        </header>

        <div className="px-6 py-6">
          <React.Suspense
            fallback={
              <div className="py-4 text-center text-slate-400 text-sm">댓글 로딩 중...</div>
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
