/**
 * useJourneyFocus
 *
 * Deterministic Journey Step Focus System™
 *
 * Single contract for scrolling newly-revealed steps into the center of
 * the Journey scroll container. Works across all assessment cores and
 * handles framer-motion animation delay, nested containers, Blueprint
 * header offset, and mobile/desktop differences.
 *
 * Usage:
 *   const { focusStep } = useJourneyFocus(mode);
 *   // After state change that reveals a new step:
 *   focusStep(ref);           // center the element
 *   focusStep(ref, { offset: 80 }); // shift up by extra px
 *
 * Only active in journey mode — member mode calls are no-ops.
 */

import { useCallback, useRef } from 'react';

// How long to wait after state change before measuring.
// Must be >= framer-motion transition duration (0.5s + 0.1s delay = 600ms)
// We use 300ms as minimum because the element must exist in DOM first.
const ANIMATION_SETTLE_MS = 320;

// Extra upward offset so the active step sits slightly above center
// (accounts for Blueprint bar + "Sign In" header ≈ 80-100px on desktop)
const HEADER_OFFSET = 90;

/**
 * Find the Journey scroll container.
 * Priority: data-journey-scroll attr > first overflow-y scroll ancestor > window
 */
function getScrollContainer(el) {
  if (!el) return null;

  // Fastest path: explicit marker attribute
  const marked = document.querySelector('[data-journey-scroll="true"]');
  if (marked) return marked;

  // Fallback: walk up the DOM
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Perform the centering scroll.
 * Uses exact rect math — not scrollIntoView which ignores nested containers.
 * align: 'center' (default) | 'start' — 'start' places element near top of viewport
 */
function scrollElementToCenter(el, extraOffset = 0, align = 'center') {
  if (!el) return;

  const container = getScrollContainer(el);

  if (!container) {
    // Window fallback
    const rect = el.getBoundingClientRect();
    let targetY;
    if (align === 'start') {
      targetY = window.scrollY + rect.top - HEADER_OFFSET - 24 + extraOffset;
    } else {
      targetY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
    }
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();

  let targetScrollTop;
  if (align === 'start') {
    // Place element near the top of the container with comfortable padding
    targetScrollTop =
      container.scrollTop
      + (elRect.top - containerRect.top)
      - HEADER_OFFSET
      - 24
      + extraOffset;
  } else {
    // Default: center the element
    targetScrollTop =
      container.scrollTop
      + (elRect.top - containerRect.top)
      - (containerRect.height / 2 - elRect.height / 2)
      - HEADER_OFFSET
      + extraOffset;
  }

  container.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: 'smooth',
  });
}

export function useJourneyFocus(mode) {
  // Track pending focus timers so rapid transitions cancel prior ones
  const timerRef = useRef(null);

  const focusStep = useCallback((ref, options = {}) => {
    // No-op in member mode — never touch member page scroll
    if (mode !== 'journey') return;

    const { delay = ANIMATION_SETTLE_MS, offset = 0, align = 'center' } = options;

    // Cancel any pending scroll from a previous rapid transition
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      // Double rAF: first frame commits paint, second frame has final layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = ref?.current;
          scrollElementToCenter(el, offset, align);
        });
      });
    }, delay);
  }, [mode]);

  return { focusStep };
}