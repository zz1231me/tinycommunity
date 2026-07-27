// src/utils/fileUtils.ts

export type FileType = 'image' | 'document' | 'archive' | 'video' | 'audio' | 'file';

export interface FileConfig {
  extensions: string[];
  color: string;
}

export const FILE_TYPE_CONFIG: Record<FileType, FileConfig> = {
  image: {
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
    color: 'text-green-600 bg-green-100',
  },
  document: {
    extensions: ['pdf', 'doc', 'docx', 'txt', 'hwp', 'ppt', 'pptx', 'xls', 'xlsx'],
    color: 'text-blue-600 bg-blue-100',
  },
  archive: {
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    color: 'text-orange-600 bg-orange-100',
  },
  video: {
    extensions: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv'],
    color: 'text-purple-600 bg-purple-100',
  },
  audio: {
    extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
    color: 'text-pink-600 bg-pink-100',
  },
  file: {
    extensions: [],
    color: 'text-slate-600 bg-slate-100',
  },
} as const;

/**
 * 파일 경로에서 파일 타입을 추출합니다
 */
export const getFileType = (filePath: string): FileType => {
  if (!filePath || typeof filePath !== 'string') return 'file';

  const filename = filePath.split('/').pop() || filePath;
  const extension = filename.split('.').pop()?.toLowerCase();

  if (!extension) return 'file';

  for (const [type, config] of Object.entries(FILE_TYPE_CONFIG)) {
    if (config.extensions.includes(extension)) {
      return type as FileType;
    }
  }

  return 'file';
};

/**
 * 파일 타입에 따른 설정을 가져옵니다
 */
export const getFileConfig = (fileType: FileType): FileConfig & { color: string } => {
  return (
    FILE_TYPE_CONFIG[fileType] || { ...FILE_TYPE_CONFIG.file, color: 'text-slate-600 bg-slate-100' }
  );
};

/**
 * 파일 크기를 사람이 읽기 쉬운 형태로 변환합니다
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 이미지 파일인지 확인합니다
 */
export const isImageFile = (filePath: string): boolean => {
  return getFileType(filePath) === 'image';
};
