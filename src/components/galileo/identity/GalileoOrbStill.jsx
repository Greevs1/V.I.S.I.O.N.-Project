/**
 * GalileoOrbStill — Galileo, held still. The SAME object, frozen.
 *
 * Used where Galileo cannot or should not run a live renderer: the fallback when
 * WebGL is unavailable, and micro identity marks (inputs, headers). The image is
 * a frame of the canonical shader (see orbStill) — not rings, not a star, not a
 * generic sphere. Until it is painted, the dark body holds the footprint.
 */

import React, { useEffect, useState } from 'react';
import { resolveOrbSize } from '@/lib/galileo/orbSizes';
import { cachedStill, paintStill } from '@/lib/galileo/orbStill';

const isCompactViewport = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches;

export default function GalileoOrbStill({
  size = 'micro',
  state = 'idle',
  intelligence = 0,
  live = false,
  role = 'mark',
  className = '',
}) {
  const compact = isCompactViewport();
  const px = resolveOrbSize(size, compact);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const ratio = Math.min(dpr, px >= 200 ? 1.5 : 2);
  const opts = { size: px, ratio, state, intelligence, compact };
  const [src, setSrc] = useState(() => cachedStill(opts));

  useEffect(() => {
    let alive = true;
    paintStill({ size: px, ratio, state, intelligence, compact }).then((url) => { if (alive) setSrc(url); });
    return () => { alive = false; };
  }, [px, ratio, state, intelligence, compact]);

  return (
    <span
      aria-hidden="true"
      data-galileo-orb="canonical-still"
      data-orb-fallback={role === 'fallback' ? 'true' : undefined}
      className={`relative inline-flex shrink-0 items-center justify-center ${
        live ? 'animate-[pulse_4s_ease-in-out_infinite] motion-reduce:animate-none' : ''
      } ${className}`}
      style={{ width: px, height: px, lineHeight: 0 }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} width={px} height={px} style={{ width: px, height: px }} />
      ) : (
        <span className="block rounded-full bg-vision-surface" style={{ width: px * 0.8, height: px * 0.8 }} />
      )}
    </span>
  );
}