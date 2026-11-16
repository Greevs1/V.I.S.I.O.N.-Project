/**
 * EvidenceMetric — Phase 13.3G
 *
 * A reusable wrapper that makes any value clickable to open the EvidenceDrawer.
 * Provides a subtle hover affordance (cursor pointer, opacity shift) without
 * adding an edit icon beside every metric — keeping the dashboard clean.
 *
 * Usage:
 *   <EvidenceMetric fieldKey="revenue" displayName="Revenue" category="financial" value="$2.4M">
 *     $2.4M
 *   </EvidenceMetric>
 *
 * Or for derived values that should route to source inputs:
 *   <EvidenceMetric fieldKey="normalized_ebitda" value="$850K" derived>
 *     $850K
 *   </EvidenceMetric>
 *
 * Optionally renders a FieldLockBadge beside the value when governance_required.
 */
import React from 'react';
import { useFieldEvidence } from './FieldEvidenceContext';
import { getMetricDefinition } from '@/lib/valuation/metricEvidenceRegistry';
import FieldLockBadge from './FieldLockBadge';

export default function EvidenceMetric({
  fieldKey,
  displayName,
  category,
  value,
  children,
  showLockBadge = false,
  className = '',
  as: Tag = 'span',
}) {
  const { openEvidence } = useFieldEvidence();
  const def = getMetricDefinition(fieldKey);
  const label = displayName || def.display_name;
  const cat = category || def.category;
  const displayValue = value != null ? value : children;

  const handleClick = (e) => {
    e.stopPropagation();
    openEvidence(fieldKey, label, cat, displayValue);
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Tag
        onClick={handleClick}
        className="cursor-pointer hover:opacity-80 transition-opacity rounded"
        title={`View evidence for ${label}`}
      >
        {children != null ? children : value}
      </Tag>
      {showLockBadge && def.governance_required && <FieldLockBadge fieldKey={fieldKey} />}
    </span>
  );
}