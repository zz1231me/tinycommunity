// client/src/components/AvatarUpload.tsx - 캐시 문제 해결 버전
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { uploadAvatar, deleteAvatar } from '../api/auth';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store/auth';
import { useSiteSettings } from '../store/siteSettings';
import { toast } from '../utils/toast';
import { ConfirmationModal } from './admin/common/ConfirmationModal';
import { generateRandomAvatarFile } from '../utils/identicon';

interface User {
  id: string;
  name: string;
  avatar?: string | null;
}

interface AvatarUploadProps {
  user: User;
  onAvatarUpdate: (avatarUrl: string | null) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  allowDelete?: boolean;
}

const sizeConfigs = {
  sm: {
    avatarSize: 'md' as const,
    uploadText: '변경',
    containerClass: 'w-24 h-24',
  },
  md: {
    avatarSize: 'lg' as const,
    uploadText: '프로필 사진 변경',
    containerClass: 'w-32 h-32',
  },
  lg: {
    avatarSize: 'xl' as const,
    uploadText: '프로필 사진 변경',
    containerClass: 'w-40 h-40',
  },
  xl: {
    avatarSize: '2xl' as const,
    uploadText: '프로필 사진 변경',
    containerClass: 'w-48 h-48',
  },
};

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  user,
  onAvatarUpdate,
  className = '',
  size = 'md',
  showName = true,
  allowDelete = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // ✅ 강제 새로고침용
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const updateUser = useAuthStore(state => state.updateUser);
  const { settings: siteSettings } = useSiteSettings();

  const config = sizeConfigs[size];

  // ✅ 강제 새로고침 함수
  const forceRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // 파일 업로드 처리 (사이트 설정 반영)
  const handleFileUpload = useCallback(
    async (file: File) => {
      const maxSize = siteSettings.maxAvatarSizeMb * 1024 * 1024;
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

      if (file.size > maxSize) {
        toast.error(`파일 크기는 ${siteSettings.maxAvatarSizeMb}MB 이하여야 합니다.`);
        return;
      }
      if (!allowedMimeTypes.includes(file.type)) {
        toast.error('지원하는 파일 형식: JPEG, PNG, WebP, GIF');
        return;
      }

      setIsUploading(true);

      // 미리보기 URL은 try/catch 스코프 모두에서 접근 가능하도록 외부에 선언
      // (try 내부에 const로 선언하면 catch에서 접근 불가 → 실패 시 정리 누락)
      let previewUrl: string | null = null;
      try {
        // 미리보기 생성
        previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);

        // 서버 업로드
        const result = await uploadAvatar(file);

        // ✅ 업데이트 순서 중요: onAvatarUpdate -> updateUser -> forceRefresh
        onAvatarUpdate(result.avatarUrl);
        updateUser({ avatar: result.avatarUrl });

        // ✅ 작은 지연 후 강제 새로고침 (상태 업데이트 완료 대기)
        setTimeout(() => {
          forceRefresh();
        }, 100);

        toast.success('프로필 사진이 업데이트되었습니다.');

        // 미리보기 정리
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        setPreview(null);
      } catch (error) {
        if (import.meta.env.DEV) console.error('❌ 아바타 업로드 실패:', error);
        toast.error(error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.');

        // 실패 시 새로 생성한 previewUrl 정리 (이전 closure의 preview state가 아닌 로컬 변수 사용)
        // 기존 코드는 closure의 preview(콜백 생성 시점의 state, 보통 null)를 체크해
        // 실제 정리가 누락되고 UI에 실패한 미리보기가 잔존하는 버그였음
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreview(null);
        }
      } finally {
        setIsUploading(false);

        // 파일 입력 초기화
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    // preview를 deps에서 제거 — 더 이상 closure로 사용하지 않으므로 callback 재생성 불필요
    [onAvatarUpdate, updateUser, siteSettings.maxAvatarSizeMb]
  );

  // 아바타 삭제 처리 — 사용자 확인을 위해 ConfirmationModal을 띄움 (브라우저 confirm 미사용)
  const requestDeleteAvatar = useCallback(() => {
    if (!user.avatar) return;
    setShowDeleteConfirm(true);
  }, [user.avatar]);

  const performDeleteAvatar = useCallback(async () => {
    setShowDeleteConfirm(false);
    if (!user.avatar) return;
    setIsDeleting(true);
    try {
      await deleteAvatar();

      // ✅ 업데이트 순서 중요
      onAvatarUpdate(null);
      updateUser({ avatar: null });

      // ✅ 강제 새로고침
      setTimeout(() => {
        forceRefresh();
      }, 100);

      toast.success('프로필 사진이 삭제되었습니다.');
    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ 아바타 삭제 실패:', error);
      toast.error(error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }, [user.avatar, onAvatarUpdate, updateUser]);

  // 파일 선택 처리
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // 랜덤 아바타 생성 — 사진 업로드 없이 코드로 identicon을 만들어 기존 업로드 흐름에 태운다
  const handleGenerateAvatar = useCallback(async () => {
    if (isUploading || isDeleting || isGenerating) return;
    setIsGenerating(true);
    try {
      const file = await generateRandomAvatarFile();
      await handleFileUpload(file);
    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ 아바타 생성 실패:', error);
      toast.error(error instanceof Error ? error.message : '아바타 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [isUploading, isDeleting, isGenerating, handleFileUpload]);

  // 드래그 앤 드롭 처리
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  // 업로드 버튼 클릭
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 정리 작업
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const isLoading = isUploading || isDeleting;

  return (
    <div className={`flex flex-col items-center space-y-4 ${className}`}>
      {/* 아바타 및 업로드 영역 */}
      <div
        className={`
          relative group cursor-pointer transition-all duration-200
          ${config.containerClass}
          ${dragActive ? 'scale-105 ring-4 ring-blue-500 ring-opacity-50' : ''}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}
        `}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={!isLoading ? handleUploadClick : undefined}
      >
        {/* 아바타 표시 */}
        <div className="relative w-full h-full">
          {/* ✅ refreshKey로 강제 리렌더링 */}
          <Avatar
            key={refreshKey}
            user={{
              ...user,
              avatar: preview || user.avatar,
            }}
            size={config.avatarSize}
            className="w-full h-full"
          />

          {/* 로딩 오버레이 */}
          {isLoading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-[2px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {/* 호버 오버레이 */}
          {!isLoading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <div className="text-white text-sm font-medium text-center">
                📸
                <br />
                {config.uploadText}
              </div>
            </div>
          )}

          {/* 드래그 활성 오버레이 */}
          {dragActive && !isLoading && (
            <div className="absolute inset-0 bg-blue-500 bg-opacity-30 rounded-[2px] flex items-center justify-center">
              <div className="text-white text-sm font-medium text-center">
                📥
                <br />
                파일을 놓아주세요
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 사용자 이름 */}
      {showName && (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user.name}</h3>
        </div>
      )}

      {/* 액션 버튼들 */}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={handleUploadClick}
          disabled={isLoading}
          className="
            px-4 py-2 text-sm font-medium whitespace-nowrap text-blue-600 bg-blue-50
            rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2
            focus:ring-blue-500 focus:ring-opacity-50 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            dark:text-blue-400 dark:bg-blue-900 dark:hover:bg-blue-800
          "
        >
          {isUploading ? '업로드 중...' : '사진 변경'}
        </button>

        <button
          onClick={handleGenerateAvatar}
          disabled={isLoading || isGenerating}
          title="사진 없이 랜덤 그래픽 아바타를 생성합니다"
          className="
            px-4 py-2 text-sm font-medium whitespace-nowrap text-violet-600 bg-violet-50
            rounded-lg hover:bg-violet-100 focus:outline-none focus:ring-2
            focus:ring-violet-500 focus:ring-opacity-50 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            dark:text-violet-300 dark:bg-violet-900/40 dark:hover:bg-violet-900/60
          "
        >
          {isGenerating ? '생성 중...' : '🎲 랜덤 생성'}
        </button>

        {allowDelete && user.avatar && (
          <button
            onClick={requestDeleteAvatar}
            disabled={isLoading}
            className="
              px-4 py-2 text-sm font-medium whitespace-nowrap text-red-600 bg-red-50
              rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2
              focus:ring-red-500 focus:ring-opacity-50 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              dark:text-red-400 dark:bg-red-900 dark:hover:bg-red-800
            "
          >
            {isDeleting ? '삭제 중...' : '사진 삭제'}
          </button>
        )}

        {/* ✅ 강제 새로고침 버튼 (개발용 — 프로덕션 빌드에서는 숨김) */}
        {import.meta.env.DEV && (
          <button
            onClick={forceRefresh}
            disabled={isLoading}
            className="
            px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-600 bg-slate-100
            rounded-lg hover:bg-slate-200 focus:outline-none focus:ring-2
            focus:ring-slate-500 focus:ring-opacity-50 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            dark:text-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600
          "
            title="아바타 새로고침"
          >
            🔄
          </button>
        )}
      </div>

      {/* 도움말 텍스트 */}
      <div className="text-center text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        <p>JPEG, PNG, WebP, GIF 파일을 지원합니다.</p>
        <p>최대 {siteSettings.maxAvatarSizeMb}MB까지 업로드 가능합니다.</p>
        <p>드래그 앤 드롭으로 쉽게 업로드하세요.</p>
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isLoading}
      />
      <ConfirmationModal
        open={showDeleteConfirm}
        title="프로필 사진 삭제"
        message="프로필 사진을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="danger"
        onConfirm={performDeleteAvatar}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
