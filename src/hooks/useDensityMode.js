/**
 * useDensityMode — Phase 13.3F.1
 *
 * Three information density levels: Summary (default), Standard, Expert.
 * Persisted per user via localStorage.
 */
import { useState, useEffect, useCallback } from 'react';

const VALID_MODES = ['summary', 'standard', 'expert'];

export function useDensityMode(userId) {
  const [density, setDensity] = useState('summary');
  const key = `valuation_density_${userId || 'default'}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored && VALID_MODES.includes(stored)) {
        setDensity(stored);
      }
    } catch { /* non-fatal */ }
  }, [key]);

  const updateDensity = useCallback((mode) => {
    if (!VALID_MODES.includes(mode)) return;
    setDensity(mode);
    try {
      localStorage.setItem(key, mode);
    } catch { /* non-fatal */ }
  }, [key]);

  return { density, setDensity: updateDensity };
}