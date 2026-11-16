import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useJourneyFocus } from '@/hooks/useJourneyFocus';
import GalileoBadge from '@/components/galileo/GalileoBadge';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAssessment } from '@/lib/AssessmentContext';
import { calcRecastEBITDA } from '@/lib/assessmentCalculations';
import ExplainWithGalileo from '@/components/galileo/explain/ExplainWithGalileo';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import GalileoCoach from '@/components/experience/GalileoCoach';
import { COACH } from '@/lib/galileoCoachScript';
import useAssessmentPrefill from '@/hooks/useAssessmentPrefill';
import { useBusinessContext } from '@/lib/BusinessContext';

const COLOR = '#D4A853';

// D&A and Interest are silently auto-filled in journey mode — never asked
const ADDBACK_STEPS_ALL = [
  { key: 'owner_comp',       label: 'Owner compensation normalization',    desc: 'Diff between your salary and market-rate replacement',     coachKey: 'recast_owner_comp' },
  { key: 'personal_expenses',label: 'Personal expenses run through business', desc: 'Meals, personal travel',                                coachKey: 'recast_personal_expenses' },
  { key: 'vehicle',          label: 'Owner vehicle & auto expenses',       desc: 'Personal vehicles expensed to business annually',          coachKey: 'recast_vehicle' },
  { key: 'family_payroll',   label: 'Family member payroll adjustment',    desc: 'Above-market compensation to related parties',             coachKey: 'recast_family_payroll' },
  { key: 'nonrecurring',     label: 'One-time non-recurring expenses',     desc: 'Legal settlements, unusual losses',                        coachKey: 'recast_nonrecurring' },
  { key: 'rent_norm',        label: 'Rent normalization',                  desc: 'Owner-occupied property at non-market rates',              coachKey: 'recast_rent_norm' },
  { key: 'da',               label: 'D&A add-back',                       desc: 'Non-cash depreciation & amortization',                     coachKey: 'recast_da',        autoOnly: true },
  { key: 'interest',         label: 'Interest expense add-back',           desc: 'Financing costs not reflective of future ops',             coachKey: 'recast_interest',  autoOnly: true },
];

// Steps shown to user in journey mode (D&A and interest are auto-filled)
function getVisibleSteps(isJourney) {
  return isJourney
    ? ADDBACK_STEPS_ALL.filter(s => !s.autoOnly)
    : ADDBACK_STEPS_ALL;
}

const TOTAL_STEPS_MEMBER = 10; // 1 initial + 8 addbacks + 1 results

/**
 * RecastEbitdaAssessmentCore
 *
 * mode="member"  — full production save + navigate to /assessments/tax-gap
 * mode="journey" — Galileo-coached: D&A & Interest auto-filled from documents,
 *                  calls onComplete(answers, results), no DB write, no navigate
 */
export default function RecastEbitdaAssessmentCore({ mode = 'member', onComplete }) {
  const { state, updateState, saveAssessmentToDB } = useAssessment();
  const navigate = useNavigate();
  const isJourney = mode === 'journey';
  const { focusStep } = useJourneyFocus(mode);
  const { context: bizCtx } = useBusinessContext();
  const [step, setStep] = useState(1);
  const wizardCardRef = useRef(null);

  // Journey: track auto-filled items for display
  const [autoFilled, setAutoFilled] = useState({}); // { da: '$12,400 from tax return', interest: '$8,200 from P&L' }
  const autoFillAttempted = useRef(false);

  // Prefill suggestions
  const { suggestions } = useAssessmentPrefill({ assessmentKey: 'recast_ebitda', mode });

  const visibleSteps = getVisibleSteps(isJourney);
  // Wizard: step 1 = initial EBITDA, steps 2..N = addbacks, step N+1 = results
  const totalSteps = visibleSteps.length + 2;
  const effectiveMultiple = state.v2_mult || 4.0;

  // Auto-populate base EBITDA
  useEffect(() => {
    if (state.rc_ebitda > 0) return;
    if (state.v2_ebitda > 0) { updateState({ rc_ebitda: state.v2_ebitda }); return; }
    base44.functions.invoke('getMetricAutoPopulate', { active_business_id: bizCtx.active_business_id }).then(res => {
      const d = res.data;
      if (d?.ebitda && d.ebitda > 0) updateState({ rc_ebitda: d.ebitda });
      else if (d?.net_profit && d.net_profit > 0) updateState({ rc_ebitda: d.net_profit });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Journey: silently prefill D&A and Interest from extracted documents
  useEffect(() => {
    if (!isJourney || autoFillAttempted.current || !Object.keys(suggestions).length) return;
    autoFillAttempted.current = true;

    const updates = {};
    const discovered = {};
    const currentAddbacks = state.rc_addbacks || {};

    // D&A
    const daVal = suggestions['rc_addbacks.da']?.value;
    if (daVal > 0 && !currentAddbacks.da) {
      updates.da = daVal;
      discovered.da = `${suggestions['rc_addbacks.da'].source_label} — $${daVal.toLocaleString()} added automatically`;
    }

    // Interest
    const intVal = suggestions['rc_addbacks.interest']?.value;
    if (intVal > 0 && !currentAddbacks.interest) {
      updates.interest = intVal;
      discovered.interest = `${suggestions['rc_addbacks.interest'].source_label} — $${intVal.toLocaleString()} added automatically`;
    }

    if (Object.keys(updates).length) {
      updateState({ rc_addbacks: { ...currentAddbacks, ...updates } });
      setAutoFilled(discovered);
    }
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { rc_ebitda, rc_addbacks } = state;
  const { recast_ebitda, total_addbacks, recast_value_impact } = calcRecastEBITDA({
    rc_ebitda, rc_addbacks, v2_mult: effectiveMultiple,
  });

  const progress = Math.round(((step - 1) / (totalSteps - 1)) * 100);
  const currentStepIndex = step - 2; // 0-indexed into visibleSteps
  const currentStepData = currentStepIndex >= 0 && currentStepIndex < visibleSteps.length
    ? visibleSteps[currentStepIndex]
    : null;

  const setAddback = (key, val) => {
    updateState({ rc_addbacks: { ...rc_addbacks, [key]: Number(val) || 0 } });
  };

  const goToStep = (nextStep) => {
    setStep(nextStep);
    focusStep(wizardCardRef);
  };

  const handleFinish = async () => {
    const answers = { rc_ebitda, rc_addbacks };
    const results = calcRecastEBITDA({ rc_ebitda, rc_addbacks, v2_mult: effectiveMultiple });
    if (mode === 'member') {
      recordAssessmentCompletion('recast_ebitda', answers, results, SOURCE_TYPES.MEMBER_ANSWER);
      await saveAssessmentToDB('recast_ebitda', answers, results);
      navigate('/assessments/tax-gap');
    } else {
      onComplete?.(answers, results);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(212,168,83,0.15)', color: COLOR, border: `1.5px solid rgba(212,168,83,0.4)` }}>
          03
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Recast EBITDA Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">Identify hidden add-backs that increase your true enterprise value.</p>
        </div>
      </div>

      {/* Journey intro coach message — shown before wizard starts */}
      {isJourney && step === 1 && (
        <GalileoCoach message={COACH.recast_intro} fieldKey="recast_intro" autoFadeDuration={7000} />
      )}

      {/* Auto-fill discoveries (journey only) — animated "Added by Galileo" */}
      {isJourney && Object.keys(autoFilled).length > 0 && (
        <div className="space-y-2">
          {Object.entries(autoFilled).map(([key, note], i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: i * 0.15 }}
              className="flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
              style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.2)' }}
            >
              <Sparkles className="w-4 h-4 text-[#D4A853]/60 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[#D4A853]/70 text-[10px] font-semibold uppercase tracking-wider mb-0.5">✓ Added by Galileo</p>
                <p className="text-white/60 text-xs leading-relaxed">{note}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Wizard Card */}
      <div ref={wizardCardRef} className="rounded-xl border bg-card overflow-hidden" style={{ borderColor: 'rgba(212,168,83,0.3)' }}>
        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: COLOR }} />
        </div>

        <div className="p-6">
          {/* Step 1: Initial EBITDA */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: COLOR }}>
                  Initial{' '}
                  <ExplainWithGalileo term="ebitda" surface="recast_ebitda">
                    EBITDA
                  </ExplainWithGalileo>
                </p>
                <p className="text-xs text-muted-foreground">Step 1 of {totalSteps}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <label className="text-xs text-muted-foreground">Reported Annual EBITDA</label>
                    <GalileoBadge source={state.v2_ebitda > 0 ? 'Pre-filled from Value Gap EBITDA' : null} />
                  </div>
                  <div className="flex items-center gap-1 border border-border rounded-md px-3 py-2 bg-secondary">
                    <span className="text-muted-foreground">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 350,000"
                      value={rc_ebitda || ''}
                      onFocus={(e) => { if (e.target.value === '0') e.target.select(); }}
                      onChange={(e) => updateState({ rc_ebitda: Number(e.target.value.replace(/[^0-9]/g, '')) })}
                      className="bg-transparent flex-1 outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <label className="text-xs text-muted-foreground">Annual Revenue</label>
                    <GalileoBadge source={state.p1_rev > 0 ? 'Pre-filled from Profit Gap assessment' : null} />
                  </div>
                  <div className="flex items-center gap-1 border border-border rounded-md px-3 py-2 bg-secondary">
                    <span className="text-muted-foreground">$</span>
                    <input type="text" placeholder="e.g. 2,000,000"
                      value={state.p1_rev ? state.p1_rev.toLocaleString() : ''}
                      onChange={(e) => updateState({ p1_rev: Number(e.target.value.replace(/[^0-9]/g, '')) })}
                      className="bg-transparent flex-1 outline-none text-sm" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <Button onClick={() => goToStep(2)} style={{ background: COLOR, color: '#000' }} className="gap-2 font-semibold">
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Steps 2..N: Add-backs */}
          {step >= 2 && step < totalSteps && currentStepData && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: COLOR }}>EBITDA Normalization</p>
                <p className="text-xs text-muted-foreground">Step {step} of {totalSteps}</p>
              </div>

              {/* Galileo coach message for this addback step (journey only) */}
              {isJourney && currentStepData.coachKey && (
                <GalileoCoach
                  message={COACH[currentStepData.coachKey]}
                  fieldKey={currentStepData.coachKey}
                  autoFadeDuration={6000}
                />
              )}

              <div className="text-center py-6 space-y-5">
                <div>
                  <h2 className="text-2xl font-semibold">{currentStepData.label}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{currentStepData.desc}</p>
                </div>
                <div className="flex items-center gap-1 rounded-md px-4 py-3 bg-secondary max-w-xs mx-auto"
                  style={{ border: `1px solid ${COLOR}` }}>
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={rc_addbacks[currentStepData.key] != null ? rc_addbacks[currentStepData.key] : 0}
                    onFocus={(e) => { if (e.target.value === '0') e.target.select(); }}
                    onChange={(e) => setAddback(currentStepData.key, e.target.value.replace(/[^0-9]/g, ''))}
                    className="bg-transparent flex-1 outline-none text-center text-lg"
                  />
                </div>
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => goToStep(step - 1)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button onClick={() => goToStep(step + 1)}
                  style={{ background: COLOR, color: '#000' }} className="gap-2 font-semibold">
                  {step === totalSteps - 1 ? 'See Results' : 'Next'} <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Final Step: Results */}
          {step === totalSteps && (
            <div className="space-y-6">
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: COLOR }}>Recast Results</p>

              {/* Journey results coaching */}
              {isJourney && (
                <GalileoCoach
                  message={COACH.recast_results(
                    rc_ebitda ? `$${rc_ebitda.toLocaleString()}` : '—',
                    `$${recast_ebitda.toLocaleString()}`,
                    `$${total_addbacks.toLocaleString()}`,
                    effectiveMultiple
                  )}
                  fieldKey="recast_results"
                  autoFadeDuration={8000}
                />
              )}

              <div className="rounded-xl p-8" style={{ background: 'rgba(212,168,83,0.06)', border: `1px solid rgba(212,168,83,0.2)` }}>
                <div className="flex justify-center mb-8">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ border: `2px solid ${COLOR}` }}>
                    <CheckCircle2 className="w-7 h-7" style={{ color: COLOR }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">Reported EBITDA</p>
                    <div className="w-8 h-0.5 bg-muted-foreground mx-auto mb-1" />
                    <p className="text-3xl font-display font-bold">{rc_ebitda ? `$${rc_ebitda.toLocaleString()}` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: COLOR }}>Normalized EBITDA</p>
                    <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>${recast_ebitda.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">
                      <ExplainWithGalileo term="add_backs" surface="recast_ebitda">Total Add-Backs</ExplainWithGalileo>
                    </p>
                    <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>${total_addbacks.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: COLOR }}>Valuation Impact at {effectiveMultiple}x</p>
                    <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>${recast_value_impact.toLocaleString()}</p>
                  </div>
                </div>

                {/* Show auto-filled items in results summary */}
                {isJourney && Object.keys(autoFilled).length > 0 && (
                  <div className="mt-6 pt-6 border-t space-y-2" style={{ borderColor: 'rgba(212,168,83,0.2)' }}>
                    <p className="text-[10px] text-[#D4A853]/50 uppercase tracking-widest text-center mb-3">Galileo Auto-Identified</p>
                    {Object.entries(autoFilled).map(([key, note]) => (
                      <div key={key} className="flex items-start gap-2 text-xs text-white/50">
                        <span className="text-[#D4A853]/40 mt-0.5">✦</span>
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="outline" onClick={() => goToStep(totalSteps - 1)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button onClick={handleFinish} style={{ background: COLOR, color: '#000' }} className="font-semibold">
                  {mode === 'member' ? 'Next: Tax Gap Engine →' : 'Continue →'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Back nav — member only */}
      {mode === 'member' && (
        <div className="flex justify-between">
          <Link to="/assessments/value-gap"><Button variant="outline">← Back to Value Gap</Button></Link>
        </div>
      )}
    </div>
  );
}