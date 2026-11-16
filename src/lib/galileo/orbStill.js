/**
 * orbStill — paints Galileo's canonical still frame into an image.
 *
 * The pixels come from orbField.sampleOrb: the CPU port of the SAME shader the
 * living orb runs, in the SAME canonical pose reduced motion shows. A frozen
 * Galileo is therefore not a drawing of Galileo — it is a frame of him.
 *
 * Painted in small time slices so a large still never blocks the page, and
 * cached by size, so a hundred marks cost one paint.
 */

import { prepareOrb, sampleOrb, stillUniforms } from './orbField';

const cache = new Map();
const inflight = new Map();
const SLICE_MS = 10;

export function stillKey({ size, ratio, state = 'idle', intelligence = 0, compact = false }) {
  return `${size}|${ratio}|${state}|${Math.round((intelligence || 0) / 10)}|${compact ? 1 : 0}`;
}

export function cachedStill(opts) {
  return cache.get(stillKey(opts)) || null;
}

/** Returns a promise of a PNG data URL. Never rejects: no canvas → null. */
export function paintStill(opts) {
  const key = stillKey(opts);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const job = new Promise((resolve) => {
    let canvas = null;
    let ctx = null;
    try {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) { resolve(null); return; }
    const V = stillUniforms(opts);
    const normals = prepareOrb(V);
    const [W, H] = V.uRes;
    canvas.width = W;
    canvas.height = H;
    const img = ctx.createImageData(W, H);
    let row = 0;
    const work = () => {
      const until = performance.now() + SLICE_MS;
      while (row < H && performance.now() < until) {
        // Image rows run top-down; gl_FragCoord runs bottom-up (pixel centres).
        const fy = H - row - 0.5;
        for (let x = 0; x < W; x += 1) {
          const [r, g, b, a] = sampleOrb(V, x + 0.5, fy, normals);
          const i = (row * W + x) * 4;
          // Premultiplied → straight alpha for ImageData.
          img.data[i] = a > 0 ? Math.round((r / a) * 255) : 0;
          img.data[i + 1] = a > 0 ? Math.round((g / a) * 255) : 0;
          img.data[i + 2] = a > 0 ? Math.round((b / a) * 255) : 0;
          img.data[i + 3] = Math.round(a * 255);
        }
        row += 1;
      }
      if (row < H) { setTimeout(work, 0); return; }
      ctx.putImageData(img, 0, 0);
      const url = canvas.toDataURL('image/png');
      cache.set(key, url);
      inflight.delete(key);
      resolve(url);
    };
    work();
  });
  inflight.set(key, job);
  return job;
}