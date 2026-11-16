/**
 * StartValuationModal — Phase 13.3G.2
 *
 * Clean, minimal modal for starting a new valuation. Uses progressive
 * disclosure: the default view shows only Name, Purpose, Date, and Lead
 * Advisor. Advanced options reveal Standard of Value, Premise, Engagement
 * Type, and Reuse Verified Data.
 *
 * Calls the certified createValuation backend action. Scopes to the active
 * business. Creates a lead assignment with full lifecycle permissions.
 */
import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { createValuation } from '@/lib/valuationService';
import { base44 } from '@/api/base44Client';

const PURPOSES = [
  { value: 'fair_market_value', label: 'Fair Market Value' },
  { value: 'investment_value', label: 'Investment Value' },
  { value: 'strategic_value', label: 'Strategic Value' },
  { value: 'fair_value', label: 'Fair Value' },
  { value: 'indicative_enterprise_value', label: 'Indicative Enterprise Value' },
];

const STANDARDS = [
  { value: 'fair_market_value', label: 'Fair Market Value' },
  { value: 'investment_value', label: 'Investment Value' },
  { value: 'strategic_value', label: 'Strategic Value' },
  { value: 'fair_value', label: 'Fair Value' },
  { value: 'indicative_enterprise_value', label: 'Indicative Enterprise Value' },
];

const PREMISES = [
  { value: 'going_concern', label: 'Going Concern' },
  { value: 'orderly_liquidation', label: 'Orderly Liquidation' },
  { value: 'asset_sale', label: 'Asset Sale' },
  { value: 'stock_sale', label: 'Stock Sale' },
  { value: 'controlling_interest', label: 'Controlling Interest' },
  { value: 'minority_interest', label: 'Minority Interest' },
];

const ENGAGEMENT_TYPES = [
  { value: 'initial', label: 'Initial Valuation' },
  { value: 'annual_update', label: 'Annual Update' },
  { value: 'pre_exit', label: 'Pre-Exit Preparation' },
  { value: 'transaction', label: 'Transaction Support' },
  { value: 'strategic', label: 'Strategic Planning' },
  { value: 'other', label: 'Other' },
];

export default function StartValuationModal({ open, onClose, businessId, onCreated, defaultLeadProfileId }) {
  const [name, setName] = useState('Enterprise Value Analysis');
  const [purpose, setPurpose] = useState('fair_market_value');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [leadId, setLeadId] = useState(defaultLeadProfileId || '');
  const [engagementType, setEngagementType] = useState('initial');
  const [standard, setStandard] = useState('');
  const [premise, setPremise] = useState('');
  const [reuseData, setReuseData] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [advisors, setAdvisors] = useState([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLeadId(defaultLeadProfileId || '');
    setError(null);
    setSearching(true);
    base44.functions.invoke('searchAssignableUsers', { action: 'searchAdvisoryAssignableUsers', searchTerm: '' })
      .then((res) => setAdvisors(res?.users || []))
      .catch(() => setAdvisors([]))
      .finally(() => setSearching(false));
  }, [open, defaultLeadProfileId]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!businessId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createValuation(businessId, leadId || null, {
        valuation_name: name,
        valuation_purpose: purpose,
        valuation_date: date,
        valuation_type: engagementType,
        standard_of_value: standard || null,
        valuation_premise: premise || null,
        reuse_verified_data: reuseData,
      });
      if (res?.valuation) {
        onCreated?.(res.valuation);
        onClose?.();
      } else {
        setError(res?.error || 'Failed to create valuation');
      }
    } catch (err) {
      setError(err.message || 'Failed to create valuation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,168,83,0.1)' }}>
            <Plus className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold">Start New Valuation</h2>
            <p className="text-xs text-muted-foreground">Begin a structured enterprise value analysis.</p>
          </div>
        </div>

        {/* Default fields */}
        <div className="space-y-3">
          <Field label="Valuation Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm bg-background border border-border focus:border-primary outline-none"
            />
          </Field>
          <Field label="Valuation Purpose">
            <Select value={purpose} onChange={setPurpose} options={PURPOSES} />
          </Field>
          <Field label="Valuation Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm bg-background border border-border focus:border-primary outline-none"
            />
          </Field>
          <Field label="Lead Advisor">
            {searching ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading advisors…
              </div>
            ) : (
              <Select
                value={leadId}
                onChange={setLeadId}
                options={advisors.map((a) => ({ value: a.profile_id, label: a.full_name || a.email }))}
                placeholder="Select lead advisor"
              />
            )}
          </Field>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setAdvanced(!advanced)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {advanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Advanced Options
        </button>

        {/* Advanced fields */}
        {advanced && (
          <div className="space-y-3 pt-1 border-t border-border/40">
            <Field label="Standard of Value">
              <Select value={standard} onChange={setStandard} options={STANDARDS} placeholder="Select standard" />
            </Field>
            <Field label="Premise">
              <Select value={premise} onChange={setPremise} options={PREMISES} placeholder="Select premise" />
            </Field>
            <Field label="Engagement Type">
              <Select value={engagementType} onChange={setEngagementType} options={ENGAGEMENT_TYPES} />
            </Field>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reuseData}
                onChange={(e) => setReuseData(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-xs text-foreground">Reuse verified business data from existing platform sources</span>
            </label>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ background: '#D4A853', color: '#08080C' }}
          >
            {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : <><Plus className="w-3.5 h-3.5" /> Start Valuation</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-sm bg-background border border-border focus:border-primary outline-none"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}