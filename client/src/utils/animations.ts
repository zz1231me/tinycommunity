import { Variants } from 'framer-motion';

/**
 * 움직임을 줄여 달라고 설정한 사람인가.
 *
 * 연출을 건너뛸지 정하는 데 쓴다 — 뽑기 릴이 굴러가는 것, 퇴근 버튼이 도망다니는 것처럼
 * 재미를 위해 넣은 움직임은 이 설정을 켠 사람에게는 재미가 아니라 방해다.
 *
 * 부를 때마다 물어본다. 설정은 브라우저에서 언제든 바뀐다.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export const fadeInUp: Variants = {
  // 진입이 즉시 또렷하게 보이도록 짧고 빠르게(이전 0.25s+16px는 페이드 중간이 흐릿하게 보였음)
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
