/**
 * InitiativeFormModal — Phase 13.3E.5
 *
 * Create or edit a Growth Plan initiative. Supports the full initiative model:
 * name, summary, business problem, group, estimated impacts, cost, ROI,
 * timeline, difficulty, confidence, dependencies, responsible role, KPI,
 * baseline, target, verification method, client visibility, notes.
 *
 * Does not create Roadmap or 90-Day Sprint records. Only creates/edits
 * the initiative in local state (Phase 13.4 will add persistence).
 */
import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { INITIATIVE_GROUPS, DIFFICULTY_LEVELS } from '@/lib/valuation/growthPlanEngine';

const EMPTY_INITIATIVE = {
  name: '',
  summary: '',
  business_problem: '',
  group: 'ebitda_growth',
  ebitda_relevance: 'Moderate',
  multiple_relevance: '—',
  transferability_relevance: '—',
  risk_relevance: 'Low',
  confidence_relevance: 'Moderate',
  estimated_ebitda_impact: '',
  estimated_multiple_impact: '',
  estimated_cost: '',
  expected_roi: '',
  timeline: '3-6 months',
  difficulty: 'Medium',
  confidence: 50,
  dependencies: [],
  responsible_role: 'Advisor',
  kpi: '',
  baseline: '',
  target: '',
  verification_method: '',
  client_visible: false,
  notes: '',
};

const RELEVANCE_OPTIONS = ['Primary', 'High', 'Moderate', 'Low', '—'];

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

export default function InitiativeFormModal({ initiative, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY_INITIATIVE);

  useEffect(() => {
    if (initiative) {
      setForm({ ...EMPTY_INITIATIVE, ...initiative });
    }
  }, [initiative]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl p-5"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            {initiative ? 'Edit Initiative' : 'New Candidate Initiative'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Initiative Name">
            <input className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Reduce Owner Dependency" />
          </Field>

          <Field label="Plain-Language Summary">
            <textarea className={inputClass} rows={2} value={form.summary} onChange={(e) => update('summary', e.target.value)} placeholder="Brief summary of the initiative" />
          </Field>

          <Field label="Business Problem">
            <textarea className={inputClass} rows={2} value={form.business_problem} onChange={(e) => update('business_problem', e.target.value)} placeholder="What problem does this solve?" />
          </Field>

          <Field label="Group">
            <select className={inputClass} value={form.group} onChange={(e) => update('group', e.target.value)}>
              {INITIATIVE_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="EBITDA Relevance">
              <select className={inputClass} value={form.ebitda_relevance} onChange={(e) => update('ebitda_relevance', e.target.value)}>
                {RELEVANCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Multiple Relevance">
              <select className={inputClass} value={form.multiple_relevance} onChange={(e) => update('multiple_relevance', e.target.value)}>
                {RELEVANCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Transferability">
              <select className={inputClass} value={form.transferability_relevance} onChange={(e) => update('transferability_relevance', e.target.value)}>
                {RELEVANCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Risk Relevance">
              <select className={inputClass} value={form.risk_relevance} onChange={(e) => update('risk_relevance', e.target.value)}>
                {RELEVANCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Difficulty">
              <select className={inputClass} value={form.difficulty} onChange={(e) => update('difficulty', e.target.value)}>
                {DIFFICULTY_LEVELS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Timeline">
              <input className={inputClass} value={form.timeline} onChange={(e) => update('timeline', e.target.value)} placeholder="e.g. 3-6 months" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Estimated EBITDA Impact">
              <input className={inputClass} value={form.estimated_ebitda_impact} onChange={(e) => update('estimated_ebitda_impact', e.target.value)} placeholder="e.g. +$150K" />
            </Field>
            <Field label="Estimated Multiple Impact">
              <input className={inputClass} value={form.estimated_multiple_impact} onChange={(e) => update('estimated_multiple_impact', e.target.value)} placeholder="e.g. +0.5x" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Est. Cost ($)">
              <input type="number" className={inputClass} value={form.estimated_cost} onChange={(e) => update('estimated_cost', e.target.value ? Number(e.target.value) : '')} placeholder="—" />
            </Field>
            <Field label="Expected ROI">
              <input className={inputClass} value={form.expected_roi} onChange={(e) => update('expected_roi', e.target.value)} placeholder="e.g. 3x" />
            </Field>
            <Field label="Confidence (%)">
              <input type="number" min="0" max="100" className={inputClass} value={form.confidence} onChange={(e) => update('confidence', Number(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="KPI">
              <input className={inputClass} value={form.kpi} onChange={(e) => update('kpi', e.target.value)} placeholder="e.g. EBITDA margin" />
            </Field>
            <Field label="Baseline">
              <input className={inputClass} value={form.baseline} onChange={(e) => update('baseline', e.target.value)} placeholder="e.g. 12%" />
            </Field>
            <Field label="Target">
              <input className={inputClass} value={form.target} onChange={(e) => update('target', e.target.value)} placeholder="e.g. 18%" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Responsible Role">
              <input className={inputClass} value={form.responsible_role} onChange={(e) => update('responsible_role', e.target.value)} placeholder="e.g. Advisor" />
            </Field>
            <Field label="Verification Method">
              <input className={inputClass} value={form.verification_method} onChange={(e) => update('verification_method', e.target.value)} placeholder="e.g. Monthly P&L review" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Internal notes (not shown to client)" />
          </Field>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.client_visible} onChange={(e) => update('client_visible', e.target.checked)} className="rounded" />
            Client Visible (only after advisor approval)
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 px-3 py-1.5 rounded-md"
            style={{ background: 'hsl(var(--primary))' }}
          >
            <Save className="w-3 h-3" />
            Save Initiative
          </button>
        </div>
      </div>
    </div>
  );
}