// src/components/ImageViewer.tsx - passive 이벤트 리스너 오류 해결 버전
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  altText?: string;
}

type TimerRef = ReturnType<typeof setTimeout>;

const ImageViewer: React.FC<ImageViewerProps> = ({
  isOpen,
  onClose,
  imageUrl,
  altText = '이미지',
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelThrottleRef = useRef<TimerRef | null>(null);
  const preloadedImageRef = useRef<HTMLImageElement | null>(null);
  const isMountedRef = useRef(true);

  // 안전한 상태 업데이트 함수
  const safeSetState = useCallback((setter: () => void) => {
    if (isMountedRef.current) {
      setter();
    }
  }, []);

  // 이미지 캐시 및 프리로딩 최적화 (메모리 누수 방지)
  const preloadImage = useCallback(
    (url: string) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        // 이전 이미지 정리
        if (preloadedImageRef.current) {
          preloadedImageRef.current.onload = null;
          preloadedImageRef.current.onerror = null;
          preloadedImageRef.current.src = '';
          preloadedImageRef.current = null;
        }

        const img = new Image();
        preloadedImageRef.current = img;

        img.onload = () => {
          if (isMountedRef.current && preloadedImageRef.current === img) {
            safeSetState(() => {
              setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
            });
            resolve(img);
          }
        };

        img.onerror = () => {
          if (isMountedRef.current) {
            reject(new Error('이미지 로드 실패'));
          }
        };

        // 최적화된 이미지 로딩 속성
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = url;
      });
    },
    [safeSetState]
  );

  // 이미지 로딩 관리 (메모리 누수 방지)
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    safeSetState(() => {
      setIsLoading(true);
      setError(false);
    });

    preloadImage(imageUrl)
      .then(() => {
        safeSetState(() => setIsLoading(false));
      })
      .catch(() => {
        safeSetState(() => {
          setIsLoading(false);
          setError(true);
        });
      });

    return () => {
      // 이미지 프리로딩 중단
      if (preloadedImageRef.current) {
        preloadedImageRef.current.onload = null;
        preloadedImageRef.current.onerror = null;
        preloadedImageRef.current.src = '';
      }
    };
  }, [isOpen, imageUrl, preloadImage, safeSetState]);

  // 뷰어 상태 초기화 (메모리 정리 최적화)
  useEffect(() => {
    if (isOpen) {
      // 상태 초기화
      safeSetState(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setIsDragging(false);
      });

      // body scroll 제어
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // 스크롤바 공간 계산
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
    return undefined;
  }, [isOpen, safeSetState]);

  // 키보드 단축키 (메모리 누수 방지)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMountedRef.current) return;

      // 수정자 키가 눌린 경우 무시
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (scale > 1) {
            safeSetState(() => {
              setPosition(prev => ({ ...prev, x: prev.x + 50 }));
            });
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (scale > 1) {
            safeSetState(() => {
              setPosition(prev => ({ ...prev, x: prev.x - 50 }));
            });
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (scale > 1) {
            safeSetState(() => {
              setPosition(prev => ({ ...prev, y: prev.y + 50 }));
            });
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (scale > 1) {
            safeSetState(() => {
              setPosition(prev => ({ ...prev, y: prev.y - 50 }));
            });
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, scale, safeSetState]);

  // ✅ passive 이벤트 리스너를 위한 DOM 기반 휠 이벤트 처리
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;

    const handleWheel = (e: WheelEvent) => {
      // ✅ passive: false로 설정하여 preventDefault 허용
      e.preventDefault();

      // 이미 throttling 중이거나 언마운트된 경우 무시
      if (wheelThrottleRef.current || !isMountedRef.current) return;

      wheelThrottleRef.current = setTimeout(() => {
        wheelThrottleRef.current = null;
      }, 16); // 60fps

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const currentScale = scale;
      const newScale = Math.min(Math.max(currentScale * delta, 0.2), 5);

      // 마우스 포인터를 중심으로 줌
      if (container) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        const scaleRatio = newScale / currentScale;
        const newPosition = {
          x: position.x - mouseX * (scaleRatio - 1),
          y: position.y - mouseY * (scaleRatio - 1),
        };

        safeSetState(() => {
          setPosition(newPosition);
          setScale(newScale);
        });
      }
    };

    // ✅ passive: false로 명시적 설정
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, scale, position, safeSetState]);

  // 줌 핸들러들 (메모리 최적화)
  const handleZoomIn = useCallback(() => {
    safeSetState(() => {
      setScale(prev => Math.min(prev * 1.2, 5));
    });
  }, [safeSetState]);

  const handleZoomOut = useCallback(() => {
    safeSetState(() => {
      setScale(prev => Math.max(prev / 1.2, 0.2));
    });
  }, [safeSetState]);

  const handleResetZoom = useCallback(() => {
    safeSetState(() => {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    });
  }, [safeSetState]);

  // 최적화된 줌 제약 계산 (메모이제이션)
  const { minScale, maxScale } = useMemo(() => {
    if (!containerRef.current || imageNaturalSize.width === 0) {
      return { minScale: 0.2, maxScale: 5 };
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const scaleToFit = Math.min(
      containerRect.width / imageNaturalSize.width,
      containerRect.height / imageNaturalSize.height
    );

    return {
      minScale: Math.min(0.2, scaleToFit * 0.5),
      maxScale: Math.max(5, scaleToFit * 10),
    };
  }, [imageNaturalSize]);

  // 드래그 핸들러들 (메모리 최적화)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1 || isLoading || error) return;

      e.preventDefault();
      safeSetState(() => {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
      });
    },
    [scale, position, isLoading, error, safeSetState]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || scale <= 1) return;

      const newPosition = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      };

      safeSetState(() => setPosition(newPosition));
    },
    [isDragging, scale, dragStart, safeSetState]
  );

  const handleMouseUp = useCallback(() => {
    safeSetState(() => setIsDragging(false));
  }, [safeSetState]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isLoading || error) return;

      if (scale === 1) {
        // 더블클릭 지점을 중심으로 확대
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const clickX = e.clientX - rect.left - rect.width / 2;
          const clickY = e.clientY - rect.top - rect.height / 2;

          const newScale = 2;
          safeSetState(() => {
            setScale(newScale);
            setPosition({
              x: -clickX * (newScale - 1),
              y: -clickY * (newScale - 1),
            });
          });
        }
      } else {
        handleResetZoom();
      }
    },
    [scale, isLoading, error, handleResetZoom, safeSetState]
  );

  // 컴포넌트 언마운트 시 정리 (메모리 누수 방지)
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // 모든 타이머 정리
      if (wheelThrottleRef.current) {
        clearTimeout(wheelThrottleRef.current);
        wheelThrottleRef.current = null;
      }

      // 프리로드된 이미지 정리
      if (preloadedImageRef.current) {
        preloadedImageRef.current.onload = null;
        preloadedImageRef.current.onerror = null;
        preloadedImageRef.current.src = '';
        preloadedImageRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const cursorStyle =
    isLoading || error ? 'default' : scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in';

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      {/* 로딩 상태 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            <p className="text-white text-sm">이미지 로딩 중...</p>
          </div>
        </div>
      )}

      {/* 에러 상태 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-white">
            <svg
              className="w-16 h-16 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <p className="text-lg font-semibold">이미지를 불러올 수 없습니다</p>
            <p className="text-sm text-slate-300">{imageUrl}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white text-black rounded-lg hover:bg-slate-200 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 컨트롤 UI */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <div className="flex items-center gap-1 bg-black bg-opacity-80 rounded-lg px-3 py-2 backdrop-blur-sm">
          <button
            onClick={handleZoomOut}
            className="text-white hover:text-blue-400 p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="축소 (-)"
            disabled={isLoading || error || scale <= minScale}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          <span className="text-white text-sm min-w-[3rem] text-center font-mono">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            className="text-white hover:text-blue-400 p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="확대 (+)"
            disabled={isLoading || error || scale >= maxScale}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>

          <button
            onClick={handleResetZoom}
            className="text-white hover:text-blue-400 p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="원본 크기 (0)"
            disabled={isLoading || error}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <button
          onClick={onClose}
          className="text-white hover:text-red-400 bg-black bg-opacity-80 p-2 rounded-lg transition-colors backdrop-blur-sm"
          title="닫기 (ESC)"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* 이미지 컨테이너 - onWheel 제거 */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        onClick={e => {
          if (e.target === e.currentTarget && !isLoading && !error) {
            onClose();
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: cursorStyle }}
      >
        {!isLoading && !error && (
          <img
            ref={imageRef}
            src={imageUrl}
            alt={altText}
            className="max-w-none max-h-none select-none"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transition: isDragging
                ? 'none'
                : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: isDragging ? 'transform' : 'auto',
              imageRendering: scale > 2 ? 'pixelated' : 'auto',
            }}
            draggable={false}
            onDoubleClick={handleDoubleClick}
            onContextMenu={e => e.preventDefault()}
          />
        )}
      </div>

      {/* 이미지 정보 및 사용법 안내 */}
      {!isLoading && !error && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2">
          {/* 이미지 정보 */}
          {imageNaturalSize.width > 0 && (
            <div className="text-white text-xs bg-black bg-opacity-70 px-3 py-1 rounded-lg backdrop-blur-sm">
              {imageNaturalSize.width} × {imageNaturalSize.height}px
            </div>
          )}

          {/* 사용법 안내 */}
          <div className="text-white text-sm bg-black bg-opacity-70 px-4 py-2 rounded-lg backdrop-blur-sm">
            <div className="flex items-center gap-4 text-xs">
              <span>🖱️ 휠: 확대/축소</span>
              <span>👆 더블클릭: 확대/원본</span>
              <span>🖐️ 드래그: 이동</span>
              <span>⌨️ 방향키: 이동</span>
              <span>ESC: 닫기</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ImageViewer);
