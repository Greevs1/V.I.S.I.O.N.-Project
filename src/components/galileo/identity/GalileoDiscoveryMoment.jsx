/**
 * GalileoDiscoveryMoment — the signature VISION moment (Part III).
 *
 * It renders ONLY when a genuine insight transition has happened: the caller
 * mounts it because an insight entry actually exists in the conversation. There
 * is no timer, no fabricated "analyzing" delay, and no second reveal — the orb
 * converges, ONE wave expands, and the line appears.
 *
 * No confetti, no sound, no artificial pause before the insight itself.
 */

import React from 'react';
import { motion } from 'framer-motion';
import GalileoOrb from './GalileoOrb';

export default function GalileoDiscoveryMoment({ intelligence = 0, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={`flex items-center gap-3 py-3 pl-1 ${className}`}
    >
      <GalileoOrb state="discovery" size="presence" intelligence={intelligence} decorative />
      <div>
        <p className="text-sm text-white/85">I found something.</p>
        <p className="text-[11px] text-white/35">Here is what stands out.</p>
      </div>
    </motion.div>
  );
}