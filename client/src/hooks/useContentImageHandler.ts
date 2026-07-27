// client/src/hooks/useContentImageHandler.ts
// 범용 콘텐츠 이미지 핸들러 (CKEditor HTML 렌더링 지원)

import { useEffect, useState, useCallback, useRef } from 'react';

interface ImageViewerState {
  isOpen: boolean;
  imageUrl: string;
  altText: string;
}

type TimerRef = ReturnType<typeof setTimeout>;

// 전역 클린업 함수들을 추적하는 WeakMap
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

  // 안전한 상태 업데이트
  const safeSetState = useCallback((updater: (prev: ImageViewerState) => ImageViewerState) => {
    if (isMountedRef.current) {
      setImageViewer(updater);
    }
  }, []);

  // 디바운스 함수
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

  // 이미지 클릭 핸들러 생성
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

  // 툴팁 관리
  const createTooltipHandlers = useCallback((img: HTMLImageElement) => {
    let tooltip: HTMLDivElement | null = null;

    const showTooltip = () => {
      if (!isMountedRef.current) return;

      const parent = img.parentElement;
      if (!parent) return;

      // 기존 툴팁 제거
      const existingTooltip = parent.querySelector('.image-click-tooltip');
      if (existingTooltip) {
        existingTooltip.remove();
      }

      // 부모 요소의 position 설정
      const computedStyle = getComputedStyle(parent);
      if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
      }

      // 새 툴팁 생성
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

      // 애니메이션을 위한 지연
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

  // 단일 이미지 핸들러 추가
  const addHandlerToImage = useCallback(
    (img: HTMLImageElement) => {
      // 이미 처리된 이미지는 건너뛰기
      if (processedImagesRef.current.has(img) || img.getAttribute('data-image-enhanced')) {
        return;
      }

      // 유효하지 않은 이미지는 건너뛰기 (data URI 미니 이미지 제외)
      if (!img.src || (img.src.startsWith('data:') && img.src.length < 100)) {
        return;
      }

      // ✅ 로드 완료 후 크기 검증 — 아이콘/썸네일 등 소형 이미지 제외
      if (img.naturalWidth > 0 && img.naturalWidth <= 50 && img.naturalHeight <= 50) {
        return;
      }

      if (import.meta.env.DEV) console.info('🖼️ 이미지 핸들러 추가:', img.src);

      // 처리된 이미지로 마킹
      processedImagesRef.current.add(img);
      img.setAttribute('data-image-enhanced', 'true');

      // CSS 클래스 즉시 적용 (인라인 스타일 제거 — CSS 클래스가 모든 스타일 처리)
      img.classList.add('content-image-clickable');

      // 키보드 접근성 설정
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      if (!img.getAttribute('aria-label')) {
        img.setAttribute('aria-label', img.alt ? `이미지 확대: ${img.alt}` : '이미지 확대');
      }

      // 이벤트 핸들러 생성
      const clickHandler = createImageClickHandler(img);
      const { showTooltip, hideTooltip, cleanupTooltip } = createTooltipHandlers(img);

      // 키보드 핸들러 (Enter/Space로 클릭 동작 수행)
      const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          clickHandler(e as unknown as Event);
        }
      };

      // 호버 효과 핸들러
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

      // 이벤트 리스너 등록
      img.addEventListener('click', clickHandler, { passive: false });
      img.addEventListener('keydown', keydownHandler);
      img.addEventListener('mouseenter', mouseEnterHandler, { passive: true });
      img.addEventListener('mouseleave', mouseLeaveHandler, { passive: true });

      // 전역 클린업 함수 등록
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

  // 이미지 핸들러 추가 (CKEditor 콘텐츠 지원)
  const addImageClickHandlers = useCallback(() => {
    if (!isMountedRef.current) return;

    // ✅ CKEditor HTML 렌더링을 포함한 콘텐츠 선택자
    const contentContainers = [
      '.ck-content-view', // CKEditor HTML 렌더링 컨테이너 (게시글/위키/댓글/일정)
      '.post-content', // 게시글 콘텐츠 (폴백)
      '.content', // 일반 콘텐츠 (폴백)
    ];

    // ✅ 본문(.ck-content-view)과 댓글(.ck-content-view text-sm ...) 등 동일 클래스가
    //    여러 곳에 동시에 존재할 수 있으므로 querySelectorAll로 모든 컨테이너를 수집한다.
    //    이전엔 첫 번째 컨테이너만 잡혀서 댓글 영역의 이미지에 lightbox가 적용되지 않았다.
    const containers: Element[] = [];
    for (const selector of contentContainers) {
      try {
        document.querySelectorAll(selector).forEach(el => containers.push(el));
      } catch (error) {
        if (import.meta.env.DEV) console.warn(`⚠️ 선택자 오류: ${selector}`, error);
      }
    }

    if (containers.length === 0) {
      // 본문/댓글 컨테이너를 찾지 못한 경우는 PostDetail/위키 등이 마운트되지 않은 상태.
      // document.body 전체를 스캔하면 헤더/사이드바의 모든 이미지에 클릭 핸들러가
      // 부착되어 의도치 않은 UX(아바타·로고 클릭 시 확대)가 발생하므로 early return.
      if (import.meta.env.DEV)
        console.info('⚠️ 콘텐츠 컨테이너를 찾을 수 없음 — 이미지 핸들러 부착 생략');
      return;
    }

    // 모든 컨테이너에서 이미지 수집
    const allImages: HTMLImageElement[] = [];
    containers.forEach(container => {
      container
        .querySelectorAll<HTMLImageElement>('img:not([data-image-enhanced])')
        .forEach(img => allImages.push(img));
    });

    // 이미지 링크·에디터 UI 내부 이미지 제외
    // ✅ naturalWidth 체크는 여기서 하지 않음 — 미로드 이미지(naturalWidth=0)도 통과시켜
    //    load 이벤트 이후 addHandlerToImage 내에서 크기 검증
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

    // 배치 처리로 성능 최적화
    newImages.forEach(img => {
      // 이미지 로드 대기 후 처리
      if (img.complete) {
        addHandlerToImage(img);
      } else {
        // ✅ 언마운트 시 클린업 가능하도록 핸들러를 globalCleanupMap에 등록
        const onLoad = () => {
          globalCleanupMap.delete(img); // load 핸들러 등록 항목 제거
          addHandlerToImage(img);
        };
        img.addEventListener('load', onLoad, { once: true });
        // 언마운트 시 load 리스너 제거를 위해 임시 클린업 등록
        globalCleanupMap.set(img, () => {
          img.removeEventListener('load', onLoad);
          globalCleanupMap.delete(img);
        });
      }
    });
  }, [addHandlerToImage]);

  // 메인 useEffect
  useEffect(() => {
    // ⚠️ isInitializedRef는 cleanup에서 false로 되돌리므로 Strict Mode의 mount→cleanup→mount
    //    동기 사이클에서 가드 역할을 하지 못한다. 가드를 제거하고, 각 mount에서
    //    이전 cleanup이 처리하지 못한 잔여 상태(이미지 enhance flag)를 초기화한 뒤 진입한다.
    isMountedRef.current = true;
    const processedImages = processedImagesRef.current;

    if (import.meta.env.DEV) console.info('🖼️ useContentImageHandler 초기화 (CKEditor 지원)');

    // 초기 로딩 - 더 긴 지연시간으로 DOM 렌더링 완료 대기
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        addImageClickHandlers();
      }
    }, 500);

    // MutationObserver 설정
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

    // Observer 시작 (전체 document 관찰)
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'], // ✅ 'class' 제거 — class 변경(hover 등)은 처리 불필요, 불필요한 debounce 방지
    });

    // Cleanup 함수
    return () => {
      if (import.meta.env.DEV) console.info('🖼️ useContentImageHandler 클린업 시작');

      isMountedRef.current = false;

      // 타이머 정리
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Observer 정리
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      // 모든 처리된 이미지 정리
      processedImages.forEach(img => {
        const cleanup = globalCleanupMap.get(img);
        if (cleanup) {
          cleanup();
        }
      });
      processedImages.clear();

      // 남은 enhanced 이미지들 강제 정리
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

  // 이미지 뷰어 닫기
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
