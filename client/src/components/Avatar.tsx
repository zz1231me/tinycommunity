import React, { useState } from 'react';
import { markFor } from './avatarMark';
import { AvatarMarkSvg } from './AvatarMarkSvg';
import { AvatarViewer } from './AvatarViewer';

interface User {
  id: string;
  name: string;
  avatar?: string | null;
}

interface AvatarProps {
  user: User;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'gradient' | 'solid' | 'muted';
  className?: string;
  showTooltip?: boolean;
  /** 눌러서 사진을 크게 본다. 바깥이 클릭 대상인 자리도 있어 기본값은 꺼짐이다. */
  enlargeable?: boolean;
}

// Tailwind 4px 스텝으로는 미세 조정이 안 되어 arbitrary px 을 쓴다.
const sizeClasses = {
  xs: 'w-[30px] h-[30px] text-xs',
  sm: 'w-[42px] h-[42px] text-xs',
  md: 'w-[50px] h-[50px] text-sm',
  lg: 'w-[58px] h-[58px] text-base',
  xl: 'w-[66px] h-[66px] text-lg',
  '2xl': 'w-[82px] h-[82px] text-xl',
};

const variantClasses = {
  solid: 'bg-blue-500 text-white',
  muted: 'bg-slate-400 dark:bg-slate-600 text-slate-100', // 삭제된 계정용
};

export const Avatar: React.FC<AvatarProps> = React.memo(
  ({
    user,
    size = 'md',
    variant = 'gradient',
    className = '',
    showTooltip = true,
    enlargeable = false,
  }) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);

    const avatarUrl = React.useMemo(() => {
      if (!user.avatar || imageError) return null;

      // XSS 방지: javascript: / data: 프로토콜 차단
      const trimmed = user.avatar.trim().toLowerCase();
      if (
        trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:text') ||
        trimmed.startsWith('vbscript:')
      ) {
        return null;
      }

      // http/https 또는 상대경로만 허용
      const isAbsolute = trimmed.startsWith('http://') || trimmed.startsWith('https://');
      const isRelative = trimmed.startsWith('/') || trimmed.startsWith('./');
      if (!isAbsolute && !isRelative) return null;

      const baseUrl = user.avatar;

      // 캐시 버스팅 키. btoa 는 Latin1 만 받으므로 encodeURIComponent 로 ASCII 로 바꾼 뒤 적용한다.
      let cacheKey = '';
      try {
        cacheKey = btoa(encodeURIComponent(`${user.id}_${user.avatar}`)).replace(
          /[^a-zA-Z0-9]/g,
          ''
        );
      } catch {
        // btoa 실패 시 빈 캐시키 → 쿼리 파라미터 생략
      }
      if (!cacheKey) return baseUrl;

      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}v=${cacheKey}`;
    }, [user.id, user.avatar, imageError]);

    const getInitials = React.useCallback((name: string): string => {
      if (!name || name.trim() === '') return '?';

      if (name.startsWith('삭제된계정_')) {
        return '🗑️';
      }

      const words = name.trim().split(/\s+/);

      if (words.length === 1) {
        const word = words[0];
        if (/[가-힣]/.test(word)) {
          return word.charAt(0);
        }
        if (/[a-zA-Z]/.test(word)) {
          return word.substring(0, 2).toUpperCase();
        }
        return word.charAt(0);
      }

      return words
        .slice(0, 2)
        .map(word => {
          if (/[가-힣]/.test(word)) return word.charAt(0);
          if (/[a-zA-Z]/.test(word)) return word.charAt(0).toUpperCase();
          return word.charAt(0);
        })
        .join('');
    }, []);

    const initials = React.useMemo(() => getInitials(user.name), [user.name, getInitials]);

    // 모서리는 버튼·입력칸과 같은 8px(rounded-lg)로 맞춘다.
    const baseClasses = React.useMemo(
      () => `
    ${sizeClasses[size]}
    rounded-lg
    ring-1 ring-black/5 dark:ring-white/10
    flex
    items-center 
    justify-center 
    font-semibold 
    select-none
    transition-all
    duration-200
    flex-shrink-0
    ${className}
  `,
      [size, className]
    );

    const handleImageError = React.useCallback(() => {
      if (import.meta.env.DEV) console.warn('⚠️ 아바타 이미지 로드 실패:', user.avatar);
      setImageError(true);
      setImageLoaded(false);
    }, [user.avatar]);

    const handleImageLoad = React.useCallback(() => {
      setImageError(false);
      setImageLoaded(true);
    }, []);

    // 사진이 없을 때의 바탕. 씨앗은 id 를 먼저 쓴다(동명이인이 같은 그림을 받지 않도록).
    const mark = React.useMemo(
      () => (variant === 'gradient' ? markFor(user.id || user.name) : null),
      [variant, user.id, user.name]
    );

    if (avatarUrl) {
      const picture = (
        <>
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          <img
            src={avatarUrl}
            alt={`${user.name}님의 프로필`}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onError={handleImageError}
            onLoad={handleImageLoad}
            loading="lazy"
          />
        </>
      );

      if (enlargeable) {
        return (
          <>
            <button
              type="button"
              // 바깥이 클릭 대상인 자리에 놓여도 그쪽 동작을 가로채지 않는다
              onClick={e => {
                e.stopPropagation();
                setViewerOpen(true);
              }}
              aria-label={`${user.name}님의 프로필 사진 크게 보기`}
              title={showTooltip ? `${user.name} — 눌러서 크게 보기` : undefined}
              className={`${baseClasses} overflow-hidden relative cursor-zoom-in`}
            >
              {picture}
            </button>
            {viewerOpen && (
              <AvatarViewer src={avatarUrl} name={user.name} onClose={() => setViewerOpen(false)} />
            )}
          </>
        );
      }

      return (
        <div
          className={`${baseClasses} overflow-hidden relative`}
          title={showTooltip ? user.name : undefined}
        >
          {picture}
        </div>
      );
    }

    if (mark) {
      return (
        <div
          className={`${baseClasses} overflow-hidden`}
          title={showTooltip ? user.name : undefined}
        >
          <AvatarMarkSvg mark={mark} initials={initials} />
        </div>
      );
    }

    return (
      <div
        className={`${baseClasses} ${variant === 'muted' ? variantClasses.muted : variantClasses.solid}`}
        title={showTooltip ? user.name : undefined}
      >
        {initials}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.user.id === nextProps.user.id &&
      prevProps.user.name === nextProps.user.name &&
      prevProps.user.avatar === nextProps.user.avatar &&
      prevProps.size === nextProps.size &&
      prevProps.variant === nextProps.variant &&
      prevProps.className === nextProps.className &&
      prevProps.showTooltip === nextProps.showTooltip &&
      // 비교자에 빠뜨리면 이 값을 바꿔도 화면이 갱신되지 않는다
      prevProps.enlargeable === nextProps.enlargeable
    );
  }
);

// 기존 import 호환을 위해 default 로도 내보낸다.
