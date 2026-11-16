import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import SliderInput from '@/components/ui/SliderInput';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useJourneyFocus } from '@/hooks/useJourneyFocus';
import GalileoBadge from '@/components/galileo/GalileoBadge';
import ExplainWithGalileo from '@/components/galileo/explain/ExplainWithGalileo';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAssessment } from '@/lib/AssessmentContext';
import { validateAssessmentResults, logValidation } from '@/lib/assessmentValidation';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import GalileoHelpBubble from '@/components/experience/GalileoHelpBubble';
import GalileoCoach from '@/components/experience/GalileoCoach';
import { COACH } from '@/lib/galileoCoachScript';
import { useBusinessContext } from '@/lib/BusinessContext';

const fmt = (n) => {
  if (n >= 1000000) return `$${parseFloat((n / 1000000).toFixed(2))}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
};

/**
 * ValueGapAssessmentCore
 *
 * mode="member"  — full production save + navigate to /assessments/recast-ebitda
 * mode="journey" — calls onComplete(answers, results), no DB write, no navigate
 */
export default function ValueGapAssessmentCore({ mode = 'member', onComplete, prefillSuggestions = {} }) {
  const { state, updateState, saveAssessmentToDB } = useAssessment();
  const navigate = useNavigate();
  const { focusStep } = useJourneyFocus(mode);
  const { context: bizCtx } = useBusinessContext();

  const profitBenchmark = state._profit_benchmark;
  const [benchmark, setBenchmark] = useState(state._value_benchmark || null);
  const ebitdaSectionRef = useRef(null);
  const cardsRef = useRef(null);
  const potentialSliderRef = useRef(null);
  const continueRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualIndustry, setManualIndustry] = useState(state.industry || '');
  const [ebitdaSource, setEbitdaSource] = useState(null);
  // The document behind the auto-populated figure, when there is one. The badge
  // only becomes a link when this is a real document (see GalileoBadge).
  const [ebitdaSourceDocument, setEbitdaSourceDocument] = useState(null);

  // Journey mode: focus EBITDA section on mount
  useEffect(() => {
    if (mode === 'journey') focusStep(ebitdaSectionRef, { delay: 150 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Journey mode: auto-load multiples using industry from profit gap benchmark
  const autoLoadAttempted = useRef(false);
  useEffect(() => {
    if (mode !== 'journey' || autoLoadAttempted.current) return;
    if (!profitBenchmark && !state.industry) return;
    autoLoadAttempted.current = true;
    loadMultiples();
  }, [profitBenchmark, state.industry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    base44.functions.invoke('getMetricAutoPopulate', { active_business_id: bizCtx.active_business_id }).then(res => {
      const d = res.data;
      if (d?.ebitda && d.ebitda > 0 && state.v2_ebitda <= 0) {
        updateState({ v2_ebitda: d.ebitda });
        setEbitdaSource(
          d.sources?.ebitda === 'extracted_fields' ? 'Source: Uploaded documents'
          : d.sources?.ebitda === 'profile_financials' ? 'Source: Profile financials'
          : d.sources?.ebitda === 'prior_assessment' ? 'Source: Prior assessment'
          : 'Auto-populated from your data'
        );
        // Only a document-backed figure becomes clickable evidence.
        setEbitdaSourceDocument(
          d.sources?.ebitda === 'extracted_fields' ? (d.sources.ebitda_document || null) : null
        );
        return;
      }
      if (state.p1_rev > 0 && state.p1_mymargin > 0 && state.v2_ebitda <= 0) {
        const derived = Math.round(state.p1_rev * state.p1_mymargin / 100);
        updateState({ v2_ebitda: derived });
        setEbitdaSource('Source: Revenue × Net Margin (from Step 1)');
      }
    }).catch(() => {
      if (state.v2_ebitda <= 0 && state.p1_rev > 0 && state.p1_mymargin > 0) {
        const derived = Math.round(state.p1_rev * state.p1_mymargin / 100);
        updateState({ v2_ebitda: derived });
        setEbitdaSource('Source: Revenue × Net Margin (from Step 1)');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const derivedEbitda = state.v2_ebitda <= 0 && state.p1_rev > 0 && state.p1_mymargin > 0
    ? Math.round(state.p1_rev * state.p1_mymargin / 100)
    : 0;

  useEffect(() => {
    if (derivedEbitda > 0 && state.v2_ebitda <= 0) {
      updateState({ v2_ebitda: derivedEbitda });
      if (!ebitdaSource) setEbitdaSource('Source: Revenue × Net Margin (from Step 1)');
    }
  }, [derivedEbitda]); // eslint-disable-line react-hooks/exhaustive-deps

  const ebitda = state.v2_ebitda;
  const avgMult = benchmark?.average_ebitda_multiple ?? state.v2_mult ?? 4;
  const topMult = benchmark?.top_quartile_ebitda_multiple ?? null;
  const bestMult = benchmark?.best_in_class_ebitda_multiple ?? benchmark?.top_quartile_ebitda_multiple ?? state.v2_mult_top ?? 9.5;
  const [selectedMult, setSelectedMult] = useState(() => state._selected_mult || 0);
  const [potentialEbitda, setPotentialEbitda] = useState(0);

  useEffect(() => {
    if (benchmark) {
      setSelectedMult(prev => prev <= 0 ? avgMult : Math.min(Math.max(prev, avgMult), bestMult));
    }
  }, [benchmark, avgMult, bestMult]);

  // Journey: focus continue button once user has set a potential EBITDA
  const potentialSet = useRef(false);
  useEffect(() => {
    if (mode !== 'journey' || potentialEbitda <= 0 || potentialSet.current) return;
    potentialSet.current = true;
    focusStep(continueRef);
  }, [potentialEbitda]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentValue = ebitda * avgMult;
  const potentialValue = potentialEbitda * selectedMult;
  const valueGap = Math.max(0, potentialValue - currentValue);

  const loadMultiples = async () => {
    const industryToUse = profitBenchmark
      ? { industry_input: profitBenchmark.industry_input || state.industry, normalized_industry: profitBenchmark.normalized_industry, naics_code: profitBenchmark.naics_code }
      : { industry_input: manualIndustry.trim() };
    if (!industryToUse.industry_input) return;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('valueBenchmark', industryToUse);
      const data = res.data?.response ?? res.data;
      if (data?.error === 'insufficient_data') {
        setError(data.message);
      } else {
        setBenchmark(data);
        updateState({
          v2_mult: data.average_ebitda_multiple,
          v2_mult_top: data.best_in_class_ebitda_multiple || data.top_quartile_ebitda_multiple,
          _value_benchmark: data,
          ...(manualIndustry && !profitBenchmark ? { industry: manualIndustry.trim() } : {}),
        });
        setSelectedMult(data.average_ebitda_multiple);
        // Focus benchmark cards, then potential slider, then continue button
        focusStep(cardsRef);
      }
    } catch {
      setError("I couldn't retrieve that benchmark automatically. I can keep going with your estimate — adjust the EBITDA and multiple manually below.");
    }
    setLoading(false);
  };

  const handleNext = async () => {
    if (benchmark) {
      const answers = { v2_ebitda: ebitda, potentialEbitda, selectedMult, avgMult, bestMult, benchmark };
      const results = { current_value: currentValue, potential_value: potentialValue, value_gap: valueGap, currentValue, potentialValue, valueGap };

      const validation = validateAssessmentResults('value_gap', results, state);
      logValidation('value_gap', validation);

      if (!validation.valid) {
        console.error('[VALUE_GAP_SAVE_BLOCKED] Missing required fields:', validation.missing);
      }

      updateState({ _selected_mult: selectedMult });

      if (mode === 'member') {
        recordAssessmentCompletion('value_gap', answers, results, SOURCE_TYPES.MEMBER_ANSWER);
        await saveAssessmentToDB('value_gap', answers, results);
        navigate('/assessments/recast-ebitda');
      } else {
        onComplete?.(answers, results);
      }
    } else {
      // No benchmark loaded yet — in journey mode allow skipping with minimal data
      if (mode === 'journey') {
        onComplete?.(
          { v2_ebitda: ebitda, v2_mult: avgMult },
          { current_value: currentValue, potential_value: potentialValue, value_gap: valueGap, currentValue, potentialValue, valueGap }
        );
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(0,212,255,0.12)', color: '#00d4ff', border: '1.5px solid rgba(0,212,255,0.35)' }}>
          02
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Value Gap</h1>
          <p className="text-sm text-muted-foreground mt-1">What is your business actually worth — and what could it be?</p>
        </div>
      </div>

      {/* Galileo coach — EBITDA confirmation if we have a prefilled value */}
      {mode === 'journey' && (
        <GalileoCoach
          message={ebitda > 0 && ebitdaSource
            ? COACH.value_gap_ebitda_confirm(fmt(ebitda), ebitdaSource.replace('Source: ', ''))
            : COACH.value_gap_ebitda}
          fieldKey="value_gap_ebitda"
          autoFadeDuration={7000}
        />
      )}

      {/* EBITDA Multiple Benchmarking Card */}
      <div ref={ebitdaSectionRef} className="rounded-xl border bg-card p-6 space-y-4" style={{ borderColor: 'rgba(0,212,255,0.25)' }}>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mb-1" style={{ color: '#00d4ff' }}>
          EBITDA Multiple Benchmarking
        </p>

        <div className="flex gap-3 items-center">
          {profitBenchmark ? (
            <p className="flex-1 text-sm">
              Industry: <strong className="text-foreground">{profitBenchmark.normalized_industry}</strong>
            </p>
          ) : (
            <input
              value={manualIndustry}
              onChange={(e) => setManualIndustry(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && loadMultiples()}
              placeholder="Enter your industry (e.g. dental practice, HVAC)"
              className="flex-1 h-10 bg-secondary border border-border rounded-lg px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-cyan-400 transition-colors"
            />
          )}
          <Button
            onClick={loadMultiples}
            disabled={loading || (!profitBenchmark && !manualIndustry.trim())}
            className="h-10 px-5 shrink-0 font-semibold"
            style={{ background: '#00d4ff', color: '#000' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : benchmark ? 'Reload' : 'Load Multiples'}
          </Button>
        </div>

        {benchmark && (
          <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.18)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{benchmark.normalized_industry}</p>
              <div className="flex gap-5">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Multiple</p>
                  <p className="text-lg font-display font-bold" style={{ color: '#00d4ff' }}>{avgMult}x</p>
                </div>
                {topMult && (
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Quartile</p>
                    <p className="text-lg font-display font-bold" style={{ color: '#00d4ff' }}>{topMult}x</p>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best-in-Class</p>
                  <p className="text-lg font-display font-bold" style={{ color: '#00d4ff' }}>{bestMult}x</p>
                </div>
              </div>
            </div>
            {benchmark.private_company_adjustment_notes && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{benchmark.private_company_adjustment_notes}</p>
            )}
          </div>
        )}

        {benchmark?.confidence_level === 'low' && (
          <div className="flex items-center gap-2 text-xs text-yellow-400 px-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Benchmark confidence is low. Use this as a directional estimate only.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Cards — only after multiples loaded */}
      {benchmark && (
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Current Estimated Value */}
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Your Estimated Value</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-muted-foreground">
                      Estimated Annual{' '}
                      <ExplainWithGalileo term="ebitda" surface="value_gap">
                        EBITDA
                      </ExplainWithGalileo>
                    </p>
                    <GalileoBadge source={ebitdaSource} document={ebitdaSourceDocument} />
                    {mode === 'journey' && <GalileoHelpBubble fieldKey="v2_ebitda" />}
                  </div>
                  <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={ebitda}
                      onChange={(e) => updateState({ v2_ebitda: Number(e.target.value) })}
                      className="w-24 bg-transparent text-sm text-right outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Average Industry Multiple</p>
                <p className="text-sm font-semibold">{avgMult}x</p>
              </div>
              <div className="pt-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Estimated Value</p>
                <p className="text-4xl font-display font-bold">{fmt(currentValue)}</p>
              </div>
            </div>
          </div>

          {/* Potential Value */}
          <div ref={potentialSliderRef} className="rounded-xl border p-6 space-y-4"
            style={{ background: 'rgba(0,212,255,0.05)', borderColor: 'rgba(0,212,255,0.25)' }}>
            {mode === 'journey' && (
              <GalileoCoach message={COACH.value_gap_potential} fieldKey="value_gap_potential" autoFadeDuration={6000} />
            )}
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#00d4ff' }}>
              Your Potential Value
            </p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Target Annual EBITDA</p>
                <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={potentialEbitda}
                    onChange={(e) => setPotentialEbitda(Number(e.target.value) || 0)}
                    className="w-24 bg-transparent text-sm text-right outline-none"
                  />
                </div>
              </div>
              <SliderInput trackOnly
                value={potentialEbitda}
                onChange={setPotentialEbitda}
                min={0}
                max={10000000}
                step={10000}
                color="#00d4ff"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">$0</span>
                <span className="text-[10px] text-muted-foreground">$10M</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Buyer Quality Multiple</p>
                <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
                  <input
                    type="number"
                    value={selectedMult}
                    step={0.1}
                    onChange={(e) => setSelectedMult(Number(e.target.value) || 0)}
                    className="w-16 bg-transparent text-sm text-right outline-none"
                  />
                  <span className="text-xs text-muted-foreground">x</span>
                </div>
              </div>
              <SliderInput trackOnly
                value={selectedMult}
                onChange={setSelectedMult}
                min={0}
                max={bestMult}
                step={0.1}
                color="#00d4ff"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">0x</span>
                <span className="text-[10px] text-muted-foreground">{bestMult}x best-in-class</span>
              </div>
            </div>

            <div className="pt-3 border-t space-y-3" style={{ borderColor: 'rgba(0,212,255,0.2)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#00d4ff' }}>
                  Potential Enterprise Value
                </p>
                <p className="text-4xl font-display font-bold" style={{ color: '#00d4ff' }}>{fmt(potentialValue)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#00d4ff' }}>Value Gap</p>
                <p className="text-xl font-display font-bold">
                  +{fmt(valueGap)} <span className="text-sm font-normal text-muted-foreground">opportunity</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div ref={continueRef} className="flex justify-between pt-2">
        {mode === 'member' ? (
          <>
            <Link to="/assessments/profit-gap">
              <Button variant="outline">← Back</Button>
            </Link>
            <Button onClick={handleNext} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6">
              Next: Recast EBITDA →
            </Button>
          </>
        ) : (
          <Button
            onClick={handleNext}
            disabled={!benchmark}
            className="w-full h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90"
            onFocus={() => focusStep(continueRef)}
          >
            Continue →
          </Button>
        )}
      </div>
    </div>
  );
}