import React from 'react';
import { motion } from 'framer-motion';
import { fadeInUp } from '../../utils/animations';

interface AnimatedPageProps {
  children: React.ReactNode;
  className?: string;
}

export const AnimatedPage: React.FC<AnimatedPageProps> = ({ children, className }) => (
  <motion.div variants={fadeInUp} initial="hidden" animate="visible" className={className}>
    {children}
  </motion.div>
);
