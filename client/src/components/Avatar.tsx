// client/src/components/Avatar.tsx - 완전 최적화 버전
import React, { useState } from 'react';
import { markFor } from './avatarMark';
import { AvatarMarkSvg } from './AvatarMarkSvg';

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
}

// 크기는 기존보다 살짝(+2px) 키운 값. Tailwind 4px 스텝으로는 미세 증가가 안 되어 arbitrary px 사용.
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
  muted: 'bg-slate-400 dark:bg-slate-600 text-slate-100', // ✅ 삭제된 계정용 음소거 스타일
};

export const Avatar: React.FC<AvatarProps> = React.memo(
  ({ user, size = 'md', variant = 'gradient', className = '', showTooltip = true }) => {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // 아바타 URL 메모이제이션 - 사용자 ID나 아바타 URL이 변경될 때만 새로고침
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

      // 사용자별 고유 식별자로 캐시 버스팅 (매번 새로고침 방지)
      // btoa는 Latin1만 지원하므로 한글 ID(예: '홍길동') → InvalidCharacterError 발생.
      // encodeURIComponent로 ASCII 변환 후 btoa 적용해 안전 처리. 실패 시 캐시 버스터 생략 (URL 자체에
      // 서버가 생성한 timestamp+uuid가 이미 포함되어 cache busting 효과 있음).
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

      // 삭제된 계정 처리
      if (name.startsWith('삭제된계정_')) {
        return '🗑️';
      }

      // 한글, 영문, 숫자 등을 모두 처리
      const words = name.trim().split(/\s+/);

      if (words.length === 1) {
        const word = words[0];
        // 한글인 경우 첫 글자만
        if (/[가-힣]/.test(word)) {
          return word.charAt(0);
        }
        // 영문인 경우 첫 두 글자
        if (/[a-zA-Z]/.test(word)) {
          return word.substring(0, 2).toUpperCase();
        }
        // 기타 (숫자, 특수문자)
        return word.charAt(0);
      }

      // 여러 단어인 경우 각 단어의 첫 글자
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

    // 공통 클래스 메모이제이션
    // 모서리는 버튼·입력칸과 같은 8px(rounded-lg). 예전 2px 는 각진 것도 둥근 것도 아니라
    // 옆에 놓인 컨트롤들과 어긋나 보였다.
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

    // Fallback(사진 없음) 바탕. gradient 는 아이디로 정해진 무늬를 그리고,
    // muted/solid 는 기존대로 단색 클래스를 쓴다.
    // 씨앗은 id 우선 — 동명이인이 같은 그림을 받지 않도록.
    const mark = React.useMemo(
      () => (variant === 'gradient' ? markFor(user.id || user.name) : null),
      [variant, user.id, user.name]
    );

    // 이미지가 있는 경우
    if (avatarUrl) {
      return (
        <div
          className={`${baseClasses} overflow-hidden relative`}
          title={showTooltip ? user.name : undefined}
        >
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
    // 얕은 비교로 불필요한 리렌더링 방지
    return (
      prevProps.user.id === nextProps.user.id &&
      prevProps.user.name === nextProps.user.name &&
      prevProps.user.avatar === nextProps.user.avatar &&
      prevProps.size === nextProps.size &&
      prevProps.variant === nextProps.variant &&
      prevProps.className === nextProps.className &&
      prevProps.showTooltip === nextProps.showTooltip
    );
  }
);

// 기존 export와의 호환성을 위해 default로도 export
