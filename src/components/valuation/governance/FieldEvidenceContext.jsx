/**
 * FieldEvidenceContext — provides openEvidence() to any component rendered
 * inside the valuation shell, and renders the EvidenceDrawer when a metric
 * is clicked.
 *
 * Usage in any workspace component:
 *   const { openEvidence } = useFieldEvidence();
 *   <span onClick={() => openEvidence('revenue_2024', 'Revenue (2024)', 'financial', '$2.4M')}>
 *
 * Also exposes the governance hook (getField, isLocked, summary) so
 * components can check lock status without importing the hook directly.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import EvidenceDrawer from './EvidenceDrawer';

const FieldEvidenceContext = createContext(null);

export function FieldEvidenceProvider({ children, valuationId, intelligence, canEdit, calcSummary, governance, isImmutable }) {
  const [drawer, setDrawer] = useState(null);

  const openEvidence = useCallback((fieldKey, displayName, category, currentValue) => {
    setDrawer({ fieldKey, displayName, category, currentValue });
  }, []);

  const close = useCallback(() => setDrawer(null), []);

  return (
    <FieldEvidenceContext.Provider value={{ openEvidence, canEdit, governance, isImmutable }}>
      {children}
      {drawer && (
        <EvidenceDrawer
          fieldKey={drawer.fieldKey}
          displayName={drawer.displayName}
          category={drawer.category}
          currentValue={drawer.currentValue}
          valuationId={valuationId}
          intelligence={intelligence}
          calcSummary={calcSummary}
          governance={governance}
          canEdit={canEdit}
          isImmutable={isImmutable}
          onClose={close}
        />
      )}
    </FieldEvidenceContext.Provider>
  );
}

export function useFieldEvidence() {
  const ctx = useContext(FieldEvidenceContext);
  if (!ctx) {
    // Return a no-op if used outside the provider (safe fallback)
    return { openEvidence: () => {}, canEdit: false, governance: null, isImmutable: false };
  }
  return ctx;
}