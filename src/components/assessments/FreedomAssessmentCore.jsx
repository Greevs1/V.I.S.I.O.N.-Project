import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import SliderInput from '@/components/ui/SliderInput';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Heart, Sparkles } from 'lucide-react';
import { useAssessment } from '@/lib/AssessmentContext';
import { calcFreedomScore } from '@/lib/assessmentCalculations';
import { recordAssessmentCompletion, SOURCE_TYPES } from '@/lib/intelligenceGraph';
import GalileoHelpBubble from '@/components/experience/GalileoHelpBubble';
import { useJourneyFocus } from '@/hooks/useJourneyFocus';

const COLOR = '#3b82f6';

const EXIT_TYPES = [
  { id: 'sell', label: 'Sell Completely' },
  { id: 'partial', label: 'Partial Sale' },
  { id: 'keep', label: 'Keep & Optimize' },
  { id: 'mbo', label: 'Management Buyout' },
  { id: 'family', label: 'Family Succession' },
];

/**
 * FreedomAssessmentCore
 *
 * mode="member"  — full production save + navigate to /dashboard
 * mode="journey" — calls onComplete(answers, results), no DB write, no navigate
 */
export default function FreedomAssessmentCore({ mode = 'member', onComplete }) {
  const { state, updateState, saveAssessmentToDB } = useAssessment();
  const navigate = useNavigate();
  const { focusStep } = useJourneyFocus(mode);
  const topRef = useRef(null);
  const financialLifestyleRef = useRef(null);
  const exitRef = useRef(null);
  const freedomScoreRef = useRef(null);

  // Journey: focus top on mount only — no internal auto-scroll (Blocker 3)
  useEffect(() => {
    if (mode === 'journey') focusStep(topRef, { delay: 150 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    f_unplugged_days, f_run_without_you, f_stress_level,
    f_household_expenses, f_desired_income, f_net_worth, f_desired_hours,
    f_exit_timeline, f_exit_type, f_risk_tolerance,
    f_desired_retirement_income,
  } = state;

  const freedomCalc = calcFreedomScore(state);

  const [validationError, setValidationError] = useState('');

  const handleFinish = async () => {
    if (mode === 'journey' && !(f_household_expenses > 0)) {
      setValidationError('Please enter your monthly household expenses to continue.');
      financialLifestyleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setValidationError('');
    const answers = {
      f_unplugged_days, f_run_without_you, f_stress_level,
      f_household_expenses, f_desired_income, f_net_worth, f_desired_hours,
      f_exit_timeline, f_exit_type, f_risk_tolerance, f_desired_retirement_income,
    };

    if (mode === 'member') {
      recordAssessmentCompletion('freedom_assessment', answers, freedomCalc, SOURCE_TYPES.MEMBER_ANSWER);
      await saveAssessmentToDB('freedom_assessment', answers, freedomCalc);
      navigate('/dashboard');
    } else {
      onComplete?.(answers, freedomCalc);
    }
  };

  return (
    <div ref={topRef} className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
          style={{ background: 'rgba(59,130,246,0.15)', color: COLOR, border: '1.5px solid rgba(59,130,246,0.4)' }}>
          06
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">Freedom Assessment</h1>
          <p className="text-sm text-muted-foreground mt-1">Your business creates income. But does it create independence?</p>
        </div>
      </div>

      {/* Time & Priority */}
      <Section icon={Clock} title="Time & Priority" color={COLOR}>
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Days fully unplugged per year</p>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
                <input
                  type="number"
                  value={f_unplugged_days}
                  min={0}
                  onChange={(e) => updateState({ f_unplugged_days: Number(e.target.value) || 0 })}
                  className="w-16 bg-transparent text-sm text-right outline-none"
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            </div>
            <SliderInput trackOnly
              value={f_unplugged_days}
              onChange={(v) => updateState({ f_unplugged_days: v })}
              min={0} max={90} step={1}
              color={COLOR}
            />
          </div>
          <div>
            <p className="text-sm font-medium mb-3">Can the business run without you for 30 days?</p>
            <div className="flex gap-4">
              {['Yes', 'No'].map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={f_run_without_you === opt.toLowerCase()}
                    onChange={() => updateState({ f_run_without_you: opt.toLowerCase() })}
                    className="w-4 h-4"
                    style={{ accentColor: COLOR }}
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Current Stress Level (1-10)</p>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-3 py-1">
                <input
                  type="number"
                  value={f_stress_level}
                  min={1}
                  max={10}
                  onChange={(e) => updateState({ f_stress_level: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                  className="w-16 bg-transparent text-sm text-right outline-none"
                />
                <span className="text-xs text-muted-foreground">/10</span>
              </div>
            </div>
            <SliderInput trackOnly
              value={f_stress_level}
              onChange={(v) => updateState({ f_stress_level: v })}
              min={1} max={10} step={1}
              color={COLOR}
            />
          </div>
        </div>
      </Section>

      {/* Financial Lifestyle */}
      <Section icon={Heart} title="Financial Lifestyle" color={COLOR} sectionRef={financialLifestyleRef}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DollarInput label="Current Monthly Household Expenses" value={f_household_expenses} onChange={(v) => updateState({ f_household_expenses: v })} helpKey={mode === 'journey' ? 'f_household_expenses' : null} />
          <DollarInput label="Desired Monthly Income" value={f_desired_income} onChange={(v) => updateState({ f_desired_income: v })} helpKey={mode === 'journey' ? 'f_desired_income' : null} />
          <DollarInput label="Current Personal Net Worth (Excl. Business)" value={f_net_worth} onChange={(v) => updateState({ f_net_worth: v })} helpKey={mode === 'journey' ? 'f_net_worth' : null} />
          <DollarInput label="Desired Retirement Monthly Income" value={f_desired_retirement_income} onChange={(v) => updateState({ f_desired_retirement_income: v })} />
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Desired Work Schedule (Hours/Week)</label>
            <input
              type="number"
              value={f_desired_hours}
              onChange={(e) => updateState({ f_desired_hours: Number(e.target.value) })}
              className="w-full border border-border rounded-md px-3 py-2 bg-secondary outline-none text-sm"
            />
          </div>
        </div>
      </Section>

      {/* Exit & Transition */}
      <Section icon={Sparkles} title="Exit & Transition" color={COLOR} sectionRef={exitRef}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Exit Timeline (Years)</label>
            <input
              type="number"
              value={f_exit_timeline}
              onChange={(e) => updateState({ f_exit_timeline: Number(e.target.value) })}
              className="w-full border border-border rounded-md px-3 py-2 bg-secondary outline-none text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Desired Exit Type</label>
            <select
              value={f_exit_type}
              onChange={(e) => updateState({ f_exit_type: e.target.value })}
              className="w-full border border-border rounded-md px-3 py-2 bg-secondary outline-none text-sm text-foreground"
            >
              {EXIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Risk Tolerance (1-10)</label>
            <input
              type="number"
              min={1} max={10}
              value={f_risk_tolerance}
              onChange={(e) => updateState({ f_risk_tolerance: Number(e.target.value) })}
              className="w-full border border-border rounded-md px-3 py-2 bg-secondary outline-none text-sm"
            />
          </div>
        </div>
      </Section>

      {/* Freedom Score */}
      <div ref={freedomScoreRef} className="rounded-xl border bg-card p-5" style={{ borderColor: 'rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.06)' }}>
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COLOR }}>Current Freedom Score</p>
        <p className="text-3xl font-display font-bold" style={{ color: COLOR }}>
          {freedomCalc.freedom_score}<span className="text-sm text-muted-foreground font-normal">/100</span>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Estimated Freedom Date: <strong className="text-foreground">{freedomCalc.freedom_date}</strong>
        </p>
      </div>

      {/* Nav */}
      <div className="flex justify-between pt-2">
        {mode === 'member' ? (
          <>
            <Link to="/assessments/operations-gap"><Button variant="outline">← Back</Button></Link>
            <Button onClick={handleFinish} style={{ background: COLOR, color: '#fff' }} className="font-semibold px-6">
              See My Results →
            </Button>
          </>
        ) : (
          <div className="w-full space-y-2">
            {validationError && (
              <p className="text-center text-sm" style={{ color: '#D4A853' }}>⚑ {validationError}</p>
            )}
            <Button onClick={handleFinish} className="w-full h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90">
              Complete →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, color, children, sectionRef }) {
  return (
    <div ref={sectionRef} className="rounded-xl border bg-card p-6 space-y-4" style={{ borderColor: 'rgba(59,130,246,0.25)' }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function DollarInput({ label, value, onChange, helpKey }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <label className="text-xs text-muted-foreground">{label}</label>
        {helpKey && <GalileoHelpBubble fieldKey={helpKey} />}
      </div>
      <div className="flex items-center gap-1 border border-border rounded-md px-3 py-2 bg-secondary">
        <span className="text-muted-foreground text-sm">$</span>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, '')))}
          className="bg-transparent flex-1 outline-none text-sm"
        />
      </div>
    </div>
  );
}