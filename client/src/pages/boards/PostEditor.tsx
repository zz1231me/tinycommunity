// client/src/pages/boards/PostEditor.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import hljs from 'highlight.js/lib/common';
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

  // 게시판 이동(수정 모드) — 쓰기 권한 있는 일반 게시판 목록 + 선택값
  const [targetBoard, setTargetBoard] = useState(boardType ?? '');
  const { regularBoards, getBoardById } = useAccessibleBoards();
  const moveTargets = regularBoards.filter(b => b.permissions.canWrite);
  // 실제 게시판 이름 우선(커스텀 게시판은 getBoardTitle이 id를 노출) — API 이름 → getBoardTitle 폴백
  const boardTitle = getBoardById(boardType ?? '')?.name || getBoardTitle(boardType || '');

  // 태그 상태
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // 분할 보기 상태
  const [splitView, setSplitView] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // 분할 보기 미리보기 코드 블록 syntax highlight
  useEffect(() => {
    previewRef.current?.querySelectorAll<HTMLElement>('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block);
    });
  }, [previewHtml]);

  // 비밀글 상태
  const [isSecret, setIsSecret] = useState(false);
  const [secretPassword, setSecretPassword] = useState('');
  const [originalSecretType, setOriginalSecretType] = useState<'password' | 'users' | null>(null);

  // 사이트 설정에서 동적으로 읽는 제한값
  const MAX_TITLE_LENGTH = siteSettings.postTitleMaxLength;
  const MAX_FILES = siteSettings.maxFileCount;
  const MAX_FILE_SIZE = siteSettings.maxFileSizeMb * 1024 * 1024;
  const SECRET_PW_MIN_LENGTH = siteSettings.postSecretPasswordMinLength;
  const AUTO_SAVE_INTERVAL_MS = (siteSettings.autoSaveIntervalSeconds ?? 30) * 1000;
  const DRAFT_EXPIRY_MINUTES = siteSettings.draftExpiryMinutes ?? 60;

  const { handleImageUpload } = useImageUpload();

  // 임시저장 interval에서 클로저 캡처 없이 최신 title/boardType 참조
  const draftRef = useRef({ title, boardType });
  useEffect(() => {
    draftRef.current = { title, boardType };
  }, [title, boardType]);

  // 에디터 ref는 이미 존재 — interval에서 최신 콘텐츠를 직접 읽기 위해 참조 유지

  useEffect(() => {
    let isMounted = true;

    if (mode === 'edit' && id && boardType) {
      const fetchData = async () => {
        try {
          const post = await fetchPostById(boardType, id);
          if (isMounted) {
            // 잠긴 게시글(비밀번호 보호)은 편집 불가
            if (post.isLocked) {
              setError(
                post.isEncrypted
                  ? '종단간 암호화(E2EE) 게시글은 편집할 수 없습니다. 삭제 후 새로 작성해 주세요.'
                  : '비밀번호로 보호된 게시글은 작성자 본인만 편집할 수 있습니다.'
              );
              return;
            }
            setTitle(post.title);
            // 편집은 원본(rawContent)을 로드 — 서버 렌더본(content)은 data-oembed-url 등이
            // 제거돼 동영상 위젯 복원이 안 되고 서식이 변형됨. rawContent로 라운드트립 정합 보장.
            setInitialContent(post.rawContent || post.content || '');
            setEditorKey(prev => prev + 1);

            if (post.attachments?.length > 0) {
              fileLogger.info('첨부파일 정보 로드', { count: post.attachments.length });
              setExistingAttachments(post.attachments);
              setDeletedFileNames([]);
            }

            // 비밀글 설정 로드
            if (post.isSecret) {
              setIsSecret(true);
              setOriginalSecretType((post.secretType as 'password' | 'users') || null);
            }

            // 태그 로드
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

  // ✅ 임시저장 (새 글 작성 모드) - draftRef로 최신값 참조해 interval 재생성 방지
  // 제목과 에디터 내용을 함께 저장
  useEffect(() => {
    if (mode !== 'create') return;
    const timer = setInterval(() => {
      const { title: t, boardType: bt } = draftRef.current;
      const content = editorRef.current?.getInstance()?.getContent?.() ?? '';
      const hasContent =
        t.trim().length > 0 ||
        content
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, '')
          .trim().length > 0;
      if (hasContent) {
        localStorage.setItem(
          'post_draft',
          JSON.stringify({
            title: t,
            content,
            boardType: bt,
            savedAt: Date.now(),
          })
        );
      }
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [mode, AUTO_SAVE_INTERVAL_MS]);

  // ✅ 임시저장 복원 안내 (새 글 작성 마운트 시)
  const [draftNotice, setDraftNotice] = useState<{
    title: string;
    content?: string;
    boardType?: string;
    savedAt: number;
  } | null>(null);
  useEffect(() => {
    if (mode !== 'create') return;
    const saved = localStorage.getItem('post_draft');
    if (saved) {
      try {
        const draft = JSON.parse(saved) as {
          title: string;
          content?: string;
          boardType?: string;
          savedAt: number;
        };
        const ageMinutes = (Date.now() - draft.savedAt) / 60000;
        // 다른 게시판의 임시저장은 복원하지 않음
        // draft.boardType이 없는(구버전 저장본) 경우에도 현재 boardType과 다르면 복원 차단
        if (draft.boardType !== boardType) return;
        if (ageMinutes < DRAFT_EXPIRY_MINUTES && (draft.title || draft.content)) {
          setDraftNotice(draft);
        }
      } catch {
        /* 임시저장 로드 실패 무시 */
      }
    }
  }, [mode, boardType, DRAFT_EXPIRY_MINUTES]);

  const handleRestoreDraft = () => {
    if (draftNotice) {
      setTitle(draftNotice.title);
      // 에디터 내용도 함께 복원
      if (draftNotice.content) {
        setInitialContent(draftNotice.content);
        setEditorKey(prev => prev + 1);
      }
    }
    localStorage.removeItem('post_draft');
    setDraftNotice(null);
  };

  const handleDismissDraft = () => {
    localStorage.removeItem('post_draft');
    setDraftNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ✅ 중복 제출 방지
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

    // 비밀글 유효성 검사
    if (isSecret) {
      const trimmedPw = secretPassword.trim();
      // 공백 전용 입력은 모든 모드에서 먼저 차단
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

    // E2EE 암호화 처리 (비밀글 + 비밀번호 타입일 때)
    let finalContent: string = typeof content === 'string' ? content : JSON.stringify(content);
    let encryptedSalt: string | undefined;
    let isEncrypted = false;

    if (isSecret && secretPassword.trim()) {
      const encrypted = encryptContent(finalContent, secretPassword.trim());
      finalContent = encrypted.ciphertext;
      encryptedSalt = encrypted.salt;
      isEncrypted = true;
    }

    // 비밀글 타입: 비밀번호가 입력된 경우 password 타입, 기존 users 타입이고 비밀번호 미입력이면 유지
    const secretFields = isSecret
      ? isEncrypted
        ? {
            isSecret: true,
            secretType: 'password' as const,
            secretPassword: secretPassword.trim() || undefined,
            secretUserIds: undefined,
            isEncrypted: true,
            secretSalt: encryptedSalt,
          }
        : originalSecretType === 'users' && !secretPassword.trim()
          ? {
              isSecret: true,
              secretType: 'users' as const,
              secretPassword: undefined,
              secretUserIds: undefined, // 서버에서 기존 값 유지
              isEncrypted: false,
            }
          : {
              isSecret: true,
              secretType: 'password' as const,
              secretPassword: secretPassword.trim() || undefined,
              secretUserIds: undefined,
              isEncrypted: false,
            }
      : { isSecret: false };

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
        // 게시판 이동 시 응답의 새 boardType을 기준으로 태그 저장·이동(URL 정합)
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
        localStorage.removeItem('post_draft'); // ✅ 수정 완료 시 임시저장 삭제
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
        localStorage.removeItem('post_draft'); // ✅ 작성 완료 시 임시저장 삭제
        // 작성한 글의 상세 페이지로 바로 이동 (일반 커뮤니티 패턴) — id가 없을 때만 목록 폴백
        if (createdId) {
          navigate(`/dashboard/posts/${boardType}/${createdId}`);
        } else {
          navigate(`/dashboard/posts/${boardType}`);
        }
      }
    } catch (err: unknown) {
      logger.error('저장 실패', err);
      // 409: 게시판 이동 등 충돌 — 서버 메시지를 그대로 노출
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
    // 확장자 제한 없음 — 위험한 확장자는 서버 업로드 필터의 절대차단 목록에서 걸러진다.
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

  const isEditMode = mode === 'edit';
  const submitButtonText = isEditMode ? '수정하기' : '작성하기';

  return (
    <PageContainer>
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center text-primary-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="뒤로 가기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {boardTitle} - {isEditMode ? '게시글 수정' : '새 게시글'}
            </h1>
          </div>
        </div>
      </header>

      <div className="card">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* ✅ 임시저장 복원 알림 */}
          {draftNotice && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg flex items-center justify-between gap-3 text-sm">
              <span>
                임시저장된 글이 있습니다
                {draftNotice.title ? (
                  <>
                    : <strong>"{draftNotice.title}"</strong>
                  </>
                ) : null}
              </span>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleRestoreDraft}
                  className="px-3 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 transition-colors"
                >
                  복원
                </button>
                <button
                  type="button"
                  onClick={handleDismissDraft}
                  className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs hover:bg-slate-300 transition-colors"
                >
                  무시
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <PostTitleInput value={title} onChange={setTitle} maxLength={MAX_TITLE_LENGTH} />

          {/* 게시판 이동 (수정 모드 + 이동 가능한 다른 게시판이 있을 때만) */}
          {isEditMode && moveTargets.some(b => b.id !== boardType) && (
            <div>
              <label
                htmlFor="board-move-select"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                게시판
              </label>
              <select
                id="board-move-select"
                value={targetBoard}
                onChange={e => setTargetBoard(e.target.value)}
                className="input"
              >
                {/* 현재 게시판이 쓰기권한 목록에 없을 수 있으므로 항상 선택지로 포함 */}
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

          {/* 태그 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              태그
            </label>
            <TagSelector
              selectedTags={selectedTags}
              onChange={setSelectedTags}
              boardId={boardType}
            />
          </div>

          {/* 분할 보기 토글 버튼 */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                // ★분할/비분할은 서로 다른 위치의 에디터 인스턴스라 토글 시 에디터가 remount된다.
                // CKEditor는 uncontrolled(내용이 인스턴스에만 존재)이므로, 현재 내용을 캡처해
                // 새로 마운트되는 에디터의 initialContent로 넘기지 않으면 입력 내용이 소실된다.
                // (기존 편집/임시저장 로드와 동일하게 setInitialContent + editorKey 증가로 재seed)
                const html = editorRef.current?.getInstance()?.getContent?.() ?? initialContent;
                setInitialContent(html);
                setEditorKey(prev => prev + 1);
                // 분할 보기를 켤 때만 미리보기 초기화(비분할은 미리보기가 화면에 없어 sanitize 불필요)
                if (!splitView) setPreviewHtml(sanitizeHTML(html));
                setSplitView(v => !v);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                splitView
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50'
              }`}
              title="분할 보기 (미리보기)"
            >
              {splitView ? '📝 편집 전용' : '⚡ 분할 보기'}
            </button>
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
                      // 분할 보기일 때만 sanitize/setState — 비활성 시 큰 글 입력에서 매 키마다
                      // DOMPurify를 호출하는 비용을 회피 (미리보기가 보이지 않아 불필요)
                      if (splitView) setPreviewHtml(sanitizeHTML(html));
                    }}
                  />
                </EditorErrorBoundary>
              </Panel>
              <PanelResizeHandle className="w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-primary-400 transition-colors cursor-col-resize" />
              <Panel defaultSize={50} minSize={30}>
                <div className="h-full overflow-y-auto p-6">
                  <h1 className="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100">
                    {title}
                  </h1>
                  {/* previewHtml은 sanitizeHTML()로 정화 완료 */}
                  <div
                    ref={previewRef}
                    className="ck-content-view"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
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
              />
            </EditorErrorBoundary>
          )}

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

          {/* 비밀글 설정 */}
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
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                🔒 비밀글
              </span>
            </label>

            {isSecret && (
              <div className="pl-7 space-y-3">
                <div className="space-y-1">
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
