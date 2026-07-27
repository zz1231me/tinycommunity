// src/components/AttachmentList.tsx - 파일명 클릭으로 다운로드
import React, { useState } from 'react';
import { downloadFile } from '../utils/downloadUtils';
import { toast } from '../utils/toast';
import { getFileType, getFileConfig, formatFileSize, isImageFile } from '../utils/fileUtils';
import FileIcon from './FileIcon';
import ImageViewer from './ImageViewer';
import { FilePreview } from './common/FilePreview';

interface AttachmentInfo {
  url: string;
  originalName: string;
  storedName: string;
  size?: number;
  mimeType?: string;
}

interface AttachmentListProps {
  attachments: AttachmentInfo[];
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments }) => {
  const [imageViewer, setImageViewer] = useState<{
    isOpen: boolean;
    imageUrl: string;
    altText: string;
  }>({
    isOpen: false,
    imageUrl: '',
    altText: '',
  });

  const handleDownload = async (e: React.MouseEvent, fileInfo: AttachmentInfo) => {
    e.stopPropagation();
    try {
      await downloadFile({
        storedName: fileInfo.storedName,
        originalName: fileInfo.originalName,
        url: fileInfo.url,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다.');
    }
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

  // ✅ 파일 클릭 핸들러: 이미지는 확대, 일반 파일은 다운로드
  const handleFileClick = async (fileInfo: AttachmentInfo) => {
    const isImage = isImageFile(fileInfo.originalName);

    if (isImage) {
      handleImageClick(fileInfo);
    } else {
      try {
        await downloadFile({
          storedName: fileInfo.storedName,
          originalName: fileInfo.originalName,
          url: fileInfo.url,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다.');
      }
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
          <h3 className="font-medium text-sm sm:text-base text-slate-900 dark:text-slate-100">
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
                  {/* ✅ 파일 아이콘 + 정보 영역 - 클릭 가능 */}
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
                    {/* 파일 아이콘 */}
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-lg ${fileConfig.color} flex-shrink-0`}
                    >
                      <FileIcon fileType={fileType} />
                    </div>

                    {/* 파일 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                          title={displayName}
                        >
                          {displayName}
                        </div>
                        {isImage && (
                          <span className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                            확대
                          </span>
                        )}
                        {!isImage && (
                          <svg
                            className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {fileType} 파일
                        {fileInfo.size && ` • ${formatFileSize(fileInfo.size)}`}
                      </div>
                    </div>
                  </div>

                  {/* ✅ 다운로드 아이콘 버튼 (이미지 전용) */}
                  {isImage && (
                    <button
                      onClick={e => handleDownload(e, fileInfo)}
                      className="flex-shrink-0 flex items-center justify-center w-9 h-9 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200 border-0 outline-none focus:outline-none"
                      aria-label={`${displayName} 다운로드`}
                      title="다운로드"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {/* ✅ PDF/Word 미리보기 패널 */}
                {!isImage && <FilePreview attachment={fileInfo} />}
              </div>
            );
          })}
        </div>
      </section>

      {/* 이미지 뷰어 */}
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
