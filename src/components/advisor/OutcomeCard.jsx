import React, { useState } from 'react';
import { Check, X, Clock, Edit3, AlertTriangle, FileText, ArrowRight, Brain } from 'lucide-react';

/**
 * OutcomeCard — individual proposed outcome with approve/edit/dismiss/defer.
 *
 * Shows:
 *   - Type badge + risk level
 *   - Title + description
 *   - Destination system
 *   - Duplicate warning (if detected)
 *   - Destination validation issues (if any)
 *   - Memory candidate indicator + "Remember this" action
 *   - Action buttons
 */
export default function OutcomeCard({ outcome, onApprove, onDismiss, onDefer, onEdit, onRemember }) {
  const [remembering, setRemembering] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const riskColors = {
    LOW: { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)', text: 'text-emerald-400', label: 'Low Risk' },
    MEDIUM: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', text: 'text-amber-400', label: 'Medium Risk' },
    HIGH: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: 'text-red-400', label: 'High Risk' },
  };

  const risk = riskColors[outcome.risk_level];
  const hasDuplicate = outcome.duplicate_check?.has_duplicate;
  const hasValidationIssues = !outcome.destination_validation?.is_valid;
  const isNeedsReview = outcome.destination_system === 'needs_review';

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: risk.bg, borderColor: risk.border }}
    >
      {/* Header: type + risk */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {formatOutcomeType(outcome.type)}
          </span>
          <span className={`text-[10px] font-semibold ${risk.text}`}>• {risk.label}</span>
        </div>
        {outcome.memory_candidate && (
          <span className="text-[10px] text-primary/60 flex items-center gap-0.5" title="Business Memory candidate">
            <Brain className="w-2.5 h-2.5" />
            Memory
          </span>
        )}
      </div>

      {/* Title + description */}
      <p className="text-sm font-medium mb-1">{outcome.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{outcome.description}</p>

      {/* Destination */}
      <div className="flex items-center gap-1.5 mb-2">
        <ArrowRight className="w-3 h-3 text-muted-foreground/60" />
        <span className="text-[11px] text-muted-foreground">
          {isNeedsReview ? 'Needs Review' : formatDestination(outcome.destination_system)}
        </span>
        {outcome.responsible_party && (
          <span className="text-[11px] text-muted-foreground/60">
            • {outcome.responsible_party === 'advisor' ? 'Advisor' : outcome.responsible_party === 'owner' ? 'Owner' : outcome.responsible_party === 'joint' ? 'Joint' : 'System'}
          </span>
        )}
      </div>

      {/* Duplicate warning */}
      {hasDuplicate && (
        <div className="flex items-start gap-1.5 mb-2 p-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)' }}>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-amber-400 font-medium">
              Possible duplicate: "{outcome.duplicate_check.existing_item_title}"
            </p>
            <p className="text-[10px] text-muted-foreground">
              Status: {outcome.duplicate_check.existing_item_status} • Recommended: {outcome.duplicate_check.recommended_action.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      )}

      {/* Validation issues */}
      {hasValidationIssues && !isNeedsReview && (
        <div className="flex items-start gap-1.5 mb-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-red-400 font-medium">Destination validation issue</p>
            <ul className="text-[10px] text-muted-foreground">
              {outcome.destination_validation.issues.map((issue, i) => (
                <li key={i}>• {issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        {!isNeedsReview && (
          <button
            onClick={() => onApprove(outcome)}
            disabled={hasValidationIssues}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3 h-3" />
            Approve
          </button>
        )}
        <button
          onClick={() => onEdit(outcome)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border hover:bg-accent transition-colors"
        >
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
        <button
          onClick={() => onDefer(outcome)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          <Clock className="w-3 h-3" />
          Defer
        </button>
        <button
          onClick={() => onDismiss(outcome)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-red-400 transition-colors ml-auto"
        >
          <X className="w-3 h-3" />
          Dismiss
        </button>
      </div>

      {/* Remember this for future conversations — Phase 15.5 Business Memory */}
      {outcome.memory_candidate && onRemember && !remembered && (
        <button
          onClick={async () => {
            setRemembering(true);
            await onRemember(outcome);
            setRemembering(false);
            setRemembered(true);
          }}
          disabled={remembering}
          className="flex items-center gap-1.5 mt-2 text-[10px] text-primary/70 hover:text-primary transition-colors"
        >
          <Brain className="w-3 h-3" />
          {remembering ? 'Creating memory candidate…' : 'Remember this for future conversations'}
        </button>
      )}
      {remembered && (
        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400/70">
          <Check className="w-3 h-3" />
          Memory candidate created — review in Business Memory
        </div>
      )}
    </div>
  );
}

function formatOutcomeType(type) {
  const labels = {
    decision: 'Decision',
    commitment: 'Commitment',
    follow_up: 'Follow-Up',
    information_request: 'Info Request',
    advisor_note_candidate: 'Advisor Note',
    owner_note_candidate: 'Owner Note',
    verification_candidate: 'Verification',
    growth_plan_candidate: 'Growth Plan',
    sprint_task_candidate: 'Sprint Task',
    roadmap_candidate: 'Roadmap',
    valuation_review_candidate: 'Valuation Review',
    document_request_candidate: 'Document Request',
    timeline_event_candidate: 'Timeline Event',
  };
  return labels[type] || type;
}

function formatDestination(dest) {
  const labels = {
    advisor_notes: 'Advisor Notes',
    sprint_tasks: 'Sprint Tasks',
    growth_plan: 'Growth Plan',
    verification_queue: 'Verification Queue',
    document_requests: 'Document Requests',
    valuation_review: 'Valuation Review',
    business_timeline: 'Business Timeline',
    roadmap: 'Roadmap',
    needs_review: 'Needs Review',
  };
  return labels[dest] || dest;
}