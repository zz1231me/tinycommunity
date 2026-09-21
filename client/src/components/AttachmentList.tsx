import React, { useState } from 'react';
import { LoadingSpinner } from './common/LoadingStates';
import { useQuery } from '@tanstack/react-query';
import { downloadFile } from '../utils/downloadUtils';
import { toast } from '../utils/toast';
import { getFileType, getFileConfig, formatFileSize, isImageFile } from '../utils/fileUtils';
import FileIcon from './FileIcon';
import ImageViewer from './ImageViewer';
import { FilePreview } from './common/FilePreview';
import { AttachmentVersions } from './boards/AttachmentVersions';
import { fetchAttachmentVersions } from '../api/tasks';
import { taskKeys } from '../api/queryKeys';

interface AttachmentInfo {
  url: string;
  originalName: string;
  storedName: string;
  size?: number;
  mimeType?: string;
}

interface AttachmentListProps {
  attachments: AttachmentInfo[];
  /** 개정 이력을 함께 보여 줄 글. 없으면 목록만 그린다. */
  boardType?: string;
  postId?: string;
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, boardType, postId }) => {
  // 같은 이름으로 교체되어 밀려난 예전 파일들. 없는 것이 정상이다.
  const { data: versionGroups = [] } = useQuery({
    queryKey: taskKeys.attachmentVersions(boardType ?? '', postId ?? ''),
    queryFn: ({ signal }) => fetchAttachmentVersions(boardType!, postId!, signal),
    enabled: Boolean(boardType && postId && attachments.length > 0),
    staleTime: 60_000,
  });

  const [imageViewer, setImageViewer] = useState<{
    isOpen: boolean;
    imageUrl: string;
    altText: string;
  }>({
    isOpen: false,
    imageUrl: '',
    altText: '',
  });

  // 내려받는 중인 파일들. 여러 개를 동시에 받을 수 있게 집합으로 두고, 같은 파일의 중복 클릭만 막는다.
  const [downloading, setDownloading] = useState<ReadonlySet<string>>(() => new Set());

  const runDownload = async (fileInfo: AttachmentInfo) => {
    const key = fileInfo.storedName;
    if (downloading.has(key)) return;
    setDownloading(prev => new Set(prev).add(key));
    try {
      await downloadFile({
        storedName: key,
        originalName: fileInfo.originalName,
        url: fileInfo.url,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다.');
    } finally {
      setDownloading(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleDownload = async (e: React.MouseEvent, fileInfo: AttachmentInfo) => {
    e.stopPropagation();
    await runDownload(fileInfo);
  };

  const handleImageClick = (fileInfo: AttachmentInfo) => {
    setImageViewer({
      isOpen: true,
      imageUrl: fileInfo.url || `/api/files/${fileInfo.storedName}`,
      altText: fileInfo.originalName,
    });
  };

  const closeImageViewer = () => {
    setImageViewer({
      isOpen: false,
      imageUrl: '',
      altText: '',
    });
  };

  // 이미지는 확대, 그 밖의 파일은 다운로드.
  const handleFileClick = async (fileInfo: AttachmentInfo) => {
    const isImage = isImageFile(fileInfo.originalName);

    if (isImage) {
      handleImageClick(fileInfo);
    } else {
      await runDownload(fileInfo);
    }
  };

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <>
      <section className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 transition-colors duration-300">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <svg
            aria-hidden="true"
            className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
            />
          </svg>
          <h3 className="text-sm font-semibold sm:text-base text-slate-900 dark:text-slate-100">
            첨부파일 ({attachments.length}개)
          </h3>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {attachments.map((fileInfo, index) => {
            const displayName = fileInfo.originalName || `파일_${index + 1}`;
            const fileType = getFileType(displayName);
            const fileConfig = getFileConfig(fileType);
            const isImage = isImageFile(displayName);

            return (
              <div
                key={index}
                className="bg-white dark:bg-slate-800 rounded-lg sm:rounded-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 group">
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleFileClick(fileInfo)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleFileClick(fileInfo);
                      }
                    }}
                    aria-label={isImage ? `${displayName} 이미지 확대` : `${displayName} 다운로드`}
                  >
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-lg ${fileConfig.color} flex-shrink-0`}
                    >
                      <FileIcon fileType={fileType} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                          title={displayName}
                        >
                          {displayName}
                        </div>
                        {isImage && <span className="badge badge-info flex-shrink-0">확대</span>}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {fileType} 파일
                        {fileInfo.size && ` • ${formatFileSize(fileInfo.size)}`}
                      </div>
                    </div>
                  </div>

                  {/* 다운로드 버튼은 파일 종류와 무관하게 항상 둔다. */}
                  <button
                    onClick={e => handleDownload(e, fileInfo)}
                    disabled={downloading.has(fileInfo.storedName)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                    aria-label={`${displayName} 다운로드`}
                    title="다운로드"
                  >
                    {downloading.has(fileInfo.storedName) ? (
                      <>
                        <LoadingSpinner inline size="sm" />
                        <span className="hidden sm:inline">받는 중…</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                          />
                        </svg>
                        <span className="hidden sm:inline">다운로드</span>
                      </>
                    )}
                  </button>
                </div>

                {/* PDF·Word 미리보기 */}
                {!isImage && <FilePreview attachment={fileInfo} />}

                <AttachmentVersions
                  group={versionGroups.find(g => g.originalName === displayName)}
                />
              </div>
            );
          })}
        </div>
      </section>

      <ImageViewer
        isOpen={imageViewer.isOpen}
        onClose={closeImageViewer}
        imageUrl={imageViewer.imageUrl}
        altText={imageViewer.altText}
      />
    </>
  );
};

export default AttachmentList;
