/**
 * HomeHero — the calm, personal opening of Vision Home.
 *
 * Date · greeting · one contextual line. Nothing else.
 * Every value is derived at render time: no hardcoded names or dates.
 */

import React from 'react';
import { motion } from 'framer-motion';

function greetingFor(hour) {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeHero({ firstName, businessName }) {
  const now = new Date();
  const dateLine = `${now
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toUpperCase()}, ${now
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()}`;

  const greeting = greetingFor(now.getHours());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-2.5"
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-vision-champagne/45 font-medium">
        {dateLine}
      </p>

      <h1 className="font-display text-[34px] md:text-[46px] leading-[1.05] text-white/95">
        {greeting}
        {firstName ? `, ${firstName}` : ''}.
      </h1>

      <p className="text-[14px] md:text-[15px] text-white/50 max-w-[620px] leading-relaxed">
        {businessName
          ? `Here's your next best move for ${businessName}.`
          : "Here's what matters most right now."}
      </p>
    </motion.div>
  );
}