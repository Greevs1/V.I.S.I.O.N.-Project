import React, { useState } from 'react';
import { X, Loader2, CheckCircle2, FileText, Eye, Sparkles } from 'lucide-react';
import { usePostMeetingIntelligence } from '@/hooks/usePostMeetingIntelligence';
import { useBusinessMemory } from '@/hooks/useBusinessMemory';
import OutcomeCard from './OutcomeCard';

/**
 * MeetingCloseoutDrawer — Phase 15.4
 *
 * Extends the EXISTING Meeting Brief Panel with a controlled closeout state.
 * No new page. No new module. Uses existing drawer/modal pattern.
 *
 * The advisor:
 *   1. Enters meeting notes (free text)
 *   2. Optionally captures explicit decisions
 *   3. Synthesizes proposed outcomes
 *   4. Reviews each outcome (approve/edit/dismiss/defer)
 *   5. Views client-safe follow-up preview
 *
 * AI proposes. Advisor confirms. Existing systems execute.
 */
export default function MeetingCloseoutDrawer({ open, onClose, businessId, profileId, userEmail, intent }) {
  const [advisorNotes, setAdvisorNotes] = useState('');
  const [explicitDecisions, setExplicitDecisions] = useState([]);
  const [showClientPreview, setShowClientPreview] = useState(false);
  const [clientFollowup, setClientFollowup] = useState(null);
  const [editingOutcome, setEditingOutcome] = useState(null);

  const {
    closeoutState,
    isLoading,
    isApproving,
    synthesize,
    approve,
    dismiss,
    defer,
    getClientFollowup,
    reset,
  } = usePostMeetingIntelligence({ businessId, profileId, userEmail, intent });

  // ── Phase 15.5: Business Memory — "Remember this for future conversations" ──
  const { createFromOutcome } = useBusinessMemory({ businessId, enabled: !!businessId });

  const handleRemember = async (outcome) => {
    if (!businessId) return;
    await createFromOutcome(outcome);
  };

  if (!open) return null;

  const handleSynthesize = () => {
    synthesize({
      advisorNotes,
      explicitDecisions,
      meetingDate: new Date().toISOString(),
    });
  };

  const handleApprove = async (outcome) => {
    approve(outcome);
  };

  const handleDismiss = (outcome) => {
    dismiss(outcome);
  };

  const handleDefer = (outcome) => {
    defer(outcome);
  };

  const handleEdit = (outcome) => {
    setEditingOutcome(outcome);
  };

  const handleClientPreview = async () => {
    if (!closeoutState?.approved_outcomes?.length) return;
    const followup = await getClientFollowup(closeoutState.approved_outcomes);
    setClientFollowup(followup);
    setShowClientPreview(true);
  };

  const handleClose = () => {
    reset();
    setAdvisorNotes('');
    setExplicitDecisions([]);
    setShowClientPreview(false);
    setClientFollowup(null);
    setEditingOutcome(null);
    onClose();
  };

  const hasOutcomes = closeoutState?.proposed_outcomes?.length > 0;
  const isQuiet = closeoutState?.summary?.is_quiet;
  const approvedCount = closeoutState?.approved_outcomes?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Meeting Closeout</h2>
            {closeoutState && (
              <span className="text-[11px] text-muted-foreground">
                {approvedCount} approved • {closeoutState.proposed_outcomes.length} pending
              </span>
            )}
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 1: Advisor notes (if not yet synthesized) */}
          {!closeoutState && (
            <>
              <div>
                <label className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 block">
                  Meeting Notes
                </label>
                <textarea
                  value={advisorNotes}
                  onChange={(e) => setAdvisorNotes(e.target.value)}
                  placeholder="Enter your meeting notes here. Decisions, follow-ups, action items, key discussion points…"
                  className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 block">
                  Explicit Decisions (optional)
                </label>
                {explicitDecisions.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      value={d.title}
                      onChange={(e) => {
                        const updated = [...explicitDecisions];
                        updated[i] = { ...d, title: e.target.value };
                        setExplicitDecisions(updated);
                      }}
                      placeholder="Decision title"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => setExplicitDecisions(explicitDecisions.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setExplicitDecisions([...explicitDecisions, { decision_type: 'general', title: '', description: '', responsible_party: 'joint', due_date: null }])}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Add decision
                </button>
              </div>

              <button
                onClick={handleSynthesize}
                disabled={isLoading || (!advisorNotes.trim() && explicitDecisions.length === 0)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Synthesizing outcomes…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Review Meeting Outcomes
                  </>
                )}
              </button>
            </>
          )}

          {/* Step 2: Proposed outcomes (after synthesis) */}
          {closeoutState && !showClientPreview && (
            <>
              {/* Quiet state */}
              {isQuiet && (
                <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto mb-2" />
                  <p className="text-sm font-medium">No material changes or follow-ups were identified.</p>
                  <p className="text-xs text-muted-foreground mt-1">This meeting produced no new actions. That's a valid outcome.</p>
                </div>
              )}

              {/* Summary header */}
              {hasOutcomes && (
                <div className="flex items-center gap-3 flex-wrap text-[11px]">
                  <span className="text-muted-foreground">
                    {closeoutState.summary.total_proposed} proposed •
                  </span>
                  {closeoutState.summary.by_risk.LOW > 0 && (
                    <span className="text-emerald-400">{closeoutState.summary.by_risk.LOW} low risk</span>
                  )}
                  {closeoutState.summary.by_risk.MEDIUM > 0 && (
                    <span className="text-amber-400">{closeoutState.summary.by_risk.MEDIUM} medium</span>
                  )}
                  {closeoutState.summary.by_risk.HIGH > 0 && (
                    <span className="text-red-400">{closeoutState.summary.by_risk.HIGH} high risk</span>
                  )}
                </div>
              )}

              {/* Outcome cards */}
              <div className="space-y-3">
                {closeoutState.proposed_outcomes.map((outcome) => (
                  <OutcomeCard
                    key={outcome.outcome_id}
                    outcome={outcome}
                    onApprove={handleApprove}
                    onDismiss={handleDismiss}
                    onDefer={handleDefer}
                    onEdit={handleEdit}
                    onRemember={handleRemember}
                  />
                ))}
              </div>

              {/* Approved summary */}
              {approvedCount > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="text-[10px] font-semibold tracking-wider uppercase text-emerald-400">
                      {approvedCount} Approved — Routed to Existing Systems
                    </p>
                  </div>
                  <div className="space-y-1">
                    {closeoutState.approved_outcomes.map((o) => (
                      <div key={o.outcome_id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-emerald-400">✓</span>
                        <span className="text-foreground/80">{o.title}</span>
                        <span className="text-muted-foreground/60 ml-auto">→ {formatDestination(o.destination_system)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 3: Client-safe follow-up preview */}
          {closeoutState && showClientPreview && (
            <ClientFollowupView followup={clientFollowup} onBack={() => setShowClientPreview(false)} />
          )}
        </div>

        {/* Footer */}
        {closeoutState && !showClientPreview && approvedCount > 0 && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <button
              onClick={() => { reset(); setAdvisorNotes(''); setExplicitDecisions([]); }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Start new closeout
            </button>
            <button
              onClick={handleClientPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border hover:bg-accent transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Client Follow-Up Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client Follow-Up View ──────────────────────────────────────────────────────
function ClientFollowupView({ followup, onBack }) {
  if (!followup) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Building client-safe preview…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <Eye className="w-3.5 h-3.5 text-emerald-400" />
        <p className="text-[11px] text-emerald-400/80">Client-safe preview — internal notes and risks excluded</p>
      </div>

      {followup.decisions_made?.length > 0 && (
        <FollowupSection title="Decisions Made" items={followup.decisions_made} />
      )}
      {followup.owner_action_items?.length > 0 && (
        <FollowupSection title="Owner Action Items" items={followup.owner_action_items} />
      )}
      {followup.advisor_action_items?.length > 0 && (
        <FollowupSection title="Advisor Action Items" items={followup.advisor_action_items} />
      )}
      {followup.documents_requested?.length > 0 && (
        <FollowupSection title="Documents Requested" items={followup.documents_requested} />
      )}
      {followup.agreed_priorities?.length > 0 && (
        <FollowupSection title="Agreed Priorities" items={followup.agreed_priorities} />
      )}

      <button
        onClick={onBack}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to outcomes
      </button>
    </div>
  );
}

function FollowupSection({ title, items }) {
  return (
    <div className="rounded-xl p-4 glass">
      <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-primary text-xs mt-0.5">•</span>
            <p className="text-xs text-foreground/80">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
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