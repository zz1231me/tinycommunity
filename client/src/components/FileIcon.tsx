// src/components/FileIcon.tsx
import React from 'react';
import { FileType } from '../utils/fileUtils';

interface FileIconProps {
  fileType: FileType;
  className?: string;
}

const FileIcon: React.FC<FileIconProps> = ({ fileType, className = 'w-5 h-5' }) => {
  const iconProps = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (fileType) {
    case 'image':
      return (
        <svg {...iconProps}>
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    case 'document':
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10,9 9,9 8,9" />
        </svg>
      );
    case 'archive':
      return (
        <svg {...iconProps}>
          <polyline points="21,8 21,21 3,21 3,8" />
          <rect width="18" height="5" x="3" y="3" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case 'video':
      return (
        <svg {...iconProps}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
        </svg>
      );
    case 'audio':
      return (
        <svg {...iconProps}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      );
  }
};

export default FileIcon;
