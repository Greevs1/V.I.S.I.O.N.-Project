import { useState, useEffect, useRef } from 'react';

/**
 * useCountUp — animates a number from its previous value to the target.
 * Returns null when target is null/NaN (so the component can show "—").
 */
export function useCountUp(target, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const displayRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (target == null || isNaN(target)) {
      setDisplay(null);
      displayRef.current = null;
      return;
    }
    fromRef.current = startedRef.current ? (displayRef.current || 0) : 0;
    startedRef.current = true;

    let start = null;
    let raf;
    const step = (ts) => {
      if (start == null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(current);
      displayRef.current = current;
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}