/**
 * BusinessSnapshot — grouped intelligence candidates across 6 categories.
 * Each field shows value, confidence chip, source badge, conflict/stale badges.
 * Missing fields show guidance instead of an empty "Not Set" wall.
 */
import React, { useState } from 'react';
import { ChevronDown, ShieldCheck, AlertTriangle, Clock, ExternalLink, FileQuestion } from 'lucide-react';
import { SNAPSHOT_CATEGORIES } from '@/lib/valuation/intelligenceMappingFrontend';
import { useFieldEvidence } from '@/components/valuation/governance/FieldEvidenceContext';

const CONFIDENCE_STYLES = {
  verified: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'Verified' },
  high: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'High' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Medium' },
  low: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Low' },
  missing: { color: '#6B7280', bg: 'rgba(107,114,128,0.08)', label: 'Missing' },
  conflicting: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: 'Conflicting' },
};

function FieldRow({ candidate }) {
  const [expanded, setExpanded] = useState(false);
  const { openEvidence } = useFieldEvidence();
  const cs = CONFIDENCE_STYLES[candidate.confidence_level] || CONFIDENCE_STYLES.missing;
  const hasValue = candidate.suggested_value != null && candidate.suggested_value !== '';

  const handleEvidenceClick = (e) => {
    e.stopPropagation();
    openEvidence(candidate.field_key, candidate.display_name, candidate.category, candidate.formatted_value || candidate.suggested_value);
  };

  return (
    <div className="rounded-lg" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="w-full flex items-center gap-2 p-2.5 text-left">
        <button onClick={() => setExpanded(!expanded)} className="flex-1 min-w-0 text-left">
          <p className="text-xs font-medium text-foreground">{candidate.display_name}</p>
          {hasValue ? (
            <p className="text-sm text-foreground mt-0.5">{candidate.formatted_value}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic mt-0.5">Not available</p>
          )}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {candidate.advisor_approved && <ShieldCheck className="w-3 h-3 text-accent" />}
          {candidate.conflict_status === 'material' && <AlertTriangle className="w-3 h-3 text-destructive" />}
          {candidate.stale && <Clock className="w-3 h-3 text-muted-foreground" />}
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: cs.color, background: cs.bg }}>{cs.label}</span>
          {hasValue && (
            <button
              onClick={handleEvidenceClick}
              className="text-muted-foreground/60 hover:text-primary transition-colors"
              title="View evidence"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {hasValue && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Source:</span>
              <span className="text-foreground/80">{candidate.source_name}</span>
              {candidate.reporting_period && <span className="text-muted-foreground">· {candidate.reporting_period}</span>}
            </div>
          )}
          {candidate.alternative_values?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alternative Sources</p>
              {candidate.alternative_values.map((alt, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{alt.source_name}</span>
                  <span className="text-foreground/70">{typeof alt.value === 'number' ? alt.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : String(alt.value)}</span>
                </div>
              ))}
            </div>
          )}
          {!hasValue && (
            <div className="space-y-1 pt-1">
              <p className="text-[11px] text-muted-foreground"><span className="text-foreground/70">Why it matters:</span> {candidate.display_name && ''} {candidate.recommended_action}</p>
            </div>
          )}
          {candidate.conflict_status === 'material' && (
            <div className="rounded p-2 text-[11px]" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-destructive font-medium">Material conflict detected</p>
              <p className="text-muted-foreground mt-0.5">{candidate.recommended_action}</p>
            </div>
          )}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1">
            <span>Recommended:</span>
            <span className="text-foreground/70">{candidate.recommended_action}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BusinessSnapshot({ candidates }) {
  const byCategory = {};
  for (const c of candidates || []) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Business Snapshot</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">What the platform already knows — with provenance and confidence.</p>
      </div>
      {SNAPSHOT_CATEGORIES.map((cat) => {
        const fields = byCategory[cat.key] || [];
        if (fields.length === 0) return null;
        const available = fields.filter((f) => f.suggested_value != null).length;
        return (
          <div key={cat.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground/90 uppercase tracking-wider">{cat.label}</h4>
              <span className="text-[10px] text-muted-foreground">{available}/{fields.length} available</span>
            </div>
            <div className="space-y-1.5">
              {fields.map((c) => <FieldRow key={c.field_key} candidate={c} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}