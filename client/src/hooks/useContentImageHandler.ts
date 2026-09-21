// 본문(CKEditor 렌더링) 이미지에 클릭 확대 동작을 붙인다.

import { useEffect, useState, useCallback, useRef } from 'react';

interface ImageViewerState {
  isOpen: boolean;
  imageUrl: string;
  altText: string;
}

type TimerRef = ReturnType<typeof setTimeout>;

const globalCleanupMap = new WeakMap<HTMLImageElement, () => void>();

export const useContentImageHandler = () => {
  const [imageViewer, setImageViewer] = useState<ImageViewerState>({
    isOpen: false,
    imageUrl: '',
    altText: '',
  });

  const observerRef = useRef<MutationObserver | null>(null);
  const timeoutRef = useRef<TimerRef | null>(null);
  const debounceTimerRef = useRef<TimerRef | null>(null);
  const closeTimerRef = useRef<TimerRef | null>(null);
  const processedImagesRef = useRef<Set<HTMLImageElement>>(new Set());
  const isMountedRef = useRef(true);

  const safeSetState = useCallback((updater: (prev: ImageViewerState) => ImageViewerState) => {
    if (isMountedRef.current) {
      setImageViewer(updater);
    }
  }, []);

  const debouncedCallback = useCallback((callback: () => void, delay: number = 100) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!isMountedRef.current) return;

    debounceTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        callback();
      }
      debounceTimerRef.current = null;
    }, delay);
  }, []);

  const createImageClickHandler = useCallback(
    (img: HTMLImageElement) => {
      return (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isMountedRef.current || !img.src || !document.contains(img)) return;

        if (import.meta.env.DEV) console.info('🖼️ 게시글 이미지 클릭됨:', img.src);

        safeSetState(prev => ({
          ...prev,
          isOpen: true,
          imageUrl: img.src,
          altText: img.alt || '게시글 이미지',
        }));
      };
    },
    [safeSetState]
  );

  const createTooltipHandlers = useCallback((img: HTMLImageElement) => {
    let tooltip: HTMLDivElement | null = null;

    const showTooltip = () => {
      if (!isMountedRef.current) return;

      const parent = img.parentElement;
      if (!parent) return;

      const existingTooltip = parent.querySelector('.image-click-tooltip');
      if (existingTooltip) {
        existingTooltip.remove();
      }

      const computedStyle = getComputedStyle(parent);
      if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
      }

      tooltip = document.createElement('div');
      tooltip.className = 'image-click-tooltip';
      tooltip.textContent = '🔍 클릭하여 확대';
      tooltip.setAttribute('aria-hidden', 'true');
      tooltip.style.cssText = `
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        background: rgba(0, 0, 0, 0.85) !important;
        color: white !important;
        padding: 6px 10px !important;
        border-radius: 6px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        line-height: 1.2 !important;
        z-index: 10 !important;
        pointer-events: none !important;
        white-space: nowrap !important;
        opacity: 0 !important;
        transform: translate3d(0, 0, 0) !important;
        transition: opacity 0.2s ease !important;
        backdrop-filter: blur(8px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      `;

      parent.appendChild(tooltip);

      requestAnimationFrame(() => {
        if (tooltip && isMountedRef.current) {
          tooltip.style.opacity = '1';
        }
      });
    };

    const hideTooltip = () => {
      if (tooltip) {
        tooltip.style.opacity = '0';
        setTimeout(() => {
          if (tooltip && tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
            tooltip = null;
          }
        }, 200);
      }
    };

    const cleanupTooltip = () => {
      if (tooltip && tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
      tooltip = null;
    };

    return { showTooltip, hideTooltip, cleanupTooltip };
  }, []);

  const addHandlerToImage = useCallback(
    (img: HTMLImageElement) => {
      if (processedImagesRef.current.has(img) || img.getAttribute('data-image-enhanced')) {
        return;
      }

      // 유효하지 않은 이미지는 건너뛰기 (data URI 미니 이미지 제외)
      if (!img.src || (img.src.startsWith('data:') && img.src.length < 100)) {
        return;
      }

      // 아이콘·썸네일 같은 작은 이미지는 제외한다.
      if (img.naturalWidth > 0 && img.naturalWidth <= 50 && img.naturalHeight <= 50) {
        return;
      }

      if (import.meta.env.DEV) console.info('🖼️ 이미지 핸들러 추가:', img.src);

      processedImagesRef.current.add(img);
      img.setAttribute('data-image-enhanced', 'true');

      // 스타일은 CSS 클래스가 모두 맡는다.
      img.classList.add('content-image-clickable');

      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      if (!img.getAttribute('aria-label')) {
        img.setAttribute('aria-label', img.alt ? `이미지 확대: ${img.alt}` : '이미지 확대');
      }

      const clickHandler = createImageClickHandler(img);
      const { showTooltip, hideTooltip, cleanupTooltip } = createTooltipHandlers(img);

      // 키보드 핸들러 (Enter/Space로 클릭 동작 수행)
      const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          clickHandler(e as unknown as Event);
        }
      };

      const mouseEnterHandler = (_e: Event) => {
        if (!isMountedRef.current) return;
        img.classList.add('content-image-hover');
        showTooltip();
      };

      const mouseLeaveHandler = (_e: Event) => {
        if (!isMountedRef.current) return;
        img.classList.remove('content-image-hover');
        hideTooltip();
      };

      img.addEventListener('click', clickHandler, { passive: false });
      img.addEventListener('keydown', keydownHandler);
      img.addEventListener('mouseenter', mouseEnterHandler, { passive: true });
      img.addEventListener('mouseleave', mouseLeaveHandler, { passive: true });

      const globalCleanup = () => {
        img.removeEventListener('click', clickHandler);
        img.removeEventListener('keydown', keydownHandler);
        img.removeEventListener('mouseenter', mouseEnterHandler);
        img.removeEventListener('mouseleave', mouseLeaveHandler);
        cleanupTooltip();
        img.classList.remove('content-image-clickable', 'content-image-hover');
        img.removeAttribute('role');
        img.removeAttribute('tabindex');
        img.removeAttribute('data-image-enhanced');
        processedImagesRef.current.delete(img);
        globalCleanupMap.delete(img);
      };

      globalCleanupMap.set(img, globalCleanup);
    },
    [createImageClickHandler, createTooltipHandlers]
  );

  const addImageClickHandlers = useCallback(() => {
    if (!isMountedRef.current) return;

    const contentContainers = [
      '.ck-content-view', // CKEditor HTML 렌더링 컨테이너 (게시글/위키/댓글/일정)
      '.post-content', // 게시글 콘텐츠 (폴백)
      '.content', // 일반 콘텐츠 (폴백)
    ];

    // 같은 클래스의 컨테이너가 본문과 댓글에 동시에 있을 수 있어 모두 모은다.
    const containers: Element[] = [];
    for (const selector of contentContainers) {
      try {
        document.querySelectorAll(selector).forEach(el => containers.push(el));
      } catch (error) {
        if (import.meta.env.DEV) console.warn(`⚠️ 선택자 오류: ${selector}`, error);
      }
    }

    if (containers.length === 0) {
      // 컨테이너가 없으면 아직 마운트 전이다. body 전체를 훑으면 아바타·로고까지 확대 대상이 된다.
      if (import.meta.env.DEV)
        console.info('⚠️ 콘텐츠 컨테이너를 찾을 수 없음 — 이미지 핸들러 부착 생략');
      return;
    }

    const allImages: HTMLImageElement[] = [];
    containers.forEach(container => {
      container
        .querySelectorAll<HTMLImageElement>('img:not([data-image-enhanced])')
        .forEach(img => allImages.push(img));
    });

    // 이미지 링크와 에디터 UI 안의 이미지는 제외한다. 크기 검증은 load 이후 addHandlerToImage 가 한다.
    const newImages = Array.from(allImages).filter(img => {
      const parentLink = img.closest('a');
      const isEditorUI = img.closest(
        '.ck-editor__editable, [class*="editor-"], [class*="toolbar"]'
      );
      const isIconImage =
        img.classList.contains('icon') || img.style.width === '16px' || img.style.height === '16px';
      return !parentLink && !isEditorUI && !isIconImage;
    });

    if (newImages.length === 0) {
      if (import.meta.env.DEV) console.info('📷 새 이미지가 없음');
      return;
    }

    if (import.meta.env.DEV) console.info(`🖼️ ${newImages.length}개의 새 이미지 발견`);

    newImages.forEach(img => {
      if (img.complete) {
        addHandlerToImage(img);
      } else {
        // 언마운트 때 정리할 수 있게 load 핸들러를 globalCleanupMap 에 등록한다.
        const onLoad = () => {
          globalCleanupMap.delete(img); // load 핸들러 등록 항목 제거
          addHandlerToImage(img);
        };
        img.addEventListener('load', onLoad, { once: true });
        globalCleanupMap.set(img, () => {
          img.removeEventListener('load', onLoad);
          globalCleanupMap.delete(img);
        });
      }
    });
  }, [addHandlerToImage]);

  useEffect(() => {
    // isInitializedRef 는 cleanup 에서 false 로 돌아가 Strict Mode 의 mount→cleanup→mount 에서 가드가 되지 않는다.
    isMountedRef.current = true;
    const processedImages = processedImagesRef.current;

    if (import.meta.env.DEV) console.info('🖼️ useContentImageHandler 초기화 (CKEditor 지원)');

    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        addImageClickHandlers();
      }
    }, 500);

    observerRef.current = new MutationObserver(mutations => {
      if (!isMountedRef.current) return;

      let hasRelevantChanges = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (
                element.tagName === 'IMG' ||
                element.querySelector?.('img') ||
                element.classList?.contains('ck-content-view')
              ) {
                hasRelevantChanges = true;
                break;
              }
            }
          }
        } else if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'src' &&
          (mutation.target as Element).tagName === 'IMG'
        ) {
          hasRelevantChanges = true;
        }

        if (hasRelevantChanges) break;
      }

      if (hasRelevantChanges) {
        debouncedCallback(addImageClickHandlers, 300);
      }
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'], // class 변경(hover 등)까지 보면 debounce 가 불필요하게 돈다
    });

    return () => {
      if (import.meta.env.DEV) console.info('🖼️ useContentImageHandler 클린업 시작');

      isMountedRef.current = false;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      processedImages.forEach(img => {
        const cleanup = globalCleanupMap.get(img);
        if (cleanup) {
          cleanup();
        }
      });
      processedImages.clear();

      const remainingImages = document.querySelectorAll(
        'img[data-image-enhanced]'
      ) as NodeListOf<HTMLImageElement>;
      remainingImages.forEach(img => {
        const cleanup = globalCleanupMap.get(img);
        if (cleanup) {
          cleanup();
        }
      });

      if (import.meta.env.DEV) console.info('🖼️ useContentImageHandler 클린업 완료');
    };
  }, [addImageClickHandlers, debouncedCallback]);

  const closeImageViewer = useCallback(() => {
    if (!isMountedRef.current) return;

    safeSetState(prev => ({
      ...prev,
      isOpen: false,
    }));

    // 기존 닫기 타이머 취소 후 새로 예약 (빠른 열기/닫기 시 타이머 누적 방지)
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (isMountedRef.current) {
        safeSetState(() => ({
          isOpen: false,
          imageUrl: '',
          altText: '',
        }));
      }
    }, 300);
  }, [safeSetState]);

  return {
    imageViewer,
    closeImageViewer,
  };
};
