import React, { useRef, useEffect, useMemo, useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor, type EditorConfig } from 'ckeditor5';
import { buildEditorConfig } from './editorConfig';
import './CKEditorOverride.css';
import MentionAutocomplete, { type MentionEditor } from '../MentionAutocomplete';
import AttachmentRefPlugin from '../AttachmentRefPlugin';
import AttachmentRefPicker, { type AttachmentRefEditor } from '../AttachmentRefPicker';
import { useFeature } from '../../../store/features';

// 모듈 수준 ref. CKEditor 플러그인은 한 번만 생성되므로 prop 이 바뀌어도 stale closure 가 되지 않게 한다.
type UploadFn = (
  blob: Blob,
  callback: (url: string, alt?: string) => void,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (e: { loaded: number; total: number }) => void;
  }
) => Promise<void> | void;

const uploadFnRef = {
  current: null as UploadFn | null,
};

class CKEditorUploadAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loader: any;
  private controller = new AbortController();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(loader: any) {
    this.loader = loader;
  }
  upload(): Promise<{ default: string }> {
    return this.loader.file.then((file: File) => {
      return new Promise<{ default: string }>((resolve, reject) => {
        const fn = uploadFnRef.current;
        if (!fn) {
          reject(new Error('이미지 업로드 핸들러가 설정되지 않았습니다.'));
          return;
        }
        let settled = false;
        const result = fn(
          file,
          (url: string) => {
            settled = true;
            resolve({ default: url });
          },
          {
            signal: this.controller.signal,
            onProgress: ({ loaded, total }) => {
              this.loader.uploadTotal = total;
              this.loader.uploaded = loaded;
            },
          }
        );
        // useImageUpload 가 throw 하면 reject 되므로 어댑터로 전파한다.
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(err => {
            if (!settled) reject(err);
          });
        }
      });
    });
  }
  abort() {
    this.controller.abort();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UploadAdapterPlugin(editor: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.plugins.get('FileRepository').createUploadAdapter = (loader: any) => {
    return new CKEditorUploadAdapter(loader);
  };
}

interface CKEditorWrapperProps {
  onImageUpload: UploadFn;
  initialContent?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  editorRef?: React.MutableRefObject<CKEditorRef | null>;
  /** 본문에 증적으로 꽂을 수 있는 첨부의 원본 파일명 (저장된 것 + 방금 고른 것) */
  attachmentNames?: string[];
  /** 라벨 오른쪽에 놓을 조작 버튼 (분할 보기 토글 등) */
  headerAction?: React.ReactNode;
}

export interface CKEditorRef {
  getInstance: () => {
    getContent: () => string;
    setContent: (content: string) => void;
    focus: () => void;
  };
}

const CKEditorWrapper: React.FC<CKEditorWrapperProps> = ({
  onImageUpload,
  initialContent = '',
  onChange,
  placeholder = '내용을 입력하세요...',
  editorRef,
  attachmentNames = [],
  headerAction,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorInstanceRef = useRef<any>(null);
  const [wordCount, setWordCount] = useState(0);
  // @멘션 자동완성이 붙을 인스턴스 (onReady 이후에만 유효)
  const [mentionEditor, setMentionEditor] = useState<MentionEditor | null>(null);
  // 증적 첨부 피커가 붙을 인스턴스 (onReady 이후에만 유효)
  const [refEditor, setRefEditor] = useState<AttachmentRefEditor | null>(null);
  // 문단별 첨부가 꺼져 있으면 꽂을 수단 자체를 두지 않는다
  const inlineAttachmentsEnabled = useFeature('post.inlineAttachments');

  useEffect(() => {
    uploadFnRef.current = onImageUpload;
  }, [onImageUpload]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      getInstance: () => ({
        getContent: () => editorInstanceRef.current?.getData() ?? '',
        setContent: (content: string) => editorInstanceRef.current?.setData(content),
        focus: () => editorInstanceRef.current?.editing?.view?.focus(),
      }),
    };
  }, [editorRef]);

  // placeholder 가 바뀔 때만 설정을 다시 만든다.
  const editorConfig = useMemo<EditorConfig>(
    () =>
      buildEditorConfig('post', {
        placeholder,
        extraPlugins: [UploadAdapterPlugin, AttachmentRefPlugin],
        onWordCount: setWordCount,
      }),
    [placeholder]
  );

  return (
    <div className="w-full">
      {/* 라벨과 그 영역을 조작하는 버튼을 한 줄에 둔다. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          id="post-editor-label"
          className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          내용
        </span>
        {headerAction}
      </div>
      <MentionAutocomplete editor={mentionEditor} />
      <div
        className="ck-editor-wrapper post-ck-editor-wrapper"
        role="group"
        aria-labelledby="post-editor-label"
      >
        <CKEditor
          editor={ClassicEditor}
          config={editorConfig}
          data={initialContent}
          onReady={editor => {
            editorInstanceRef.current = editor;
            setMentionEditor(editor as unknown as MentionEditor);
            setRefEditor(editor as unknown as AttachmentRefEditor);
            // a11y: 편집 영역에 한국어 접근성 이름을 준다.
            editor.editing.view.change(writer => {
              const root = editor.editing.view.document.getRoot();
              if (root) writer.setAttribute('aria-label', '내용 입력 영역', root);
            });
          }}
          onChange={(_event, editor) => {
            if (onChange) {
              onChange(editor.getData());
            }
          }}
          onError={error => {
            if (import.meta.env.DEV) console.error('CKEditor error:', error);
          }}
        />
      </div>
      {inlineAttachmentsEnabled && (
        <AttachmentRefPicker editor={refEditor} attachmentNames={attachmentNames} />
      )}
      {wordCount > 0 && (
        <p className="mt-1 text-right text-xs text-slate-400 select-none">
          {wordCount.toLocaleString()} 자
        </p>
      )}
    </div>
  );
};

export default CKEditorWrapper;
