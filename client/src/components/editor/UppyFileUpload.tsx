// client/src/components/editor/UppyFileUpload.tsx
// Uppy-powered drag-and-drop file selector.
// Files are collected locally and passed to the parent as File[] objects.
// The actual upload occurs when the parent form is submitted (same flow as FileUploadSection).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Uppy, { type UppyFile, type Meta, type Body } from '@uppy/core';

interface AttachmentInfo {
  url: string;
  originalName: string;
  storedName: string;
  size?: number;
  mimeType?: string;
}

interface UppyFileUploadProps {
  files: File[];
  existingFiles: AttachmentInfo[];
  onNewFilesAdd: (files: File[]) => void;
  onNewFileRemove: (index: number) => void;
  onExistingFileRemove: (index: number) => void;
  maxFiles: number;
  maxFileSize: number;
  isEditMode: boolean;
}

const UppyFileUpload: React.FC<UppyFileUploadProps> = ({
  files,
  existingFiles,
  onNewFilesAdd,
  onNewFileRemove,
  onExistingFileRemove,
  maxFiles,
  maxFileSize,
  isEditMode,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState('');
  const [uppyFiles, setUppyFiles] = useState<UppyFile<Meta, Body>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Uppy instance used only for restriction validation and file tracking
  const uppy = useMemo(
    () =>
      new Uppy({
        restrictions: {
          maxNumberOfFiles: maxFiles,
          maxFileSize,
        },
        autoProceed: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    const syncFiles = () => setUppyFiles([...uppy.getFiles()]);
    // Uppy 기본 메시지는 영어이므로 한국어로 통일.
    // 자체 검증(addFiles)에서 대부분의 경우를 처리하므로 여기는 백업.
    const onRestrictionFailed = (_file: UppyFile<Meta, Body> | undefined, err: Error) => {
      const msg = err?.message ?? '';
      if (msg.includes('exceeds maximum allowed size') || msg.includes('file size')) {
        setLocalError(
          `파일 크기가 최대 허용 크기(${(maxFileSize / 1024 / 1024).toFixed(0)}MB)를 초과합니다.`
        );
      } else if (msg.includes('maxNumberOfFiles')) {
        setLocalError(`파일은 최대 ${maxFiles}개까지 업로드할 수 있습니다.`);
      } else {
        setLocalError('파일을 추가할 수 없습니다.');
      }
    };

    uppy.on('file-added', syncFiles);
    uppy.on('file-removed', syncFiles);
    uppy.on('restriction-failed', onRestrictionFailed);

    return () => {
      uppy.off('file-added', syncFiles);
      uppy.off('file-removed', syncFiles);
      uppy.off('restriction-failed', onRestrictionFailed);
      uppy.destroy();
    };
  }, [uppy, maxFileSize, maxFiles]);

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      setLocalError('');

      const incoming = Array.from(fileList);

      // oversized/valid 분리 — 일부 파일이 크기 초과여도 나머지 정상 파일은 허용 (fix #78)
      const oversized: File[] = [];
      const validBySize: File[] = [];
      for (const f of incoming) {
        if (f.size > maxFileSize) oversized.push(f);
        else validBySize.push(f);
      }

      // 잔여 슬롯까지만 받고 나머지는 거부 (모두 거부하면 UX 나쁨)
      const remainingSlots = Math.max(0, maxFiles - existingFiles.length - files.length);
      const accepted = validBySize.slice(0, remainingSlots);
      const overCount = validBySize.length - accepted.length;

      const errors: string[] = [];
      if (oversized.length > 0) {
        errors.push(
          `파일 크기 ${Math.round(maxFileSize / 1024 / 1024)}MB 초과: ${oversized
            .map(f => f.name)
            .join(', ')}`
        );
      }
      if (overCount > 0) {
        errors.push(`최대 ${maxFiles}개 제한으로 ${overCount}개 파일이 추가되지 않았습니다.`);
      }
      if (errors.length > 0) setLocalError(errors.join(' / '));

      if (accepted.length === 0) return;

      // Register with Uppy for UI tracking
      accepted.forEach(file => {
        try {
          uppy.addFile({ name: file.name, type: file.type, data: file });
        } catch {
          // Uppy throws if restriction fails — already handled by restriction-failed event
        }
      });

      onNewFilesAdd(accepted);
    },
    [uppy, existingFiles.length, files.length, maxFiles, maxFileSize, onNewFilesAdd]
  );

  const handleRemoveNew = (index: number) => {
    const file = uppyFiles[index];
    if (file) uppy.removeFile(file.id);
    onNewFileRemove(index);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const totalFiles = existingFiles.length + files.length;

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          첨부파일
        </label>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          최대 {maxFiles}개, 각 {Math.round(maxFileSize / 1024 / 1024)}MB 이하
        </span>
      </div>

      <div className="space-y-3">
        {/* Existing attachments (edit mode) */}
        {isEditMode && existingFiles.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              기존 첨부파일
            </span>
            {existingFiles.map((f, i) => (
              <div
                key={f.storedName}
                className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-sm"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                  {f.originalName}
                </span>
                {f.size !== undefined && (
                  <span className="text-xs text-slate-400">{formatSize(f.size)}</span>
                )}
                <button
                  type="button"
                  onClick={() => onExistingFileRemove(i)}
                  className="text-red-400 hover:text-red-600 text-xs font-bold leading-none"
                  aria-label={`${f.originalName} 제거`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Newly added files */}
        {files.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              새 첨부파일
            </span>
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{f.name}</span>
                <span className="text-xs text-slate-400">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveNew(i)}
                  className="text-red-400 hover:text-red-600 text-xs font-bold leading-none"
                  aria-label={`${f.name} 제거`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drag & drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-primary-400 dark:hover:border-primary-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-primary-50 dark:hover:bg-primary-900/10'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleInputChange}
            aria-hidden="true"
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-slate-600 dark:text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isDragOver ? '파일을 여기에 놓으세요' : '파일을 선택하거나 드래그하세요'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                현재: {totalFiles}/{maxFiles}개
              </p>
            </div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
            >
              파일 선택
            </button>
          </div>
        </div>

        {localError && <p className="text-xs text-red-500 dark:text-red-400">{localError}</p>}
      </div>
    </div>
  );
};

export default UppyFileUpload;
