/**
 * useAccordionState — Phase 13.3F.1
 *
 * Manages accordion open/closed state with sessionStorage persistence.
 * Supports: one section open at a time, pinning multiple sections,
 * expand all, collapse all. State is scoped per valuation + business.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export function useAccordionState(storageKey, initialSection = null) {
  const [openSection, setOpenSection] = useState(null);
  const [pinnedSections, setPinnedSections] = useState(() => new Set());
  const initialized = useRef(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.openSection) setOpenSection(parsed.openSection);
        if (Array.isArray(parsed.pinnedSections)) setPinnedSections(new Set(parsed.pinnedSections));
      } else if (initialSection) {
        setOpenSection(initialSection);
      }
    } catch {
      if (initialSection) setOpenSection(initialSection);
    }
    initialized.current = true;
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialized.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        openSection,
        pinnedSections: Array.from(pinnedSections),
      }));
    } catch { /* non-fatal */ }
  }, [storageKey, openSection, pinnedSections]);

  const isOpen = useCallback((id) => {
    return openSection === id || pinnedSections.has(id);
  }, [openSection, pinnedSections]);

  const toggle = useCallback((id) => {
    if (pinnedSections.has(id)) {
      setPinnedSections(prev => { const next = new Set(prev); next.delete(id); return next; });
      setOpenSection(prev => prev === id ? null : prev);
      return;
    }
    setOpenSection(prev => prev === id ? null : id);
  }, [pinnedSections]);

  const pin = useCallback((id) => {
    setPinnedSections(prev => new Set([...prev, id]));
  }, []);

  const unpin = useCallback((id) => {
    setPinnedSections(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const expandAll = useCallback((allIds) => {
    setPinnedSections(new Set(allIds));
    setOpenSection(null);
  }, []);

  const collapseAll = useCallback(() => {
    setPinnedSections(new Set());
    setOpenSection(null);
  }, []);

  return { openSection, pinnedSections, isOpen, toggle, pin, unpin, expandAll, collapseAll, setOpenSection };
}