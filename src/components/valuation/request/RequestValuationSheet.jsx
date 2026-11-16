/**
 * RequestValuationSheet — Phase 13.3G.4
 *
 * Apple-style guided sheet for business owners to request a valuation.
 * Four short steps: Why, Timing, Context, Review.
 */
import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Check, AlertCircle, FileText, Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createRequest } from '@/lib/valuationRequestService';

const PURPOSE_OPTIONS = [
  { value: 'Understand current business value', icon: '📊' },
  { value: 'Prepare for a future sale', icon: '🏷️' },
  { value: 'Evaluate an offer', icon: '📋' },
  { value: 'Partner or ownership planning', icon: '🤝' },
  { value: 'Estate or succession planning', icon: '🏛️' },
  { value: 'Financing or lender request', icon: '🏦' },
  { value: 'Strategic planning', icon: '🎯' },
  { value: 'Annual enterprise value review', icon: '📅' },
  { value: 'Other', icon: '✏️' },
];

const TIMELINE_OPTIONS = [
  { value: 'target_date', label: 'Target Event Date' },
  { value: 'no_immediate', label: 'No Immediate Deadline' },
  { value: 'within_90_days', label: 'Within 90 Days' },
  { value: 'urgent', label: 'Urgent' },
];

export default function RequestValuationSheet({ open, onOpenChange, businessId, businessName, onSubmitted }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    valuation_purpose: '',
    urgency: 'no_immediate',
    target_event_date: '',
    request_reason: '',
    transaction_context: '',
    notes: '',
    preferred_contact: '',
  });

  useEffect(() => {
    if (open) {
      setStep(1); setError(null); setDuplicate(null); setSuccess(null);
      setForm({ valuation_purpose: '', urgency: 'no_immediate', target_event_date: '', request_reason: '', transaction_context: '', notes: '', preferred_contact: '' });
    }
  }, [open]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canProceed = () => {
    if (step === 1) return !!form.valuation_purpose;
    if (step === 2) return !!form.urgency;
    if (step === 3) return !!businessId;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true); setError(null); setDuplicate(null);
    try {
      const res = await createRequest({
        business_id: businessId,
        request_type: 'new_valuation',
        valuation_purpose: form.valuation_purpose,
        urgency: form.urgency,
        target_event_date: form.urgency === 'target_date' ? form.target_event_date : null,
        request_reason: form.request_reason,
        transaction_context: form.transaction_context,
        notes: form.notes + (form.preferred_contact ? `\nPreferred contact: ${form.preferred_contact}` : ''),
        supporting_document_ids: [],
      });
      if (res?.error) {
        if (res.error === 'DUPLICATE_REQUEST') { setDuplicate(res.existing_request); }
        else setError(res.error);
      } else {
        setSuccess(res.request);
      }
    } catch (e) {
      setError(e.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const StepDot = ({ n, label }) => (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${step >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        {step > n ? <Check className="w-3 h-3" /> : n}
      </div>
      <span className={`text-[10px] ${step >= n ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            {success ? 'Request Submitted' : 'Request a Valuation'}
          </SheetTitle>
          <SheetDescription>
            {success ? 'Your request has been received.' : 'A short guided request. An administrator will review and assign the right advisor.'}
          </SheetDescription>
        </SheetHeader>

        {success ? (
          <div className="px-4 pb-8 space-y-6">
            <div className="flex flex-col items-center text-center pt-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-lg font-display font-semibold text-foreground">Valuation Request Submitted</h2>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-xs">
                Your request has been received. Our V.I.S.I.O.N. Team will review your information, assign the appropriate advisor, and keep you updated throughout the process.
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next Step</p>
              <p className="text-xs text-foreground">An administrator will review your request and assign the appropriate advisor.</p>
            </div>
            <div className="space-y-1 text-xs">
              <Row label="Business" value={businessName || '—'} />
              <Row label="Purpose" value={success.valuation_purpose || '—'} />
              <Row label="Submitted" value={new Date(success.submitted_at).toLocaleDateString()} />
              <Row label="Status" value="Submitted" />
            </div>
            <Button onClick={() => { onOpenChange(false); onSubmitted?.(success); }} className="w-full">
              Done
            </Button>
          </div>
        ) : duplicate ? (
          <div className="px-4 pb-8 space-y-4">
            <div className="rounded-xl p-5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertCircle className="w-6 h-6 text-amber-400 mb-2" />
              <p className="text-sm font-medium text-foreground">A request already exists for this business.</p>
              <p className="text-xs text-muted-foreground mt-1">Request #{duplicate.request_number} is currently {duplicate.status?.replace(/_/g, ' ')}.</p>
            </div>
            <Button variant="outline" onClick={() => { setDuplicate(null); onOpenChange(false); }} className="w-full">
              View Existing Request
            </Button>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
              <StepDot n={1} label="Why" />
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <StepDot n={2} label="Timing" />
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <StepDot n={3} label="Context" />
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <StepDot n={4} label="Review" />
            </div>

            <div className="px-4 py-5 space-y-4 flex-1">
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Why do you need a valuation?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {PURPOSE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => update('valuation_purpose', opt.value)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all ${form.valuation_purpose === opt.value ? 'bg-primary/10 border border-primary/40' : 'bg-muted/30 border border-transparent hover:bg-muted/50'}`}
                      >
                        <span className="text-base">{opt.icon}</span>
                        <span className="flex-1">{opt.value}</span>
                        {form.valuation_purpose === opt.value && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-foreground">What is your timing?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {TIMELINE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => update('urgency', opt.value)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all ${form.urgency === opt.value ? 'bg-primary/10 border border-primary/40' : 'bg-muted/30 border border-transparent hover:bg-muted/50'}`}
                      >
                        <span>{opt.label}</span>
                        {form.urgency === opt.value && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                  {form.urgency === 'target_date' && (
                    <div className="space-y-1.5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-left text-sm bg-muted/30 border border-border hover:bg-muted/50 transition-colors">
                            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                            <span className={form.target_event_date ? 'text-foreground' : 'text-muted-foreground'}>
                              {form.target_event_date
                                ? new Date(form.target_event_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                : 'Select a date'}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={form.target_event_date ? new Date(form.target_event_date) : undefined}
                            onSelect={(d) => update('target_event_date', d ? d.toISOString().split('T')[0] : '')}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                        Select the date you're preparing for (sale, financing, succession, acquisition, etc.).
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Short explanation (optional)</label>
                    <textarea value={form.request_reason} onChange={(e) => update('request_reason', e.target.value)}
                      placeholder="Briefly describe your situation…"
                      className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={3} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-foreground">Business context</p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Business</label>
                    <div className="px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm">{businessName || 'Select a business'}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Known transaction or planning context (optional)</label>
                    <textarea value={form.transaction_context} onChange={(e) => update('transaction_context', e.target.value)}
                      placeholder="e.g. Considering an offer, partner buyout, lender requirement…"
                      className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={3} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Preferred contact (optional)</label>
                    <input value={form.preferred_contact} onChange={(e) => update('preferred_contact', e.target.value)}
                      placeholder="Phone or email"
                      className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Additional notes (optional)</label>
                    <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
                      className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm resize-none" rows={2} />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Review and submit</p>
                  <div className="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/30">
                    <Row label="Business" value={businessName || '—'} />
                    <Row label="Purpose" value={form.valuation_purpose || '—'} />
                    <Row label="Timing" value={TIMELINE_OPTIONS.find(t => t.value === form.urgency)?.label || '—'} />
                    {form.urgency === 'target_date' && <Row label="Target date" value={form.target_event_date || '—'} />}
                    <Row label="Context" value={form.transaction_context || '—'} />
                  </div>
                  <div className="rounded-lg p-3 bg-primary/5 border border-primary/15">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <strong className="text-foreground">What happens next:</strong> An administrator reviews your request, confirms any missing information, and assigns the appropriate advisor. You will receive updates as the request progresses.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg p-3 bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>

            <SheetFooter className="flex-row items-center gap-2 border-t border-border/40 pt-3">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              )}
              {step < 4 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="flex-1">
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                  {submitting ? 'Submitting…' : 'Submit Valuation Request'}
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span className="text-foreground text-xs text-right">{value}</span>
    </div>
  );
}