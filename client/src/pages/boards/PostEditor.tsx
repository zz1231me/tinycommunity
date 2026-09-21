import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useCodeHighlight } from '../../hooks/useCodeHighlight';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Columns2 } from 'lucide-react';
import 'highlight.js/styles/atom-one-dark.min.css';

import {
  CKEditorWrapper,
  CKEditorRef,
  PostTitleInput,
  EditorErrorBoundary,
} from '../../components/editor';
import { PageContainer } from '../../components/common/PageContainer';
import UppyFileUpload from '../../components/editor/UppyFileUpload';
import { fetchPostById, createPost, updatePost } from '../../api/posts';
import { getBoardTitle } from '../../constants/boardTitles';
import { logger, fileLogger } from '../../utils/logger';
import { useImageUpload } from '../../hooks/useImageUpload';
import { useAccessibleBoards } from '../../hooks/useAccessibleBoards';
import { TagSelector } from '../../components/boards/TagSelector';
import { getPostTags, savePostTags } from '../../api/tags';
import { Tag } from '../../types/board.types';
import { encryptContent } from '../../utils/crypto';
import { useSiteSettings } from '../../store/siteSettings';
import { sanitizeHTML } from '../../utils/htmlSanitizer';
import { useFeature } from '../../store/features';
import { UserPicker } from '../../components/common/UserPicker';
import type { UserSuggestion } from '../../api/users';
import { useAuth } from '../../store/auth';
import { useDraftAutoSave } from '../../hooks/useDraftAutoSave';
import { deleteDraft, fetchDraft } from '../../api/drafts';
import { formatRelativeDate } from '../../utils/date';
import '../../styles/CKContentView.css';

interface AttachmentInfo {
  url: string;
  originalName: string;
  storedName: string;
  size?: number;
  mimeType?: string;
}

type Props = {
  mode: 'create' | 'edit';
};

const PostEditor = ({ mode }: Props) => {
  const { id, boardType } = useParams<{ id: string; boardType: string }>();
  // 임시저장 목록에서 이어쓰기로 들어오면 ?draft=<id> 가 붙는다
  const [searchParams] = useSearchParams();
  const resumeDraftId = searchParams.get('draft');
  const navigate = useNavigate();
  const editorRef = useRef<CKEditorRef | null>(null);
  const { settings: siteSettings } = useSiteSettings();

  const [title, setTitle] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<AttachmentInfo[]>([]);
  const [deletedFileNames, setDeletedFileNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState('');

  // 수정 모드의 게시판 이동. 쓰기 권한이 있는 일반 게시판만 고를 수 있다.
  const [targetBoard, setTargetBoard] = useState(boardType ?? '');
  const { regularBoards, getBoardById } = useAccessibleBoards();
  const moveTargets = regularBoards.filter(b => b.permissions.canWrite);
  // 커스텀 게시판은 getBoardTitle 이 id 를 노출하므로 API 이름을 먼저 쓴다.
  const boardTitle = getBoardById(boardType ?? '')?.name || getBoardTitle(boardType || '');

  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  const [splitView, setSplitView] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  // dangerouslySetInnerHTML 은 객체 참조로 비교되므로 객체까지 기억해 둔다.
  const previewBodyHtml = useMemo(() => ({ __html: previewHtml }), [previewHtml]);
  const previewRef = useRef<HTMLDivElement>(null);

  // 분할 보기 미리보기 코드 블록 syntax highlight
  useCodeHighlight(previewRef);

  const [isSecret, setIsSecret] = useState(false);
  const [secretPassword, setSecretPassword] = useState('');
  const [originalSecretType, setOriginalSecretType] = useState<'password' | 'users' | null>(null);
  // 비밀글 방식. 비밀번호를 아는 사람 또는 지정한 사람만.
  const [secretMode, setSecretMode] = useState<'password' | 'users'>('password');
  const currentUserId = useAuth(s => s.getUserId());
  const [allowedUsers, setAllowedUsers] = useState<UserSuggestion[]>([]);

  // 사이트 설정에서 동적으로 읽는 제한값
  const MAX_TITLE_LENGTH = siteSettings.postTitleMaxLength;
  const MAX_FILES = siteSettings.maxFileCount;
  const MAX_FILE_SIZE = siteSettings.maxFileSizeMb * 1024 * 1024;
  const SECRET_PW_MIN_LENGTH = siteSettings.postSecretPasswordMinLength;
  const AUTO_SAVE_INTERVAL_MS = (siteSettings.autoSaveIntervalSeconds ?? 30) * 1000;

  const { handleImageUpload } = useImageUpload();

  // interval 에서 최신 title/boardType 을 읽기 위한 ref
  const draftRef = useRef({ title, boardType });
  useEffect(() => {
    draftRef.current = { title, boardType };
  }, [title, boardType]);

  useEffect(() => {
    let isMounted = true;

    if (mode === 'edit' && id && boardType) {
      const fetchData = async () => {
        try {
          const post = await fetchPostById(boardType, id);
          if (isMounted) {
            if (post.isLocked) {
              setError(
                post.isEncrypted
                  ? '종단간 암호화(E2EE) 게시글은 편집할 수 없습니다. 삭제 후 새로 작성해주세요.'
                  : '비밀번호로 보호된 게시글은 작성자 본인만 편집할 수 있습니다.'
              );
              return;
            }
            setTitle(post.title);
            // 서버 렌더본은 data-oembed-url 등이 빠지므로 편집에는 rawContent 를 쓴다.
            setInitialContent(post.rawContent || post.content || '');
            setEditorKey(prev => prev + 1);

            if (post.attachments?.length > 0) {
              fileLogger.info('첨부파일 정보 로드', { count: post.attachments.length });
              setExistingAttachments(post.attachments);
              setDeletedFileNames([]);
            }

            if (post.isSecret) {
              setIsSecret(true);
              const type = (post.secretType as 'password' | 'users') || null;
              setOriginalSecretType(type);
              // 저장된 방식 그대로 열어 준다.
              if (type) setSecretMode(type);
              // 허용된 사람들을 그대로 채운다. 비워 두면 고르는 순간 목록이 교체된다.
              if (Array.isArray(post.secretAllowedUsers)) {
                setAllowedUsers(post.secretAllowedUsers);
              }
            }

            try {
              const tags = await getPostTags(boardType, id);
              if (isMounted) setSelectedTags(tags);
            } catch {
              // ignore tag load failure
            }
          }
        } catch (err) {
          logger.error('게시글 불러오기 실패', err);
          setError('글을 불러오는 데 실패했습니다.');
        }
      };
      fetchData();
    }

    return () => {
      isMounted = false;
    };
  }, [mode, id, boardType]);

  // 임시저장은 서버에 보관한다.
  const readSnapshot = useCallback(
    () => ({
      title: draftRef.current.title,
      content: editorRef.current?.getInstance()?.getContent?.() ?? '',
    }),
    []
  );
  // 임시저장 기능이 꺼져 있으면 돌리지 않는다. 서버가 거절해 실패만 반복된다.
  const draftsEnabled = useFeature('post.drafts');
  const draft = useDraftAutoSave({
    enabled: mode === 'create' && draftsEnabled,
    boardType,
    intervalMs: AUTO_SAVE_INTERVAL_MS,
    initialDraftId: resumeDraftId,
    read: readSnapshot,
  });

  // ?draft=<id> 로 들어오면 그 임시저장 본문을 불러온다.
  useEffect(() => {
    if (mode !== 'create' || !resumeDraftId) return;
    let cancelled = false;
    fetchDraft(resumeDraftId)
      .then(loaded => {
        if (cancelled) return;
        setTitle(loaded.title);
        setInitialContent(loaded.content);
        setEditorKey(prev => prev + 1);
      })
      .catch(() => {
        if (!cancelled) setError('임시저장을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [mode, resumeDraftId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!boardType) {
      setError('게시판 유형이 없습니다.');
      return;
    }

    const content = editorRef.current?.getInstance()?.getContent() || '';

    if (!title?.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }

    // CKEditor returns HTML; check for text or embedded media
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const textContent = contentStr
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    const hasMedia = /<img|<video|<audio|<iframe/i.test(contentStr);
    if (!textContent && !hasMedia) {
      setError('내용을 입력해주세요.');
      return;
    }

    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      setError(
        `파일 크기는 ${siteSettings.maxFileSizeMb}MB를 초과할 수 없습니다. 초과 파일: ${oversizedFiles.map(f => f.name).join(', ')}`
      );
      return;
    }

    const totalFiles = existingAttachments.length + files.length;
    if (totalFiles > MAX_FILES) {
      setError(`최대 ${MAX_FILES}개의 파일만 첨부할 수 있습니다. (현재: ${totalFiles}개)`);
      return;
    }

    setError('');

    if (isSecret && secretMode === 'users') {
      // 지정 방식은 사람을 한 명 이상 골라야 한다. 수정할 때도 같다.
      if (allowedUsers.length === 0) {
        setError('열람을 허용할 사람을 한 명 이상 선택해주세요.');
        return;
      }
    } else if (isSecret) {
      const trimmedPw = secretPassword.trim();
      if (secretPassword && !trimmedPw) {
        setError('비밀글 비밀번호에 공백만 입력할 수 없습니다.');
        return;
      }
      // 비밀글 새로 설정(create 또는 기존에 비밀글 아닌 경우) 시 비밀번호 필수
      // 기존 비밀글(password/users 타입) 수정 시에는 비밀번호 미입력 허용 (서버가 기존 값 유지)
      if (!trimmedPw && originalSecretType === null) {
        setError('비밀글 비밀번호를 입력해주세요.');
        return;
      }
      if (trimmedPw && trimmedPw.length < SECRET_PW_MIN_LENGTH) {
        setError(`비밀글 비밀번호는 최소 ${SECRET_PW_MIN_LENGTH}자 이상이어야 합니다.`);
        return;
      }
    }

    let finalContent: string = typeof content === 'string' ? content : JSON.stringify(content);
    let encryptedSalt: string | undefined;
    let isEncrypted = false;

    // E2EE 는 비밀번호 방식에서만 성립한다.
    if (isSecret && secretMode === 'password' && secretPassword.trim()) {
      const encrypted = encryptContent(finalContent, secretPassword.trim());
      finalContent = encrypted.ciphertext;
      encryptedSalt = encrypted.salt;
      isEncrypted = true;
    }

    // 지정 방식은 비밀번호가 없으므로 E2EE 도 걸지 않는다.
    const secretFields = !isSecret
      ? { isSecret: false as const }
      : secretMode === 'users'
        ? {
            isSecret: true as const,
            secretType: 'users' as const,
            secretPassword: undefined,
            secretUserIds: allowedUsers.map(u => u.id),
            isEncrypted: false,
          }
        : {
            isSecret: true as const,
            secretType: 'password' as const,
            secretPassword: secretPassword.trim() || undefined,
            secretUserIds: undefined,
            isEncrypted,
            secretSalt: encryptedSalt,
          };

    try {
      setLoading(true);

      if (mode === 'edit' && id) {
        const updated = await updatePost(boardType, id, {
          title,
          content: finalContent,
          files,
          keepExistingFiles: true,
          deletedFileNames,
          targetBoardType: targetBoard,
          ...secretFields,
        });
        // 게시판을 옮겼으면 응답의 새 boardType 을 기준으로 태그를 저장하고 이동한다.
        const finalBoardType = updated?.boardType || targetBoard || boardType;
        try {
          await savePostTags(
            finalBoardType,
            id,
            selectedTags.map(t => t.id)
          );
        } catch (tagErr) {
          logger.warn('태그 저장에 실패했습니다. 게시글은 저장되었습니다.', tagErr);
        }
        logger.success('게시글 수정 완료');
        window.dispatchEvent(new Event('post-updated'));
        navigate(`/dashboard/posts/${finalBoardType}/${id}`);
      } else if (mode === 'create') {
        const res = await createPost({
          title,
          content: finalContent,
          boardType,
          files,
          ...secretFields,
        });
        const createdId = res?.id;
        if (createdId && selectedTags.length > 0) {
          try {
            await savePostTags(
              boardType,
              String(createdId),
              selectedTags.map(t => t.id)
            );
          } catch (tagErr) {
            logger.warn('태그 저장에 실패했습니다. 게시글은 저장되었습니다.', tagErr);
          }
        }
        logger.success('게시글 작성 완료');
        // 발행했으면 초안을 지운다. 실패해도 글은 이미 올라갔으므로 막지 않는다.
        if (draft.draftId) {
          draft.forget();
          deleteDraft(draft.draftId).catch(err =>
            logger.warn('임시저장 삭제에 실패했습니다.', err)
          );
        }
        // id 가 없을 때만 목록으로 폴백한다.
        if (createdId) {
          navigate(`/dashboard/posts/${boardType}/${createdId}`);
        } else {
          navigate(`/dashboard/posts/${boardType}`);
        }
      }
    } catch (err: unknown) {
      logger.error('저장 실패', err);
      // 409 는 서버 메시지를 그대로 보여 준다.
      const response = (err as { response?: { status?: number; data?: { message?: string } } })
        ?.response;
      if (response?.status === 409) {
        setError(
          response.data?.message ||
            '게시글 상태가 변경되었습니다. 페이지를 새로고침한 후 다시 시도해주세요.'
        );
      } else {
        const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNewFilesAdd = (newFiles: File[]) => {
    // 확장자 제한은 서버 업로드 필터가 맡는다.
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleNewFileRemove = (index: number) => {
    fileLogger.debug('새 파일 삭제', { index, fileName: files[index]?.name });
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleExistingFileRemove = (index: number) => {
    const fileToRemove = existingAttachments[index];
    fileLogger.debug('기존 파일 삭제', { index, fileName: fileToRemove?.originalName });

    if (fileToRemove) {
      setDeletedFileNames(prev => [...prev, fileToRemove.storedName]);
      setExistingAttachments(prev => prev.filter((_, i) => i !== index));
    }
  };

  // 참조는 원본 파일명으로 하므로 아직 업로드되지 않은 파일도 꽂을 수 있다.
  const attachmentsEnabled = useFeature('post.attachments');
  const attachmentNames = [
    ...new Set([...existingAttachments.map(a => a.originalName), ...files.map(f => f.name)]),
  ];

  const isEditMode = mode === 'edit';
  const submitButtonText = isEditMode ? '수정하기' : '작성하기';

  const splitViewToggle = (
    <button
      type="button"
      onClick={() => {
        // 토글하면 에디터가 remount 된다. CKEditor 는 uncontrolled 라 내용을 넘기지 않으면 사라진다.
        const html = editorRef.current?.getInstance()?.getContent?.() ?? initialContent;
        setInitialContent(html);
        setEditorKey(prev => prev + 1);
        // 미리보기가 보일 때만 sanitize 한다.
        if (!splitView) setPreviewHtml(sanitizeHTML(html));
        setSplitView(v => !v);
      }}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
        splitView
          ? 'border-primary-600 bg-primary-600 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
      title="분할 보기 (미리보기)"
    >
      <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
      {splitView ? '편집 전용' : '분할 보기'}
    </button>
  );

  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-700/60">
        <button
          onClick={() => navigate(-1)}
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          aria-label="뒤로 가기"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </button>
        <h1 className="page-title min-w-0 truncate">
          {boardTitle}
          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
          <span className="font-medium text-slate-500 dark:text-slate-400">
            {isEditMode ? '게시글 수정' : '새 게시글'}
          </span>
        </h1>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5 p-5">
          {/* 자동저장 줄이 나중에 생기며 아래를 밀지 않도록 자리를 미리 비워 둔다. */}
          {mode === 'create' && (
            <div aria-live="polite" className="min-h-9">
              {(draft.savedAt || draft.failed) && (
                <div
                  className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2 text-xs ${
                    draft.failed
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400'
                  }`}
                >
                  <span>
                    {draft.failed
                      ? '임시저장에 실패했습니다. 연결을 확인해주세요.'
                      : `임시저장됨 · ${formatRelativeDate(draft.savedAt!.toISOString())}`}
                  </span>
                  <Link
                    to="/dashboard/drafts"
                    className="flex-shrink-0 underline underline-offset-2 hover:no-underline"
                  >
                    임시저장 목록
                  </Link>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <PostTitleInput value={title} onChange={setTitle} maxLength={MAX_TITLE_LENGTH} />

          {isEditMode && moveTargets.some(b => b.id !== boardType) && (
            <div>
              <label
                htmlFor="board-move-select"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                게시판
              </label>
              <select
                id="board-move-select"
                value={targetBoard}
                onChange={e => setTargetBoard(e.target.value)}
                className="input"
              >
                {/* 현재 게시판은 쓰기 권한 목록에 없을 수 있어 항상 선택지에 넣는다 */}
                {boardType && !moveTargets.some(b => b.id === boardType) && (
                  <option value={boardType}>{boardTitle} (현재)</option>
                )}
                {moveTargets.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name || getBoardTitle(b.id)}
                    {b.id === boardType ? ' (현재)' : ''}
                  </option>
                ))}
              </select>
              {targetBoard !== boardType && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  저장 시 「{getBoardTitle(targetBoard)}」(으)로 이동합니다.
                </p>
              )}
            </div>
          )}

          <div role="group" aria-labelledby="post-tags-label">
            {/* 입력칸이 아니라 고르는 영역이라 label 로 이을 수 없다 */}
            <span
              id="post-tags-label"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              태그
            </span>
            <TagSelector
              selectedTags={selectedTags}
              onChange={setSelectedTags}
              boardId={boardType}
            />
          </div>

          {splitView ? (
            <PanelGroup
              orientation="horizontal"
              className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
              style={{ height: '600px' }}
            >
              <Panel defaultSize={50} minSize={30}>
                <EditorErrorBoundary
                  key={editorKey}
                  editorRef={editorRef}
                  onImageUpload={handleImageUpload}
                  initialContent={initialContent}
                  placeholder={
                    boardType ? `${boardTitle}의 내용을 작성해주세요...` : '내용을 작성해주세요...'
                  }
                  onChange={html => {
                    if (splitView) setPreviewHtml(sanitizeHTML(html));
                  }}
                >
                  <CKEditorWrapper
                    key={editorKey}
                    editorRef={editorRef}
                    onImageUpload={handleImageUpload}
                    initialContent={initialContent}
                    placeholder={
                      boardType
                        ? `${boardTitle}의 내용을 작성해주세요...`
                        : '내용을 작성해주세요...'
                    }
                    onChange={html => {
                      // 미리보기가 보일 때만 sanitize 한다. 아니면 매 키마다 DOMPurify 가 돈다.
                      if (splitView) setPreviewHtml(sanitizeHTML(html));
                    }}
                    attachmentNames={attachmentNames}
                    headerAction={splitViewToggle}
                  />
                </EditorErrorBoundary>
              </Panel>
              <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-primary-400 transition-colors cursor-col-resize" />
              <Panel defaultSize={50} minSize={30}>
                <div className="h-full overflow-y-auto p-6">
                  <h1 className="doc-title mb-4">{title}</h1>
                  {/* previewHtml 은 sanitizeHTML() 로 정화된 값이다 */}
                  <div
                    ref={previewRef}
                    className="ck-content-view"
                    dangerouslySetInnerHTML={previewBodyHtml}
                  />
                </div>
              </Panel>
            </PanelGroup>
          ) : (
            <EditorErrorBoundary
              key={editorKey}
              editorRef={editorRef}
              onImageUpload={handleImageUpload}
              initialContent={initialContent}
              placeholder={
                boardType ? `${boardTitle}의 내용을 작성해주세요...` : '내용을 작성해주세요...'
              }
              onChange={() => {}}
            >
              <CKEditorWrapper
                key={editorKey}
                editorRef={editorRef}
                onImageUpload={handleImageUpload}
                initialContent={initialContent}
                placeholder={
                  boardType ? `${boardTitle}의 내용을 작성해주세요...` : '내용을 작성해주세요...'
                }
                onChange={() => {}}
                attachmentNames={attachmentNames}
                headerAction={splitViewToggle}
              />
            </EditorErrorBoundary>
          )}

          {/* 첨부가 꺼져 있으면 업로더를 두지 않는다. 저장할 때가 되어서야 403 이 난다 */}
          {attachmentsEnabled && (
            <UppyFileUpload
              files={files}
              existingFiles={existingAttachments}
              onNewFilesAdd={handleNewFilesAdd}
              onNewFileRemove={handleNewFileRemove}
              onExistingFileRemove={handleExistingFileRemove}
              maxFiles={MAX_FILES}
              maxFileSize={MAX_FILE_SIZE}
              isEditMode={isEditMode}
            />
          )}

          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isSecret}
                onChange={e => {
                  setIsSecret(e.target.checked);
                  if (!e.target.checked) {
                    setSecretPassword('');
                  }
                }}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                🔒 비밀글
              </span>
            </label>

            {isSecret && (
              <div className="pl-7 space-y-3">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="비밀글 방식">
                  {[
                    { value: 'password' as const, label: '비밀번호를 아는 사람' },
                    { value: 'users' as const, label: '지정한 사람만' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={secretMode === option.value}
                      onClick={() => setSecretMode(option.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        secretMode === option.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {secretMode === 'users' && (
                  <div className="max-w-md space-y-1">
                    <UserPicker
                      selected={allowedUsers}
                      onChange={setAllowedUsers}
                      excludeIds={currentUserId ? [currentUserId] : []}
                      placeholder="열람을 허용할 사람 검색"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      작성자 본인과 여기서 고른 사람만 이 글을 볼 수 있습니다.
                    </p>
                  </div>
                )}

                <div className={secretMode === 'users' ? 'hidden' : 'space-y-1'}>
                  <input
                    type="password"
                    value={secretPassword}
                    onChange={e => setSecretPassword(e.target.value)}
                    placeholder={
                      mode === 'edit'
                        ? `변경하려면 새 비밀번호 입력 (최소 ${SECRET_PW_MIN_LENGTH}자), 유지 시 빈칸`
                        : `비밀번호 (최소 ${SECRET_PW_MIN_LENGTH}자)`
                    }
                    minLength={SECRET_PW_MIN_LENGTH}
                    className="input-field w-full max-w-xs"
                    autoComplete="new-password"
                  />
                  {mode === 'edit' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      비워두면 기존 비밀번호가 유지됩니다.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <span className="text-base">🔐</span>
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300">
                      E2EE 종단간 암호화
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      비밀번호로 콘텐츠를 암호화하여 서버에서도 내용을 알 수 없습니다
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end items-center pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={loading}
                className="btn-secondary"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading || !title?.trim()}
                aria-busy={loading}
                className="btn-primary disabled:opacity-50 inline-flex items-center gap-2"
              >
                {loading && (
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 inline-block rounded-full border-2 border-white border-t-transparent animate-spin"
                  />
                )}
                {loading
                  ? files && files.length > 0
                    ? '파일 업로드 중...'
                    : '저장 중...'
                  : submitButtonText}
              </button>
            </div>
          </div>
        </form>
      </div>
    </PageContainer>
  );
};

export default PostEditor;
