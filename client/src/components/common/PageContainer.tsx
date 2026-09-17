import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fadeInUp } from '../../utils/animations';

/** 콘텐츠 최대폭 — design-system.css의 --content-width* 토큰과 연결 */
export type ContentWidth = 'wide' | 'reading';

const WIDTH_CLASS: Record<ContentWidth, string> = {
  wide: 'content-wrapper', // 목록·관리·상세·에디터 (--content-width)
  reading: 'content-wrapper-reading', // 위키 문서·프로필 (--content-width-reading)
};

interface PageContainerProps {
  children: ReactNode;
  /** 콘텐츠 최대폭 (기본 wide) */
  width?: ContentWidth;
  /** 진입 페이드인 애니메이션 (기본 true) */
  animate?: boolean;
  /** 콘텐츠 영역에 추가할 클래스 (예: 'space-y-6') */
  className?: string;
}

/**
 * 모든 페이지 콘텐츠의 공통 셸.
 * - 폭/중앙정렬/표준 패딩을 `.content-wrapper*` 클래스(= --content-width* 토큰) 한 곳에서 관리.
 * - 배경/스크롤은 Dashboard `<main>`이 담당하므로 여기서 설정하지 않음(중복 bg·중첩 스크롤 방지).
 * - 폭을 바꾸려면 design-system.css의 토큰 한 줄만 수정하면 전 페이지가 함께 조정됨.
 */
export function PageContainer({
  children,
  width = 'wide',
  animate = true,
  className = '',
}: PageContainerProps) {
  const inner = <div className={`${WIDTH_CLASS[width]} ${className}`.trim()}>{children}</div>;

  if (!animate) return inner;
  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible">
      {inner}
    </motion.div>
  );
}
