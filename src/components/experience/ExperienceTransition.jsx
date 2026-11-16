/**
 * Experience Transition Component
 *
 * Provides subtle, elegant transitions between journey scenes.
 * Uses only opacity, slight blur, and slight scale.
 * No sliding, bouncing, or dramatic motion.
 *
 * Fix: Always renders motion.div (never returns null) so AnimatePresence
 * can properly handle exit animations. This prevents the flash/glitch
 * that occurs when a scene unmounts before the next scene mounts.
 */

import React from 'react';
import { motion } from 'framer-motion';

const transitionVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
    filter: 'blur(4px)',
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    filter: 'blur(4px)',
  },
};

export default function ExperienceTransition({ children, isActive }) {
  return (
    <motion.div
      initial="initial"
      animate={isActive ? "animate" : "exit"}
      exit="exit"
      variants={transitionVariants}
      transition={{
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }}
      style={{
        width: '100%',
        height: '100%',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    >
      {children}
    </motion.div>
  );
}