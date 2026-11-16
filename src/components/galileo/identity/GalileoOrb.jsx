/**
 * GalileoOrb — THE canonical Galileo. Every surface that shows Galileo shows this.
 *
 * Surfaces request a SIZE PRESET (orbSizes: hero, conversation, companion,
 * presence, micro) and a real STATE. They never choose geometry: the composition
 * comes from one shader (orbShaderSource), one uniform mapping and one per-size
 * simplification (orbField.orbView), and one motion engine (orbMotion). Size and
 * state change Galileo's scale and behaviour — never his identity.
 *
 * CONTINUITY: pass `continuity="<key>"` on two surfaces that hand Galileo to each
 * other (arrival → conversation). The outgoing orb records its motion state; the
 * incoming one resumes it — same pose, same clocks, same breath.
 *
 * NEVER BLOCKING, NEVER A BLACK CIRCLE: no WebGL, a failed compile, a lost
 * context or a throwing frame → the canonical still frame (GalileoOrbFallback),
 * which is a frame of this same shader. The renderer is validated on a FULLY
 * FORMED probe frame — an emerging Galileo's first frame is legitimately dark,
 * and judging the renderer by it is what made the arrival fall back to a still.
 *
 * PRIVACY: the props are a state NAME, a size, a coarse 0-100 level and flags.
 */

import React, { useEffect, useRef, useState } from 'react';
import { orbProfile, ORB_STATE_LABEL } from '@/lib/galileo/orbPresence';
import { createOrbRenderer } from '@/lib/galileo/orbShader';
import { createOrbMotion } from '@/lib/galileo/orbMotion';
import { orbUniforms, orbView } from '@/lib/galileo/orbField';
import { resolveOrbSize } from '@/lib/galileo/orbSizes';
import { readContinuity, writeContinuity } from '@/lib/galileo/orbContinuity';
import GalileoOrbFallback from './GalileoOrbFallback';

const GL_ATTRS = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };

// Set up before paint where React allows it, so a hand-off never shows an
// empty canvas for a frame.
const useFrameEffect = React.useLayoutEffect || useEffect;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const isCompactViewport = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches;

export default function GalileoOrb({
  state = 'idle',
  size = 'conversation',
  intelligence = 0,
  emerge = false,
  continuity = null,
  decorative = false,
  className = '',
}) {
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const redrawRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  inputRef.current = { state, intelligence };
  const px = resolveOrbSize(size, isCompactViewport());

  useFrameEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let gl = null;
    try {
      gl = canvas.getContext('webgl', GL_ATTRS) || canvas.getContext('experimental-webgl', GL_ATTRS);
    } catch {
      gl = null;
    }
    if (!gl) {
      setFallback(true);
      return undefined;
    }
    let renderer = null;
    try {
      const still = prefersReducedMotion();
      const compact = isCompactViewport();
      renderer = createOrbRenderer(gl);
      if (!renderer) {
        setFallback(true);
        return undefined;
      }
      const saved = still ? null : readContinuity(continuity);
      const motion = createOrbMotion({ reduced: still, emerge: emerge && !still, resume: saved?.motion });
      const started = saved?.started ?? performance.now();
      const save = () => continuity && !still && writeContinuity(continuity, { motion: motion.snapshot(), started });

      let ratio = 0;
      const fit = () => {
        const next = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
        if (next === ratio) return;
        ratio = next;
        canvas.width = Math.round(px * ratio);
        canvas.height = Math.round(px * ratio);
        canvas.style.width = `${px}px`;
        canvas.style.height = `${px}px`;
      };
      fit();

      const step = (now) => {
        const input = inputRef.current;
        const p = orbProfile(input.state, { intelligence: input.intelligence, reduced: still, compact });
        return motion.step(p, (now - started) / 1000);
      };
      // Breathing is the sphere's own size (~1.5%), applied to the radius, never
      // the canvas — the edge stays exactly as crisp while it swells.
      const paint = (u) => renderer.draw(orbUniforms(u, orbView(px, ratio, u.scale || 1), canvas.width, canvas.height));
      const draw = (now) => paint(step(now));

      let lost = false;
      const onLost = (e) => {
        e.preventDefault?.();
        lost = true;
        setFallback(true);
      };
      canvas.addEventListener?.('webglcontextlost', onLost);

      // A RENDERER THAT DRAWS NOTHING IS NOT A RENDERER. Validate it on a fully
      // formed probe frame (reveal = 1), read back at the sphere's centre, where
      // the smoked-glass body is itself light. The probe never reaches the
      // screen: the real first frame is painted over it in the same task.
      const painted = () => {
        try {
          const n = 24;
          const out = new Uint8Array(n * n * 4);
          gl.readPixels(Math.round(canvas.width / 2) - n / 2, Math.round(canvas.height / 2) - n / 2, n, n, gl.RGBA, gl.UNSIGNED_BYTE, out);
          for (let i = 0; i < out.length; i += 4) {
            if (out[i] + out[i + 1] + out[i + 2] > 18) return true;
          }
          return false;
        } catch {
          return true;
        }
      };
      const first = step(performance.now());
      paint({ ...first, reveal: 1 });
      if (!painted()) {
        paint({ ...first, reveal: 1 });
        if (!painted()) {
          renderer.dispose();
          canvas.removeEventListener?.('webglcontextlost', onLost);
          setFallback(true);
          return undefined;
        }
      }
      paint(first);

      if (still) {
        redrawRef.current = () => !lost && draw(performance.now());
        return () => {
          redrawRef.current = null;
          canvas.removeEventListener?.('webglcontextlost', onLost);
          renderer.dispose();
        };
      }

      let visible = true;
      let observer = null;
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver((entries) => {
          visible = entries[0]?.isIntersecting !== false;
        });
        observer.observe(canvas);
      }
      const release = () => {
        save();
        observer?.disconnect();
        canvas.removeEventListener?.('webglcontextlost', onLost);
        renderer.dispose();
      };

      let raf = 0;
      let last = 0;
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        if (lost || document.hidden || !visible) return;
        if (!motion.active((now - started) / 1000) && now - last < 32) return;
        last = now;
        try {
          fit();
          draw(now);
        } catch {
          cancelAnimationFrame(raf);
          setFallback(true);
        }
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf) || release();
    } catch {
      renderer?.dispose();
      setFallback(true);
      return undefined;
    }
  }, [px, emerge, continuity]);

  useEffect(() => {
    redrawRef.current?.();
  }, [state, intelligence]);

  return (
    <span
      className={`inline-block ${className}`}
      style={{ width: px, height: px, lineHeight: 0 }}
      data-galileo-orb="canonical"
      data-galileo-continuity={continuity || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : ORB_STATE_LABEL[state] || ORB_STATE_LABEL.idle}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {fallback ? (
        <GalileoOrbFallback size={px} state={state} intelligence={intelligence} />
      ) : (
        <canvas ref={canvasRef} style={{ width: px, height: px }} />
      )}
    </span>
  );
}