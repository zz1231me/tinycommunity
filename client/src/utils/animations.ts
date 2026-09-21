import { Variants } from 'framer-motion';

/**
 * 움직임 줄이기 설정 여부. 설정은 언제든 바뀌므로 호출할 때마다 확인한다.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: 'easeOut' } },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.15, ease: 'easeOut' } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
};
