import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import SliderInput from '@/components/ui/SliderInput';
import { Link, useNavigate } from 'react-router-dom';
import GalileoBadge from '@/components/galileo/GalileoBadge';
import GalileoHelpBubble from '@/components/experience/GalileoHelpBubble';
import { base44 } from '@/api/base44Client';
import { useAssessment } from '@/lib/AssessmentContext';
import { calcOperationsScore } from '@/lib/assessmentCalculations';
import { validateAssessmentResults, logValidation } from '@/lib/assessmentValidation';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import { useJourneyFocus } from '@/hooks/useJourneyFocus';
import { useBusinessContext } from '@/lib/BusinessContext';

const COLOR = '#ef4444';

const QUESTIONS = [
  { label: 'Leadership Confidence', question: 'How clear and decisive are you as a leader?', min: 'Not confident', max: 'Fully confident' },
  { label: 'Financial Visibility', question: 'How confident are you in your numbers day-to-day?', min: 'Flying blind', max: 'Crystal clear' },
  { label: 'Systems & Processes', question: 'Are your core processes documented and repeatable?', min: 'Lives in my head', max: 'Fully documented' },
  { label: 'Owner Independence', question: 'How well could the business run if you stepped away for 90 days?', min: 'It would collapse', max: 'Runs without me' },
  { label: 'Human Capital', question: 'Do you have the right people in the right seats?', min: 'Wrong people, wrong seats', max: 'A-players, fully aligned' },
  { label: 'Vision Alignment', question: 'How close is the business to what you envisioned?', min: 'Far from the dream', max: 'Exactly as envisioned' },
];

/**
 * OperationsGapAssessmentCore
 *
 * mode="member"  — full production save + navigate to /assessments/freedom
 * mode="journey" — calls onComplete(answers, results), no DB write, no navigate
 */
export default function OperationsGapAssessmentCore({ mode = 'member', onComplete }) {
  const { state, updateState, saveAssessmentToDB } = useAssessment();
  const navigate = useNavigate();
  const { focusStep } = useJourneyFocus(mode);
  const { context: bizCtx } = useBusinessContext();
  const topRef = useRef(null);
  const timeCompRef = useRef(null);
  const scoreResultRef = useRef(null);
  const { o4_scores, o4_hrs } = state;
  const [takeHomeSource, setTakeHomeSource] = useState(null);
  // The document behind the auto-populated take-home, when there is one. The badge
  // states "needs review" while the figure is still awaiting confirmation.
  const [takeHomeDocument, setTakeHomeDocument] = useState(null);

  // Journey: focus top on mount only — no internal auto-scroll (Blocker 3)
  useEffect(() => {
    if (mode === 'journey') {
      focusStep(topRef, { delay: 150, align: 'start' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevScore = useRef(0);

  useEffect(() => {
    if (state.o4_takehome > 0) return;
    base44.functions.invoke('getMetricAutoPopulate', { active_business_id: bizCtx.active_business_id }).then(res => {
      const d = res.data;
      if (d?.monthly_take_home && d.monthly_take_home > 0) {
        updateState({ o4_takehome: d.monthly_take_home });
        setTakeHomeSource(
          d.sources?.monthly_take_home === 'extracted_fields' ? 'Source: Uploaded document'
          : d.sources?.monthly_take_home === 'profile_financials' ? 'Source: Profile financials'
          : d.sources?.monthly_take_home?.includes('/ 12') ? 'Estimated from net profit'
          : 'Auto-populated from your data'
        );
        // Only a document-backed figure becomes clickable evidence, and it carries
        // its review status so pending data is never shown as governed.
        setTakeHomeDocument(
          d.sources?.monthly_take_home === 'extracted_fields' ? (d.sources.monthly_take_home_document || null) : null
        );
        return;
      }
      if (state.p1_rev > 0 && state.p1_mymargin > 0) {
        const derived = Math.round((state.p1_rev * state.p1_mymargin / 100) / 12);
        updateState({ o4_takehome: derived });
        setTakeHomeSource('(estimated from profit margin)');
      }
    }).catch(() => {
      if (state.o4_takehome <= 0 && state.p1_rev > 0 && state.p1_mymargin > 0) {
        const derived = Math.round((state.p1_rev * state.p1_mymargin / 100) / 12);
        updateState({ o4_takehome: derived });
        setTakeHomeSource('(estimated from profit margin)');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const derivedTakeHome = !state.o4_takehome && state.p1_rev > 0 && state.p1_mymargin > 0
    ? Math.round((state.p1_rev * state.p1_mymargin / 100) / 12)
    : 0;
  // resolvedTakeHome: explicit state value > derived from profit margin > 0
  const resolvedTakeHome = state.o4_takehome > 0 ? state.o4_takehome : (derivedTakeHome || 0);
  const o4_takehome = resolvedTakeHome;
  const { operations_score, monthly_value_freed, hourly_value, freed_hours_per_week } = calcOperationsScore({
    o4_scores,
    o4_hrs: o4_hrs || 50,
    o4_takehome: resolvedTakeHome,
  });

  const setScore = (idx, val) => {
    const next = [...o4_scores];
    next[idx] = val;
    updateState({ o4_scores: next });
  };

  const [validationError, setValidationError] = useState('');

  const handleNext = async () => {
    if (mode === 'journey' && !(resolvedTakeHome > 0)) {
      setValidationError('Please enter your monthly take-home to continue.');
      timeCompRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setValidationError('');
    const answers = { o4_scores, o4_hrs, o4_takehome };
    const results = calcOperationsScore({ o4_scores, o4_hrs, o4_takehome });

    const validation = validateAssessmentResults('operations_gap', results, state);
    logValidation('operations_gap', validation);
    if (!validation.valid) console.error('[OPERATIONS_GAP_SAVE_BLOCKED] Missing required fields:', validation.missing);

    if (mode === 'member') {
      recordAssessmentCompletion('operations_gap', answers, results, SOURCE_TYPES.MEMBER_ANSWER);
      await saveAssessmentToDB('operations_gap', answers, results);
      navigate('/assessments/freedom');
    } else {
      onComplete?.(answers, results);
    }
  };

  return (
    <div ref={topRef} className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(239,68,68,0.15)', color: COLOR, border: '1.5px solid rgba(239,68,68,0.4)' }}>
          05
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Operations Gap</h1>
          <p className="text-sm text-muted-foreground mt-1">How dependent is your business on you showing up every day?</p>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {QUESTIONS.map((q, i) => (
          <div key={i} className="rounded-xl border bg-card p-5" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold">
                  <span className="mr-2" style={{ color: COLOR }}>{String(i + 1).padStart(2, '0')}</span>
                  {q.label}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{q.question}</p>
              </div>
              <div className="flex items-center gap-1 ml-4 shrink-0 bg-secondary border border-border rounded-md px-2.5 py-1">
                <input
                  type="number"
                  value={o4_scores[i] || ''}
                  min={1}
                  max={6}
                  onChange={(e) => {
                    const v = Math.min(6, Math.max(1, Number(e.target.value) || 1));
                    setScore(i, v);
                  }}
                  className="w-10 bg-transparent text-lg font-display font-bold text-right outline-none"
                  style={{ color: COLOR }}
                />
                <span className="text-sm text-muted-foreground font-normal">/6</span>
              </div>
            </div>
            <SliderInput trackOnly
              value={o4_scores[i]}
              onChange={(v) => setScore(i, v)}
              min={1} max={6} step={1}
              color={COLOR}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">{q.min}</span>
              <span className="text-[10px] text-muted-foreground">{q.max}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Time & Compensation */}
      <div ref={timeCompRef} className="rounded-xl border bg-card p-6 space-y-6" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: COLOR }}>Your Time & Compensation</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-sm font-medium">Monthly take-home</p>
              <GalileoBadge source={takeHomeSource} document={takeHomeDocument} />
              {mode === 'journey' && <GalileoHelpBubble fieldKey="o4_takehome" />}
            </div>
            <div className="flex items-center gap-1 border border-border rounded-md px-3 py-2 bg-secondary">
              <span className="text-muted-foreground text-sm">$</span>
              <input
                type="text"
                placeholder="e.g. 18,000"
                value={o4_takehome || ''}
                onFocus={(e) => { if (Number(e.target.value) === 0) e.target.value = ''; }}
                onChange={(e) => updateState({ o4_takehome: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
                className="bg-transparent flex-1 outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Hours worked / week</p>
                {mode === 'journey' && <GalileoHelpBubble fieldKey="o4_hrs" />}
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
                <input
                  type="number"
                  value={o4_hrs}
                  onChange={(e) => updateState({ o4_hrs: Number(e.target.value) })}
                  className="w-16 bg-transparent text-sm text-right outline-none"
                />
                <span className="text-xs text-muted-foreground">hrs</span>
              </div>
            </div>
            <SliderInput trackOnly
              value={o4_hrs}
              onChange={(v) => updateState({ o4_hrs: v })}
              min={20} max={80} step={1}
              color={COLOR}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">20 hrs</span>
              <span className="text-[10px] text-muted-foreground">80 hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score result */}
      <div ref={scoreResultRef} className="rounded-xl border bg-card p-5 grid grid-cols-1 md:grid-cols-3 gap-4" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}>
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COLOR }}>Operations Health Score</p>
          <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>
            {operations_score}<span className="text-sm text-muted-foreground font-normal">/100</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COLOR }}>Value of Time Freed</p>
          {hourly_value > 0 ? (
            <>
              <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>
                ${Math.round(hourly_value).toLocaleString('en-US')}<span className="text-sm text-muted-foreground font-normal">/hr</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                ${Math.round(resolvedTakeHome).toLocaleString('en-US')} ÷ ({o4_hrs || 50}h × 4)
              </p>
              {monthly_value_freed > 0 && (
                <p className="text-[10px] mt-1" style={{ color: COLOR }}>
                  ${Math.round(monthly_value_freed).toLocaleString('en-US')}/mo recovered
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Enter take-home to calculate</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COLOR }}>Hours Freed / Week</p>
          <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>
            {freed_hours_per_week ?? 0}<span className="text-sm text-muted-foreground font-normal"> hrs</span>
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex justify-between pt-2">
        {mode === 'member' ? (
          <>
            <Link to="/assessments/tax-gap"><Button variant="outline">← Back</Button></Link>
            <Button onClick={handleNext} style={{ background: COLOR, color: '#fff' }} className="font-semibold px-6">
              Next: Freedom Assessment →
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