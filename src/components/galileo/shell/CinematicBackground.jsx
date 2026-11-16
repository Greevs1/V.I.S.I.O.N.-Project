/**
 * CinematicBackground — atmospheric depth behind the Vision experience.
 *
 * The background is atmosphere, not content. It is strongest behind the hero
 * and resolves into the near-black application surface below it, so business
 * information always sits on a readable, calm field.
 *
 * The asset is a replaceable slot — see @/lib/visionBrand.
 */

import React from 'react';
import { VISION_HERO_BACKGROUND_URL } from '@/lib/visionBrand';

export default function CinematicBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ backgroundColor: 'hsl(var(--vision-surface))' }}
    >
      <img
        src={VISION_HERO_BACKGROUND_URL}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-60"
        style={{ objectPosition: '50% 28%' }}
      />

      {/* Readability scrim — darkens toward the application surface below. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,5,9,0.30) 0%, rgba(5,5,9,0.62) 30%, rgba(5,5,9,0.90) 58%, hsl(var(--vision-surface)) 84%)',
        }}
      />

      {/* Warm horizon glow — restrained, upper third only. */}
      <div
        className="absolute inset-x-0 top-0 h-[46vh]"
        style={{
          background:
            'radial-gradient(ellipse 72% 100% at 50% 0%, rgba(212,168,83,0.14) 0%, rgba(212,168,83,0.04) 42%, transparent 72%)',
        }}
      />

      {/* Vignette — keeps the eye centered without crushing the edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 125% 95% at 50% 0%, transparent 42%, rgba(0,0,0,0.58) 100%)',
        }}
      />
    </div>
  );
}