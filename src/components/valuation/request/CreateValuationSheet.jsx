/**
 * CreateValuationSheet — Phase 13.3G.4
 *
 * Guided flow for an admin to create a valuation and assign the team.
 * Used for BOTH direct admin creation and conversion from an approved
 * owner request. Both paths converge on the same backend action
 * (convertToValuation handles creation + assignments in one rollback-safe call).
 *
 * Steps:
 *   1. Confirm Business and Owner
 *   2. Valuation Setup (name, purpose, standard, premise, date)
 *   3. Assign Team (lead, additional advisors, reviewer, publisher)
 *   4. Create
 */
import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Check, Search, UserPlus, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { convertToValuation } from '@/lib/valuationRequestService';
import { createValuation } from '@/lib/valuationService';

export default function CreateValuationSheet({ open, onOpenChange, business, owners = [], requestId = null, onCreated }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [config, setConfig] = useState({
    valuation_name: 'Enterprise Value Analysis',
    valuation_type: 'initial',
    valuation_purpose: '',
    standard_of_value: 'fair_market_value',
    valuation_premise: 'going_concern',
    valuation_date: '',
    engagement_date: new Date().toISOString().split('T')[0],
    lead_advisor_profile_id: '',
    additional_advisors: [],
    reviewer_profile_id: '',
    publisher_profile_id: '',
  });

  useEffect(() => {
    if (open) {
      setStep(1); setError(null);
      setConfig({
        valuation_name: 'Enterprise Value Analysis',
        valuation_type: 'initial',
        valuation_purpose: '',
        standard_of_value: 'fair_market_value',
        valuation_premise: 'going_concern',
        valuation_date: '',
        engagement_date: new Date().toISOString().split('T')[0],
        lead_advisor_profile_id: '',
        additional_advisors: [],
        reviewer_profile_id: '',
        publisher_profile_id: '',
      });
      setSearching(true);
      base44.functions.invoke('searchAssignableUsers', { action: 'searchAdvisoryAssignableUsers', searchTerm: '' })
        .then((res) => setAdvisors(res?.users || []))
        .catch(() => setAdvisors([]))
        .finally(() => setSearching(false));
    }
  }, [open]);

  const update = (k, v) => setConfig((c) => ({ ...c, [k]: v }));

  const filteredAdvisors = advisors.filter(a => {
    if (!searchTerm) return true;
    const name = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
    return name.includes(searchTerm.toLowerCase()) || (a.email || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  const advisorName = (id) => {
    const a = advisors.find(x => x.id === id);
    return a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '—';
  };

  const addAdvisor = (id) => {
    if (!id || config.additional_advisors.some(a => a.profile_id === id)) return;
    update('additional_advisors', [...config.additional_advisors, { profile_id: id, assignment_role: 'contributor', can_view: true, can_edit: true }]);
  };

  const removeAdvisor = (id) => update('additional_advisors', config.additional_advisors.filter(a => a.profile_id !== id));

  const canProceed = () => {
    if (step === 1) return !!business?.id;
    if (step === 2) return !!config.valuation_name;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true); setError(null);
    try {
      if (requestId) {
        // Conversion path
        const res = await convertToValuation(requestId, config);
        if (res?.error) throw new Error(res.error);
        onCreated?.(res);
      } else {
        // Direct creation path — use existing createValuation, then assignments
        const res = await createValuation(business.id, config.lead_advisor_profile_id || null, {
          valuation_name: config.valuation_name,
          valuation_type: config.valuation_type,
          valuation_purpose: config.valuation_purpose,
          standard_of_value: config.standard_of_value,
          valuation_premise: config.valuation_premise,
          valuation_date: config.valuation_date,
          engagement_date: config.engagement_date,
        });
        if (res?.error) throw new Error(res.error);
        const val = res.valuation;
        // Assign additional team members via existing valuationService
        for (const a of config.additional_advisors) {
          await base44.functions.invoke('valuationService', {
            action: 'assignValuationAdvisor',
            data: { valuation_id: val.id, advisor_profile_id: a.profile_id, assignment_role: a.assignment_role, can_view: a.can_view, can_edit: a.can_edit },
          });
        }
        if (config.reviewer_profile_id) {
          await base44.functions.invoke('valuationService', {
            action: 'assignValuationAdvisor',
            data: { valuation_id: val.id, advisor_profile_id: config.reviewer_profile_id, assignment_role: 'reviewer', can_view: true, can_review: true },
          });
        }
        if (config.publisher_profile_id) {
          await base44.functions.invoke('valuationService', {
            action: 'assignValuationAdvisor',
            data: { valuation_id: val.id, advisor_profile_id: config.publisher_profile_id, assignment_role: 'publisher', can_view: true, can_publish: true },
          });
        }
        onCreated?.({ valuation: val });
      }
      onOpenChange(false);
    } catch (e) {
      setError(e.message || 'Failed to create valuation');
    } finally {
      setSubmitting(false);
    }
  };

  const StepDot = ({ n, label }) => (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${step >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
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
            {requestId ? 'Create Valuation from Request' : 'New Business Valuation'}
          </SheetTitle>
          <SheetDescription>
            {requestId ? 'Convert the approved request into a valuation and assign the team.' : 'Create a valuation and assign the advisor team.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
          <StepDot n={1} label="Business" />
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <StepDot n={2} label="Setup" />
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <StepDot n={3} label="Team" />
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <StepDot n={4} label="Create" />
        </div>

        <div className="px-4 py-5 space-y-4 flex-1">
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Business</label>
                <div className="px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm">{business?.business_name || '—'}</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Business Owner(s)</label>
                {owners.length === 0 ? (
                  <p className="text-xs text-amber-400">No business owner linked. You can assign one after creation.</p>
                ) : (
                  <div className="space-y-1.5">
                    {owners.map((o) => (
                      <div key={o.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/40">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                          {(o.first_name?.[0] || '') + (o.last_name?.[0] || '')}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{o.first_name} {o.last_name}</p>
                          <p className="text-[10px] text-muted-foreground">{o.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valuation Name</label>
                <input value={config.valuation_name} onChange={(e) => update('valuation_name', e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Purpose</label>
                <input value={config.valuation_purpose} onChange={(e) => update('valuation_purpose', e.target.value)}
                  placeholder="e.g. Sale preparation, lender request…"
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Standard of Value</label>
                  <select value={config.standard_of_value} onChange={(e) => update('standard_of_value', e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="fair_market_value">Fair Market Value</option>
                    <option value="investment_value">Investment Value</option>
                    <option value="fair_value">Fair Value</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Premise</label>
                  <select value={config.valuation_premise} onChange={(e) => update('valuation_premise', e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="going_concern">Going Concern</option>
                    <option value="as_assembled_held_use">As Assembled / Held for Use</option>
                    <option value="orderly_disposition">Orderly Disposition</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Valuation Date</label>
                  <input type="date" value={config.valuation_date} onChange={(e) => update('valuation_date', e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Engagement Date</label>
                  <input type="date" value={config.engagement_date} onChange={(e) => update('engagement_date', e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Advisor search */}
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search advisors…"
                  className="w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm" />
              </div>

              {searching && <p className="text-xs text-muted-foreground">Loading advisors…</p>}

              {/* Lead advisor */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Lead Advisor</label>
                <select value={config.lead_advisor_profile_id} onChange={(e) => update('lead_advisor_profile_id', e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Select lead advisor —</option>
                  {filteredAdvisors.map((a) => (
                    <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Additional advisors */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Additional Advisors</label>
                {config.additional_advisors.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {config.additional_advisors.map((a) => (
                      <div key={a.profile_id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/20 border border-border/40">
                        <span className="text-xs text-foreground">{advisorName(a.profile_id)}</span>
                        <button onClick={() => removeAdvisor(a.profile_id)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <select value="" onChange={(e) => { if (e.target.value) addAdvisor(e.target.value); e.target.value = ''; }}
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">+ Add advisor…</option>
                  {filteredAdvisors.filter(a => a.id !== config.lead_advisor_profile_id && !config.additional_advisors.some(x => x.profile_id === a.id)).map((a) => (
                    <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Reviewer */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Reviewer</label>
                <select value={config.reviewer_profile_id} onChange={(e) => update('reviewer_profile_id', e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Select reviewer —</option>
                  {filteredAdvisors.filter(a => a.id !== config.lead_advisor_profile_id).map((a) => (
                    <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Publisher */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">Publisher</label>
                <select value={config.publisher_profile_id} onChange={(e) => update('publisher_profile_id', e.target.value)}
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Select publisher —</option>
                  {filteredAdvisors.filter(a => a.id !== config.lead_advisor_profile_id && a.id !== config.reviewer_profile_id).map((a) => (
                    <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Review and create</p>
              <div className="rounded-lg bg-muted/20 border border-border/50 divide-y divide-border/30">
                <Row label="Business" value={business?.business_name || '—'} />
                <Row label="Valuation Name" value={config.valuation_name} />
                <Row label="Purpose" value={config.valuation_purpose || '—'} />
                <Row label="Standard" value={config.standard_of_value?.replace(/_/g, ' ') || '—'} />
                <Row label="Lead Advisor" value={advisorName(config.lead_advisor_profile_id) || '—'} />
                <Row label="Additional Advisors" value={config.additional_advisors.length ? config.additional_advisors.map(a => advisorName(a.profile_id)).join(', ') : '—'} />
                <Row label="Reviewer" value={advisorName(config.reviewer_profile_id) || '—'} />
                <Row label="Publisher" value={advisorName(config.publisher_profile_id) || '—'} />
              </div>
              {requestId && (
                <div className="rounded-lg p-3 bg-primary/5 border border-primary/15">
                  <p className="text-[11px] text-muted-foreground">The approved request will be marked as converted and the owner will be notified.</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg p-3 bg-destructive/10 border border-destructive/20 text-xs text-destructive">{error}</div>
          )}
        </div>

        <SheetFooter className="flex-row items-center gap-2 border-t border-border/40 pt-3">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}><ChevronLeft className="w-4 h-4" /> Back</Button>}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="flex-1">Continue <ChevronRight className="w-4 h-4" /></Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? 'Creating…' : requestId ? 'Create Valuation' : 'Create Valuation'}
            </Button>
          )}
        </SheetFooter>
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