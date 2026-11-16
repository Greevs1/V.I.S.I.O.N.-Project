/**
 * ProfitGapAssessmentCore
 *
 * mode="member"  — standard logged-in page: saves to DB, navigates to next route
 * mode="journey" — Galileo-coached experience:
 *   1. Industry field + Lookup (nothing else shown)
 *   2. Galileo coaching message slides in
 *   3. Revenue confirmation/entry (with Galileo confirm if prefilled)
 *   4. Margin entry
 *   5. Results revealed
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import SliderInput from '@/components/ui/SliderInput';
import { AlertTriangle, Loader2, Check, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAssessment } from '@/lib/AssessmentContext';
import { saveAnonymousAssessment } from '@/lib/anonymousSession';
import { validateAssessmentResults, logValidation } from '@/lib/assessmentValidation';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import GalileoCoach from '@/components/experience/GalileoCoach';
import GalileoHelpBubble from '@/components/experience/GalileoHelpBubble';
import useAssessmentPrefill from '@/hooks/useAssessmentPrefill';
import { COACH } from '@/lib/galileoCoachScript';
import { useJourneyFocus } from '@/hooks/useJourneyFocus';

const fmt = (n) => {
  if (n >= 1000000) return `$${parseFloat((n / 1000000).toFixed(2))}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
};

// Journey reveal phases: 'industry' → 'revenue' → 'margin' → 'results'
const PHASES = ['industry', 'revenue', 'margin', 'results'];

export default function ProfitGapAssessmentCore({ mode = 'member', onComplete }) {
  const { state, updateState, saveAssessmentToDB } = useAssessment();
  const navigate = useNavigate();
  const isJourney = mode === 'journey';
  const { focusStep } = useJourneyFocus(mode);

  const [industryInput, setIndustryInput] = useState(state.industry || '');
  const [benchmark, setBenchmark] = useState(state._profit_benchmark || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Journey progressive reveal
  const [phase, setPhase] = useState('industry');
  const [revenueConfirmed, setRevenueConfirmed] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState(false);
  const revenueRef = useRef(null);
  const marginRef = useRef(null);

  // Prefill
  const { suggestions } = useAssessmentPrefill({ assessmentKey: 'profit_gap', mode });
  const [userEdited, setUserEdited] = useState({});
  const prefillApplied = useRef(false);

  useEffect(() => {
    if (!isJourney || !Object.keys(suggestions).length || prefillApplied.current) return;
    prefillApplied.current = true;
    if (!userEdited.p1_rev && suggestions.p1_rev && state.p1_rev <= 0) {
      updateState({ p1_rev: suggestions.p1_rev.value });
    }
    if (!userEdited.p1_mymargin && suggestions.p1_mymargin && state.p1_mymargin <= 0) {
      updateState({ p1_mymargin: suggestions.p1_mymargin.value });
    }
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  const markEdited = (field) => setUserEdited(prev => ({ ...prev, [field]: true }));

  const rev = state.p1_rev;
  const myMargin = state.p1_mymargin;
  const avg = benchmark?.average_net_profit_margin ?? 0;
  const best = benchmark?.best_in_class_net_profit_margin ?? benchmark?.top_quartile_net_profit_margin ?? 0;
  const gapToAvg = Math.max(0, rev * ((avg - myMargin) / 100));
  const gapToBest = Math.max(0, rev * ((best - myMargin) / 100));
  // No benchmark → no score. Previously this fell back to 0, which displayed a
  // fabricated zero score. Unknown must read as unknown.
  const profitScore = best > 0 ? Math.min(100, Math.round((myMargin / best) * 100)) : null;

  const hasPrefillRevenue = suggestions.p1_rev && !userEdited.p1_rev && rev > 0;
  const canContinueJourney = isJourney && (benchmark || (rev > 0 && myMargin >= 0));

  const lookupBenchmark = async () => {
    if (!industryInput.trim()) return;
    setLoading(true);
    setError('');
    setBenchmark(null);
    try {
      const res = await base44.functions.invoke('profitBenchmark', { industry_input: industryInput.trim() });
      const data = res.data?.response ?? res.data;
      if (data?.error === 'insufficient_data') {
        setError(data.message);
      } else {
        setBenchmark(data);
        updateState({
          industry: data.normalized_industry || industryInput.trim(),
          p1_avg: data.average_net_profit_margin,
          p1_top: data.best_in_class_net_profit_margin || data.top_quartile_net_profit_margin,
          _profit_benchmark: data,
          _value_benchmark: null,
        });
        // Journey: advance to revenue phase after benchmark loads
        if (isJourney) { setPhase('revenue'); focusStep(revenueRef); }
      }
    } catch {
      setError("I couldn't retrieve that benchmark automatically. You can enter your margin estimate below.");
      if (isJourney) { setPhase('revenue'); focusStep(revenueRef); }
    }
    setLoading(false);
  };

  const handleNext = async () => {
    const answers = { industry_input: industryInput, p1_rev: rev, p1_mymargin: myMargin, p1_avg: avg, p1_top: best, benchmark };
    const results = { profit_gap: gapToBest, profit_gap_to_avg: gapToAvg, profit_score: profitScore, gapToAvg, gapToBest, profitScore, avg, best };

    if (isJourney) {
      onComplete?.(answers, results);
      return;
    }

    if (benchmark) {
      const validation = validateAssessmentResults('profit_gap', results, state);
      logValidation('profit_gap', validation);
      if (!validation.valid) console.error('[PROFIT_GAP_SAVE_BLOCKED]', validation.missing);
      recordAssessmentCompletion('profit_gap', answers, results, SOURCE_TYPES.MEMBER_ANSWER);
      await saveAssessmentToDB('profit_gap', answers, results);
      saveAnonymousAssessment('profit_gap', answers, results);
    }
    navigate('/assessments/value-gap');
  };

  // ── MEMBER MODE (unchanged layout) ────────────────────────────────────────
  if (!isJourney) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
            style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1.5px solid rgba(168,85,247,0.4)' }}>
            01
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Profit Gap</h1>
            <p className="text-sm text-muted-foreground mt-1">How does your margin compare to your industry's best operators?</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-4" style={{ borderColor: 'rgba(168,85,247,0.3)' }}>
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mb-1" style={{ color: '#a855f7' }}>Industry Benchmarking</p>
          <div className="flex gap-3">
            <input value={industryInput} onChange={(e) => setIndustryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && lookupBenchmark()}
              placeholder="e.g. residential HVAC, dental practice, SaaS"
              className="flex-1 h-10 bg-secondary border border-border rounded-lg px-4 text-sm outline-none focus:border-purple-500 transition-colors" />
            <Button onClick={lookupBenchmark} disabled={loading || !industryInput.trim()}
              className="h-10 px-5 shrink-0 font-semibold" style={{ background: '#a855f7', color: '#fff' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Look up'}
            </Button>
          </div>
          {error && <div className="flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
          {benchmark && (
            <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">{benchmark.normalized_industry}</p>
                <div className="flex gap-5">
                  <div className="text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg</p>
                    <p className="text-lg font-display font-bold" style={{ color: '#a855f7' }}>{avg}%</p></div>
                  <div className="text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best-in-Class</p>
                    <p className="text-lg font-display font-bold" style={{ color: '#a855f7' }}>{best}%</p></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {benchmark && (
          <>
            <div className="rounded-xl border bg-card p-6 space-y-7">
              <MemberSlider label="Annual Revenue" value={rev} helpKey={null}
                onValue={(v) => { markEdited('p1_rev'); updateState({ p1_rev: v }); }}
                min={0} max={25000000} step={50000} color="#a855f7" format={fmt}
                suffix={fmt(rev)} />
              <MemberSlider label="Your Current Net Profit Margin" value={myMargin} helpKey={null}
                onValue={(v) => { markEdited('p1_mymargin'); updateState({ p1_mymargin: v }); }}
                min={0} max={Math.max(best + 5, 40)} step={0.5} color="#a855f7"
                suffix={`${myMargin}%`} isPercent />
            </div>
            <ResultsGrid gapToAvg={gapToAvg} gapToBest={gapToBest} profitScore={profitScore} avg={avg} best={best} myMargin={myMargin} />
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleNext} className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6">
            Next: Valuation Engine →
          </Button>
        </div>
      </div>
    );
  }

  // ── JOURNEY MODE — Progressive Reveal ─────────────────────────────────────
  return (
    <div className="w-full space-y-6 pb-8">

      {/* ── Phase: Industry ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {PHASES.indexOf(phase) >= PHASES.indexOf('industry') && (
          <motion.div key="industry-phase"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-4">

            <GalileoCoach
              message={COACH.profit_gap_industry}
              fieldKey="profit_gap_industry"
              autoFadeDuration={6000}
            />

            <div className="rounded-xl border bg-card p-5 space-y-4" style={{ borderColor: 'rgba(168,85,247,0.3)' }}>
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#a855f7' }}>Industry</p>
              <div className="flex gap-3">
                <input
                  value={industryInput}
                  onChange={(e) => setIndustryInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && lookupBenchmark()}
                  placeholder="e.g. residential HVAC, dental practice, SaaS, construction"
                  className="flex-1 h-11 bg-secondary border border-border rounded-lg px-4 text-sm outline-none focus:border-purple-500/60 transition-colors"
                />
                <Button onClick={lookupBenchmark} disabled={loading || !industryInput.trim()}
                  className="h-11 px-6 shrink-0 font-semibold" style={{ background: '#a855f7', color: '#fff' }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Look up'}
                </Button>
              </div>

              {error && <div className="flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

              {benchmark && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-lg px-4 py-3" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{benchmark.normalized_industry}</p>
                    <div className="flex gap-5">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg</p>
                        <p className="text-lg font-display font-bold" style={{ color: '#a855f7' }}>{avg}%</p>
                      </div>
                      {benchmark.top_quartile_net_profit_margin && (
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Quartile</p>
                          <p className="text-lg font-display font-bold" style={{ color: '#a855f7' }}>{benchmark.top_quartile_net_profit_margin}%</p>
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best-in-Class</p>
                        <p className="text-lg font-display font-bold" style={{ color: '#a855f7' }}>{best}%</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phase: Revenue ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {PHASES.indexOf(phase) >= PHASES.indexOf('revenue') && (
          <motion.div key="revenue-phase" ref={revenueRef}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-4">

            {/* Confirmation mode if we have prefill */}
            {hasPrefillRevenue && !editingRevenue ? (
              <>
                <GalileoCoach
                  message={COACH.profit_gap_revenue_confirm(fmt(rev))}
                  fieldKey="profit_gap_revenue_confirm"
                  autoFadeDuration={7000}
                />
                <div className="rounded-xl border bg-card p-5 space-y-4" style={{ borderColor: 'rgba(168,85,247,0.3)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mb-1" style={{ color: '#a855f7' }}>Annual Revenue</p>
                      <p className="text-3xl font-display font-bold">{fmt(rev)}</p>
                      <p className="text-[10px] text-[#D4A853]/50 mt-1">{suggestions.p1_rev?.source_label}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { setRevenueConfirmed(true); setPhase('margin'); focusStep(marginRef); }}
                       className="gap-1.5" style={{ background: '#a855f7', color: '#fff' }}>
                        <Check className="w-3.5 h-3.5" /> Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingRevenue(true)} className="gap-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <GalileoCoach
                  message={COACH.profit_gap_revenue}
                  fieldKey="profit_gap_revenue"
                  autoFadeDuration={6000}
                />
                <div className="rounded-xl border bg-card p-5 space-y-4" style={{ borderColor: 'rgba(168,85,247,0.3)' }}>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#a855f7' }}>Annual Revenue</p>
                    <GalileoHelpBubble fieldKey="p1_rev" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-2 w-full">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input type="number" value={rev || ''}
                        onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                        onChange={(e) => { markEdited('p1_rev'); updateState({ p1_rev: Number(e.target.value) || 0 }); }}
                        className="bg-transparent flex-1 outline-none text-sm" placeholder="e.g. 2000000" />
                    </div>
                    <SliderInput trackOnly
                      value={Math.max(rev, 0)}
                      onChange={(v) => { markEdited('p1_rev'); updateState({ p1_rev: v }); }}
                      min={0} max={25000000} step={50000}
                      color="#a855f7" />
                    <div className="flex justify-between">
                      <span className="text-[10px] text-muted-foreground">$0</span>
                      <span className="text-xs font-semibold" style={{ color: '#a855f7' }}>{fmt(rev)}</span>
                      <span className="text-[10px] text-muted-foreground">$25M</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => { setPhase('margin'); focusStep(marginRef); }} disabled={rev <= 0}
                      style={{ background: '#a855f7', color: '#fff' }} className="font-semibold">
                      Continue →
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phase: Margin ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {PHASES.indexOf(phase) >= PHASES.indexOf('margin') && (
          <motion.div key="margin-phase" ref={marginRef}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-4">

            <GalileoCoach
              message={COACH.profit_gap_margin}
              fieldKey="profit_gap_margin"
              autoFadeDuration={6000}
            />

            <div className="rounded-xl border bg-card p-5 space-y-4" style={{ borderColor: 'rgba(168,85,247,0.3)' }}>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: '#a855f7' }}>Net Profit Margin</p>
                <GalileoHelpBubble fieldKey="p1_mymargin" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-2 w-40">
                  <input type="number" value={myMargin || ''}
                    onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                    onChange={(e) => { markEdited('p1_mymargin'); updateState({ p1_mymargin: Number(e.target.value) || 0 }); }}
                    className="bg-transparent flex-1 outline-none text-sm text-right" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <SliderInput trackOnly
                  value={myMargin}
                  onChange={(v) => { markEdited('p1_mymargin'); updateState({ p1_mymargin: v }); }}
                  min={0} max={Math.max(best + 5, 40)} step={0.5}
                  color="#a855f7" />
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground">0%</span>
                  <span className="text-xs font-semibold" style={{ color: '#a855f7' }}>{myMargin}%</span>
                  <span className="text-[10px] text-muted-foreground">{best || 30}% best-in-class</span>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm"
                  onClick={() => {
                    if (isJourney) {
                      // Journey: skip results reveal, fire onComplete immediately
                      const answers = { industry_input: industryInput, p1_rev: rev, p1_mymargin: myMargin, p1_avg: avg, p1_top: best, benchmark };
                      const results = { profit_gap: gapToBest, profit_gap_to_avg: gapToAvg, profit_score: profitScore, gapToAvg, gapToBest, profitScore, avg, best };
                      onComplete?.(answers, results);
                    } else {
                      setPhase('results');
                    }
                  }}
                  disabled={myMargin < 0}
                  style={{ background: '#a855f7', color: '#fff' }} className="font-semibold">
                  {isJourney ? 'Continue →' : 'See My Gap →'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phase: Results ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'results' && (
          <motion.div key="results-phase"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-4">

            <GalileoCoach
              message={COACH.profit_gap_results(fmt(gapToBest), benchmark?.normalized_industry || state.industry || 'your industry')}
              fieldKey="profit_gap_results"
              autoFadeDuration={8000}
            />

            <ResultsGrid gapToAvg={gapToAvg} gapToBest={gapToBest} profitScore={profitScore} avg={avg} best={best} myMargin={myMargin} />

            <Button onClick={handleNext}
              className="w-full h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90">
              Continue →
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ResultsGrid({ gapToAvg, gapToBest, profitScore, avg, best, myMargin }) {
  const fmt = (n) => {
    if (n >= 1000000) return `$${parseFloat((n / 1000000).toFixed(2))}M`;
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-xl border bg-card p-5">
        <p className="text-[10px] uppercase tracking-wider mb-2 text-muted-foreground">Gap to Industry Average</p>
        {myMargin >= avg
          ? <p className="text-sm font-medium text-emerald-400">Above avg ({avg}%) ✓</p>
          : <><p className="text-3xl font-display font-bold">{fmt(gapToAvg)}</p>
            <p className="text-xs text-muted-foreground mt-1">Your {myMargin}% vs avg {avg}% — {(avg - myMargin).toFixed(1)}pts gap</p></>}
      </div>
      <div className="rounded-xl border bg-card p-5" style={{ borderColor: 'rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.06)' }}>
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#a855f7' }}>Gap to Best-in-Class</p>
        {myMargin >= best
          ? <p className="text-sm font-medium text-emerald-400">Best-in-class ({best}%) ✓</p>
          : <><p className="text-3xl font-display font-bold" style={{ color: '#a855f7' }}>{fmt(gapToBest)}</p>
            <p className="text-xs text-muted-foreground mt-1">Your {myMargin}% vs best {best}% — {(best - myMargin).toFixed(1)}pts gap</p></>}
      </div>
      <div className="rounded-xl border bg-card p-5">
        <p className="text-[10px] uppercase tracking-wider mb-2 text-muted-foreground">Potential Additional Annual Profit</p>
        <p className="text-3xl font-display font-bold">{fmt(gapToBest)}</p>
      </div>
      <div className="rounded-xl border bg-card p-5" style={{ borderColor: 'rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.06)' }}>
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#a855f7' }}>Profit Score</p>
        {profitScore != null ? (
          <p className="text-3xl font-display font-bold" style={{ color: '#a855f7' }}>
            {profitScore}<span className="text-sm text-muted-foreground font-normal">/100</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Not enough information to score this yet</p>
        )}
      </div>
    </div>
  );
}

// MemberSlider now delegates to the canonical reusable SliderInput (Phase 9, item 7).
function MemberSlider({ label, value, onValue, min, max, step, color, suffix, isPercent }) {
  return (
    <SliderInput
      label={label}
      value={value}
      onChange={onValue}
      min={min}
      max={max}
      step={step}
      color={color}
      format={isPercent ? (n) => `${n}%` : (n) => suffix}
      isPercent={isPercent}
    />
  );
}