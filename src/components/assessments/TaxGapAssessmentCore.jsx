import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import GalileoBadge from '@/components/galileo/GalileoBadge';
import GalileoHelpBubble from '@/components/experience/GalileoHelpBubble';
import { base44 } from '@/api/base44Client';
import { useAssessment } from '@/lib/AssessmentContext';
import { calcTaxGap, calcTaxCompound } from '@/lib/assessmentCalculations';
import { validateAssessmentResults, logValidation } from '@/lib/assessmentValidation';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import { useJourneyFocus } from '@/hooks/useJourneyFocus';
import { useBusinessContext } from '@/lib/BusinessContext';

const COLOR = '#22c55e';

const ENTITY_STRUCTURES = [
  { id: 'sole_prop', label: 'Sole Prop' },
  { id: 'llc', label: 'LLC' },
  { id: 's_corp', label: 'S-Corp' },
  { id: 'c_corp', label: 'C-Corp' },
  { id: 'partnership', label: 'Partnership' },
];

const CHILDREN_OPTIONS = ['0', '1', '2', '3', '4+'];

const TAX_QUESTIONS = [
  { field: 't3_has_employees', label: 'Does this business currently have employees?', desc: 'Employment tax optimization opportunities', type: 'conditional' },
  { field: 't3_employee_count', label: 'Approximately how many employees does this business have?', desc: 'Payroll tax strategy scaling', type: 'conditional', dependsOn: 't3_has_employees', options: ['1-5', '6-20', '21-50', '51-100', '100+'] },
  { field: 't3_prop', label: 'Own commercial or investment real estate?', desc: 'Cost segregation & bonus depreciation' },
  { field: 't3_rd', label: 'Develops products, software, or new processes?', desc: 'R&D tax credit eligibility (IRC §41)' },
  { field: 't3_hsa', label: 'Currently using an HSA or HRA?', desc: 'Health savings & reimbursement accounts' },
  { field: 't3_ret', label: 'Do you have a qualified retirement plan?', desc: 'SEP-IRA, Solo 401(k), Defined Benefit' },
  { field: 't3_home_office', label: 'Do you have a home office or pay for cell/internet?', desc: 'Accountable plan & Augusta Rule' },
  { field: 't3_vehicle', label: 'Do you purchase heavy vehicles or equipment?', desc: 'Section 179 & bonus depreciation' },
  { field: 't3_ptet', label: 'Do you pay state income tax?', desc: 'Pass-Through Entity Tax (PTET) election' },
];

/**
 * TaxGapAssessmentCore
 *
 * mode="member"  — full production save + navigate to /assessments/operations-gap
 * mode="journey" — calls onComplete(answers, results), no DB write, no navigate
 */
export default function TaxGapAssessmentCore({ mode = 'member', onComplete }) {
  const { state, updateState, saveAssessmentToDB } = useAssessment();
  const navigate = useNavigate();
  const { focusStep } = useJourneyFocus(mode);
  const { context: bizCtx } = useBusinessContext();
  const [reinvestRate, setReinvestRate] = useState(6);
  const [agiSourceLabel, setAgiSourceLabel] = useState(null);
  // The document behind the auto-populated figure, when there is one. The badge
  // only becomes a link when this is a real document (see GalileoBadge).
  const [agiSourceDocument, setAgiSourceDocument] = useState(null);
  const mainCardRef = useRef(null);
  const savingsSummaryRef = useRef(null);
  const prevTaxGap = useRef(0);

  // Journey: focus the main input card on mount
  useEffect(() => {
    if (mode === 'journey') focusStep(mainCardRef, { delay: 150 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.t3_agi > 0) return;
    base44.functions.invoke('getMetricAutoPopulate', { active_business_id: bizCtx.active_business_id }).then(res => {
      const d = res.data;
      if (d?.agi && d.agi > 0) {
        updateState({ t3_agi: d.agi });
        setAgiSourceLabel(
          d.sources?.agi === 'extracted_fields' ? 'Source: Uploaded tax return'
          : d.sources?.agi === 'profile_financials' ? 'Source: Profile financials'
          : d.sources?.agi === 'prior_assessment' ? 'Source: Prior assessment'
          : 'Auto-populated from your data'
        );
        // Only a document-backed figure becomes clickable evidence.
        setAgiSourceDocument(
          d.sources?.agi === 'extracted_fields' ? (d.sources.agi_document || null) : null
        );
        return;
      }
      if (state.p1_rev > 0 && state.p1_mymargin > 0) {
        const derived = Math.round(state.p1_rev * state.p1_mymargin / 100);
        updateState({ t3_agi: derived });
        setAgiSourceLabel('Auto-populated from profit margin');
      }
    }).catch(() => {
      if (state.t3_agi <= 0 && state.p1_rev > 0 && state.p1_mymargin > 0) {
        const derived = Math.round(state.p1_rev * state.p1_mymargin / 100);
        updateState({ t3_agi: derived });
        setAgiSourceLabel('Auto-populated from profit margin');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const derivedAgi = state.t3_agi > 0 ? null
    : (state.p1_rev > 0 && state.p1_mymargin > 0 ? Math.round(state.p1_rev * state.p1_mymargin / 100) : null);

  const { t3_entity, t3_kids, t3_has_employees, t3_employee_count, t3_prop, t3_rd, t3_hsa, t3_ret, t3_home_office, t3_vehicle, t3_ptet } = state;
  const t3_agi = state.t3_agi > 0 ? state.t3_agi : (derivedAgi || 0);

  const taxResults = calcTaxGap(state);
  const { t3_annual_gap, t3_strategies, t3_strategy_breakdown = [] } = taxResults;

  // Track previous tax gap for reference (no auto-scroll)
  useEffect(() => {
    prevTaxGap.current = t3_annual_gap;
  }, [t3_annual_gap]);
  const compoundCost = calcTaxCompound(t3_annual_gap, reinvestRate);

  const toggle = (field, val) => updateState({ [field]: val ? 'yes' : 'no' });
  const getFieldVal = (field) => state[field] === 'yes';
  const childrenNum = typeof t3_kids === 'number' ? t3_kids : parseInt(t3_kids) || 0;

  const [validationError, setValidationError] = useState('');

  const handleNext = async () => {
    if (mode === 'journey' && !(t3_agi > 0)) {
      setValidationError('Please enter your Annual AGI to continue.');
      mainCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setValidationError('');
    const answers = { t3_agi, t3_entity, t3_kids, t3_has_employees, t3_employee_count, t3_prop, t3_rd, t3_hsa, t3_ret, t3_home_office, t3_vehicle, t3_ptet };
    const results = { ...taxResults, t3_annual_gap };

    const validation = validateAssessmentResults('tax_gap', results, state);
    logValidation('tax_gap', validation);
    if (!validation.valid) console.error('[TAX_GAP_SAVE_BLOCKED] Missing required fields:', validation.missing);

    if (mode === 'member') {
      recordAssessmentCompletion('tax_gap', answers, results, SOURCE_TYPES.MEMBER_ANSWER);
      await saveAssessmentToDB('tax_gap', answers, results);
      updateState({ t3_annual_gap, t3_strategies });
      navigate('/assessments/operations-gap');
    } else {
      onComplete?.(answers, results);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(34,197,94,0.15)', color: COLOR, border: '1.5px solid rgba(34,197,94,0.4)' }}>
          04
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Tax Gap Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">How much are you overpaying the IRS every year?</p>
        </div>
      </div>

      {/* Main Input Card */}
      <div ref={mainCardRef} className="rounded-xl border bg-card p-6 space-y-6" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: COLOR }}>Tax Profile</p>

        {/* AGI + Children */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground block">Annual AGI</label>
              <GalileoBadge
                source={agiSourceLabel || ((!state.t3_agi && derivedAgi) ? 'Auto-populated from profit margin' : null)}
                document={agiSourceDocument}
              />
              {mode === 'journey' && <GalileoHelpBubble fieldKey="t3_agi" />}
            </div>
            <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-secondary">
              <span className="text-muted-foreground text-sm">$</span>
              <input
                type="text"
                placeholder="e.g. 350,000"
                value={t3_agi || ''}
                onChange={(e) => updateState({ t3_agi: Number(e.target.value.replace(/[^0-9]/g, '')) })}
                className="bg-transparent flex-1 outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Children Under 18</label>
            <div className="flex gap-2">
              {CHILDREN_OPTIONS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => updateState({ t3_kids: i === 4 ? 4 : i })}
                  className="flex-1 py-2 rounded-md text-sm font-medium transition-all border"
                  style={(i === 4 ? childrenNum >= 4 : childrenNum === i)
                    ? { background: 'rgba(34,197,94,0.15)', borderColor: COLOR, color: COLOR }
                    : {}}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Entity Structure */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Business Entity Structure</label>
          <div className="flex flex-wrap gap-2">
            {ENTITY_STRUCTURES.map(e => (
              <button
                key={e.id}
                onClick={() => updateState({ t3_entity: e.id })}
                className="px-4 py-2 rounded-md text-sm font-medium transition-all border"
                style={t3_entity === e.id
                  ? { background: 'rgba(34,197,94,0.15)', borderColor: COLOR, color: COLOR }
                  : {}}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Yes/No + Conditional Questions */}
        <div className="space-y-0 pt-2">
          {TAX_QUESTIONS.map((q) => {
            if (q.type === 'conditional' && q.dependsOn) {
              if (!getFieldVal('t3_has_employees')) return null;
              return (
                <div key={q.field} className="py-3 border-b border-border last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{q.label}</p>
                      <p className="text-xs text-muted-foreground">{q.desc}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => updateState({ [q.field]: opt })}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                          state[q.field] === opt
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={q.field} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{q.label}</p>
                  <p className="text-xs text-muted-foreground">{q.desc}</p>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => toggle(q.field, true)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-all border"
                    style={getFieldVal(q.field) ? { background: 'rgba(34,197,94,0.15)', borderColor: COLOR, color: COLOR } : {}}
                  >Yes</button>
                  <button
                    onClick={() => toggle(q.field, false)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-all border"
                    style={!getFieldVal(q.field) ? { background: 'rgba(34,197,94,0.15)', borderColor: COLOR, color: COLOR } : {}}
                  >No</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Savings Summary */}
      {t3_annual_gap > 0 && (
        <div ref={savingsSummaryRef}>
          <div className="rounded-xl border bg-card p-6 space-y-3" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: COLOR }}>Estimated Tax Savings Breakdown</p>
            {t3_strategy_breakdown.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <p className="text-sm select-none" style={{ filter: 'blur(4px)', userSelect: 'none', color: 'hsl(var(--foreground))' }}>
                  {s.name}
                </p>
                <p className="text-sm font-semibold shrink-0 ml-4" style={{ color: COLOR }}>
                  +${s.amount.toLocaleString()}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2" style={{ borderColor: COLOR }}>
              <p className="text-sm font-bold">Total Minimum Estimated Annual Savings</p>
              <p className="text-xl font-display font-bold" style={{ color: COLOR }}>${t3_annual_gap.toLocaleString()}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
            <p className="text-sm font-semibold">The Compounding Cost of Inaction</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Reinvestment Rate:</span>
              {[4, 6, 8, 10, 12].map(r => (
                <button
                  key={r}
                  onClick={() => setReinvestRate(r)}
                  className="px-3 py-1.5 rounded-lg text-sm transition-all border"
                  style={reinvestRate === r ? { background: COLOR, color: '#000', borderColor: COLOR } : { borderColor: 'transparent' }}
                >{r}%</button>
              ))}
            </div>
            <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-xs text-muted-foreground mb-1">10-Year Cost of Inaction at {reinvestRate}%</p>
              <p className="text-4xl font-display font-bold text-destructive">
                ${(compoundCost / 1000).toFixed(0)}K
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex justify-between pt-2">
        {mode === 'member' ? (
          <>
            <Link to="/assessments/recast-ebitda"><Button variant="outline">← Back</Button></Link>
            <Button onClick={handleNext} style={{ background: COLOR, color: '#000' }} className="font-semibold px-6">
              Next: Operations Gap →
            </Button>
          </>
        ) : (
          <div className="w-full space-y-2">
            {validationError && (
              <p className="text-center text-sm" style={{ color: '#D4A853' }}>⚑ {validationError}</p>
            )}
            <Button onClick={handleNext} className="w-full h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90">
              Continue →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}