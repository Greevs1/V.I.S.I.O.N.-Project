/**
 * scrollJourneyStepIntoView
 *
 * Legacy wrapper — preserved for backward compatibility.
 * New code should use useJourneyFocus hook instead.
 *
 * Scrolls a newly-revealed journey section into the center of the
 * Journey scroll container using exact rect math (not scrollIntoView).
 */

const HEADER_OFFSET = 90;

function getScrollContainer(el) {
  const marked = document.querySelector('[data-journey-scroll="true"]');
  if (marked) return marked;
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

function scrollElementToCenter(el, extraOffset = 0) {
  if (!el) return;
  const container = getScrollContainer(el);
  if (!container) {
    const rect = el.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2), behavior: 'smooth' });
    return;
  }
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const targetScrollTop =
    container.scrollTop
    + (eRect.top - cRect.top)
    - (cRect.height / 2 - eRect.height / 2)
    - HEADER_OFFSET
    + extraOffset;
  container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
}

export function scrollJourneyStepIntoView(ref, delayMs = 320) {
  if (!ref?.current) return;

  // Double rAF after delay so framer-motion animation has settled
  setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollElementToCenter(ref.current, 0);
      });
    });
  }, delayMs);
}