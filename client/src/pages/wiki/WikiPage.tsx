import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WikiPage as WikiPageType } from '../../types/wiki.types';
import {
  getWikiPageTree,
  getWikiPageBySlug,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  getWikiEditPermissions,
} from '../../api/wiki';
import { WikiSidebar } from './WikiSidebar';
import { WikiDetail } from './WikiDetail';
import { WikiEditor } from './WikiEditor';
import { useAuth } from '../../store/auth';
import { LoadingSpinner } from '../../components/admin/common/LoadingSpinner';
import { useImageUpload } from '../../hooks/useImageUpload';

const WikiPageRoute = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { getUserRole } = useAuth();
  const role = getUserRole();
  const isAdminOrManager = role === 'admin' || role === 'manager';
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  // admin/manager는 서버와 동일하게 항상 편집 허용; 나머지는 권한 로드 후 판단
  const canEdit =
    isAdminOrManager || (permissionsLoaded && role !== null && allowedRoles.includes(role));

  const { handleImageUpload } = useImageUpload();

  useEffect(() => {
    getWikiEditPermissions()
      .then(data => {
        setAllowedRoles(data.roles);
        setPermissionsLoaded(true);
      })
      .catch(() => {
        setPermissionsLoaded(true); // 에러 시에도 로드 완료로 처리 (admin/manager는 항상 가능)
      });
  }, []);

  const [allPages, setAllPages] = useState<WikiPageType[]>([]);
  const [currentPage, setCurrentPage] = useState<WikiPageType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingNavSlug, setPendingNavSlug] = useState<string | null | undefined>(undefined); // undefined = no pending
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pagesLoadError, setPagesLoadError] = useState(false);
  // 리비전 복원 — 복원할 내용(null이면 확인 모달 닫힘)
  const [restoreContent, setRestoreContent] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    try {
      const pages = await getWikiPageTree();
      setAllPages(pages);
      setPagesLoadError(false);
      return pages;
    } catch {
      setPagesLoadError(true);
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const pages = await fetchPages();
      if (cancelled) return;
      if (slug) {
        try {
          const page = await getWikiPageBySlug(slug);
          if (!cancelled) setCurrentPage(page);
        } catch {
          if (!cancelled) setCurrentPage(null);
        }
      } else if (pages.length > 0) {
        navigate(`/dashboard/wiki/${pages[0].slug}`, { replace: true });
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, fetchPages, navigate]);

  const handleSave = async (data: {
    slug: string;
    title: string;
    content: string;
    parentId: number | null;
    isPublished: boolean;
  }) => {
    setSaveError(null);
    setIsSaving(true);
    try {
      if (isCreating) {
        const page = await createWikiPage(data);
        await fetchPages();
        navigate(`/dashboard/wiki/${page.slug}`);
      } else if (currentPage) {
        const page = await updateWikiPage(currentPage.slug, data);
        setCurrentPage(page);
        await fetchPages();
        if (page.slug !== currentPage.slug) {
          navigate(`/dashboard/wiki/${page.slug}`, { replace: true });
        }
      }
      setIsEditing(false);
      setIsCreating(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Called by sidebar when user clicks a page while editing
  const handleInterceptNav = (slug: string | null) => {
    setPendingNavSlug(slug); // null = home, string = specific page
  };

  const confirmDiscard = () => {
    setIsEditing(false);
    setIsCreating(false);
    setSaveError(null);
    const target = pendingNavSlug;
    setPendingNavSlug(undefined);
    if (target === null) {
      navigate('/dashboard/wiki', { replace: true });
    } else if (target) {
      navigate(`/dashboard/wiki/${target}`);
    }
  };

  const handleDelete = () => {
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!currentPage) return;
    setIsDeleting(true);
    try {
      await deleteWikiPage(currentPage.slug);
      setShowDeleteConfirm(false);
      await fetchPages();
      navigate('/dashboard/wiki', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '삭제에 실패했습니다.';
      setDeleteError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  // 특정 리비전 내용으로 복원 요청 → 확인 모달 표시
  const handleRestore = (content: string) => {
    setRestoreError(null);
    setRestoreContent(content);
  };

  const confirmRestore = async () => {
    if (!currentPage || restoreContent === null) return;
    setIsRestoring(true);
    try {
      // 복원 = 해당 내용으로 현재 페이지 갱신(서버가 새 리비전으로 기록). 제목/구조는 유지.
      const page = await updateWikiPage(currentPage.slug, {
        title: currentPage.title,
        content: restoreContent,
      });
      setCurrentPage(page);
      await fetchPages();
      setRestoreContent(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '복원에 실패했습니다.';
      setRestoreError(message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col">
        <WikiSidebar
          pages={allPages}
          isEditing={isEditing || isCreating}
          onInterceptNav={handleInterceptNav}
        />
        {pagesLoadError && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center">
            <p className="text-xs text-red-500 dark:text-red-400 mb-2">
              목록을 불러오지 못했습니다.
            </p>
            <button
              onClick={() => fetchPages()}
              className="text-xs text-primary-600 dark:text-primary-400 underline hover:no-underline"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {canEdit && (
          <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setIsCreating(true);
                setIsEditing(false);
                setSaveError(null);
              }}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              새 페이지
            </button>
            {currentPage && !isEditing && !isCreating && (
              <>
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setIsCreating(false);
                    setSaveError(null);
                  }}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  편집
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  삭제
                </button>
              </>
            )}
            {saveError && (
              <span className="text-xs text-red-500 ml-2 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {saveError}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner message="위키 불러오는 중..." />
          </div>
        ) : isCreating ? (
          <WikiEditor
            page={null}
            allPages={allPages}
            onSave={handleSave}
            onCancel={() => setIsCreating(false)}
            isSaving={isSaving}
            onImageUpload={handleImageUpload}
          />
        ) : isEditing && currentPage ? (
          <WikiEditor
            page={currentPage}
            allPages={allPages}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
            isSaving={isSaving}
            onImageUpload={handleImageUpload}
          />
        ) : currentPage ? (
          <WikiDetail
            page={currentPage}
            allPages={allPages}
            canEdit={canEdit}
            onEdit={() => {
              setIsEditing(true);
              setIsCreating(false);
            }}
            onRestore={canEdit ? handleRestore : undefined}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <div className="text-center">
              <div className="text-5xl mb-4">📖</div>
              <p className="text-lg font-medium text-slate-500 dark:text-slate-400">
                위키 페이지를 선택하거나
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                새 페이지를 만드세요.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 편집 중 이탈 확인 모달 */}
      {pendingNavSlug !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-amber-600 dark:text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  저장하지 않은 변경사항
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  페이지를 이동하면 변경사항이 사라집니다.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setPendingNavSlug(undefined)}
                className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                계속 편집
              </button>
              <button
                onClick={confirmDiscard}
                className="px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
              >
                저장 않고 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  페이지 삭제
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              <strong className="text-slate-900 dark:text-slate-100">"{currentPage?.title}"</strong>{' '}
              페이지를 삭제하시겠습니까?
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 mb-4 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-60 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {isDeleting && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리비전 복원 확인 모달 */}
      {restoreContent !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-amber-600 dark:text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  이 버전으로 복원
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  현재 내용이 선택한 버전으로 바뀝니다(새 이력으로 기록).
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              선택한 버전의 내용으로 복원하시겠습니까?
            </p>
            {restoreError && (
              <p className="text-xs text-red-500 mb-4 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                {restoreError}
              </p>
            )}
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setRestoreContent(null);
                  setRestoreError(null);
                }}
                disabled={isRestoring}
                className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-60 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {isRestoring && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isRestoring ? '복원 중...' : '복원'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WikiPageRoute;
