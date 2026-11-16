/**
 * QuestionnaireSection — Phase 13.2
 *
 * Renders questions for a specific section with conditional logic,
 * source provenance display, and advisor verification status.
 *
 * Existing platform data is prepopulated where available, with source
 * attribution. Advisor-entered values are never silently overwritten.
 */
import React, { useState, useMemo } from 'react';
import { getSectionQuestions, VALUATION_SECTIONS } from '@/lib/valuation/questionnaireDefinition';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, FileText, Database, User, Shield } from 'lucide-react';

const SOURCE_ICONS = {
  advisor_entry: User,
  client_confirmation: User,
  prepopulated: Database,
  document: FileText,
  extracted_field: FileText,
  assessment_answer: Database,
  assessment_calculation: Database,
  dashboard_metric: Database,
  gap_analysis: Database,
  external_benchmark: Database,
};

export default function QuestionnaireSection({ sectionKey, answers = {}, onAnswer, onSave }) {
  const section = VALUATION_SECTIONS.find(s => s.section_key === sectionKey);
  const questions = useMemo(() => getSectionQuestions(sectionKey, answers), [sectionKey, answers]);
  const [localAnswers, setLocalAnswers] = useState(answers);

  if (!section) return null;

  const handleAnswer = (questionKey, value, sourceType = 'advisor_entry') => {
    const updated = {
      ...localAnswers,
      [questionKey]: {
        value,
        source_type: sourceType,
        source_confidence: sourceType === 'prepopulated' ? 70 : 90,
        is_confirmed: false,
        advisor_verification_status: 'pending',
      },
    };
    setLocalAnswers(updated);
    onAnswer?.(questionKey, value, sourceType);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">{section.section_name}</h3>
        <p className="text-xs text-muted-foreground mt-1">{questions.length} question{questions.length !== 1 ? 's' : ''} in this section</p>
      </div>

      {questions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No questions to display based on current answers.</p>
        </div>
      )}

      {questions.map(question => (
        <QuestionCard
          key={question.question_key}
          question={question}
          answer={localAnswers[question.question_key]}
          onAnswer={handleAnswer}
        />
      ))}

      {questions.length > 0 && (
        <div className="pt-2">
          <Button onClick={() => onSave?.(sectionKey, localAnswers)} className="bg-primary text-primary-foreground">
            Save Section Answers
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question, answer, onAnswer }) {
  const answerValue = answer?.value ?? answer;
  const sourceType = answer?.source_type;
  const SourceIcon = SOURCE_ICONS[sourceType] || null;
  const isVerified = answer?.advisor_verification_status === 'verified';
  const isPrepopulated = sourceType && sourceType !== 'advisor_entry';

  return (
    <div className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{question.question_text}</p>
          {question.explanation && <p className="text-xs text-muted-foreground mt-1">{question.explanation}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {question.required && <span className="text-[10px] text-destructive uppercase tracking-wider">Required</span>}
          {question.advisor_only && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
              <Shield className="w-3 h-3" /> Advisor
            </span>
          )}
          {isVerified && <CheckCircle2 className="w-4 h-4 text-accent" />}
        </div>
      </div>

      <AnswerInput question={question} value={answerValue} onChange={(v) => onAnswer(question.question_key, v)} />

      {/* Source Provenance */}
      {sourceType && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          {SourceIcon && <SourceIcon className="w-3 h-3" />}
          <span>Source: {sourceType.replace(/_/g, ' ')}</span>
          {isPrepopulated && !isVerified && (
            <span className="flex items-center gap-1 text-amber-500/80">
              <AlertCircle className="w-3 h-3" /> Unconfirmed — verify before relying on
            </span>
          )}
        </div>
      )}

      {/* Suggested Evidence */}
      {question.suggested_evidence && !answerValue && (
        <div className="mt-2 text-[10px] text-muted-foreground/60">
          Suggested evidence: {question.suggested_evidence}
        </div>
      )}
    </div>
  );
}

function AnswerInput({ question, value, onChange }) {
  switch (question.answer_type) {
    case 'text':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        />
      );
    case 'textarea':
      return (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none resize-none"
        />
      );
    case 'number':
    case 'currency':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full max-w-xs px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        />
      );
    case 'percentage':
      return (
        <input
          type="number"
          step="0.01"
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full max-w-xs px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        />
      );
    case 'date':
      return (
        <input
          type="date"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full max-w-xs px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        />
      );
    case 'boolean':
      return (
        <div className="flex gap-2">
          <button
            onClick={() => onChange(true)}
            className={`px-4 py-2 rounded text-sm ${value === true ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >Yes</button>
          <button
            onClick={() => onChange(false)}
            className={`px-4 py-2 rounded text-sm ${value === false ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >No</button>
        </div>
      );
    case 'single_select':
      return (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        >
          <option value="">Select...</option>
          {question.options?.map(opt => <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>)}
        </select>
      );
    case 'multi_select':
      return (
        <div className="flex flex-wrap gap-2">
          {question.options?.map(opt => {
            const selected = Array.isArray(value) && value.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => {
                  const arr = Array.isArray(value) ? value : [];
                  onChange(selected ? arr.filter(v => v !== opt) : [...arr, opt]);
                }}
                className={`px-3 py-1.5 rounded text-xs ${selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
              >{opt.replace(/_/g, ' ')}</button>
            );
          })}
        </div>
      );
    case 'scale_1_5':
      return (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`w-10 h-10 rounded text-sm font-semibold ${value === n ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
            >{n}</button>
          ))}
        </div>
      );
    case 'scale_1_10':
      return (
        <div className="flex flex-wrap gap-1.5 max-w-md">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`w-8 h-8 rounded text-xs font-semibold ${value === n ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
            >{n}</button>
          ))}
        </div>
      );
    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded bg-secondary text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        />
      );
  }
}