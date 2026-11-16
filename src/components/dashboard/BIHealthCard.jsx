/**
 * BIHealthCard — Business Intelligence Confidence (Redesigned)
 *
 * Full-width premium confidence panel.
 * Shows the completeness and quality of the intelligence profile.
 * NOT the IQ Score — this measures data coverage, not business performance.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Activity, ArrowRight, Upload } from 'lucide-react';
import { getAssessmentCompletion } from '@/lib/assessmentCompletionService';

const CONFIDENCE_COLORS = {
  Comprehensive: '#10B981',
  Strong:        '#00D9FF',
  Developing:    '#D4A853',
  Early:         '#FF4D57',
  Initial:       '#6B7280',
};

export default function BIHealthCard({ bis }) {
  const health = bis?.engine?.health;
  if (!health) return null;

  // CANONICAL completion (Phase 9) — single source of truth
  const completion = getAssessmentCompletion(bis);

  const score = health.health_score ?? 0;
  const label = health.health_label ?? 'Initial';
  const color = CONFIDENCE_COLORS[label] || CONFIDENCE_COLORS.Initial;
  // Assessment completion + missing come from the canonical service, not cached health values
  const nextBest = completion.highestValueMissing
    ? { label: `${completion.highestValueMissing.label} Assessment`, estimatedValue: completion.highestValueMissing.estimatedValue, target: completion.highestValueMissing.path }
    : null;
  const completed = completion.completedCount;
  const total = completion.totalCount;
  // Non-assessment missing dims (documents, scenario, etc.) still come from health
  const otherMissing = (health.missing_information || []).filter(m => m.dimension !== 'assessments');
  const missingTags = [
    ...completion.missing.map(m => ({ dimension: m.label, impact: 'high' })),
    ...otherMissing.map(m => ({ dimension: m.dimension, impact: m.impact })),
  ];
  const highImpactCount = missingTags.filter(m => m.impact === 'high').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl p-8 md:p-10 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck className="w-4 h-4" style={{ color }} />
        <h3 className="text-[14px] font-semibold tracking-[0.12em] uppercase" style={{ color }}>
          Business Intelligence Confidence
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {/* Left: Confidence score with progress ring */}
        <div className="flex flex-col items-center md:items-start">
          <div className="relative w-24 h-24 mb-4">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: `conic-gradient(${color} ${score}%, rgba(255,255,255,0.06) ${score}%)` }}
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: '#161616' }}
              >
                <div className="text-center">
                  <p className="text-3xl font-display font-bold leading-none" style={{ color }}>
                    {score}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">/100</p>
                </div>
              </div>
            </div>
          </div>
          <p className="text-lg font-semibold" style={{ color }}>{label}</p>
          <p className="text-[13px] text-muted-foreground">{completed}/{total} assessments complete</p>
        </div>

        {/* Right: Next best data + missing items */}
        <div className="md:col-span-2">
          {nextBest ? (
            <div>
              <p className="text-[12px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-3">
                Next Best Data to Provide
              </p>
              <Link
                to={nextBest.target}
                className="block rounded-xl p-4 transition-colors hover:bg-white/5"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5" style={{ color }} />
                    <div>
                      <span className="text-base font-medium text-foreground">
                        {nextBest.label}
                      </span>
                      {nextBest.estimatedValue > 0 && (
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                          Est. {nextBest.estimatedValue >= 1_000_000
                            ? `$${(nextBest.estimatedValue / 1_000_000).toFixed(1)}M`
                            : `$${Math.round(nextBest.estimatedValue).toLocaleString('en-US')}`} opportunity
                        </p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0" style={{ color }} />
                </div>
              </Link>

              {/* Missing information — compact (canonical assessment list) */}
              {missingTags.length > 0 && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[12px] uppercase tracking-[0.1em] font-semibold text-muted-foreground mb-3">
                    {highImpactCount > 0 ? `${highImpactCount} High-Impact Items Missing` : 'Missing Information'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {missingTags.map((m, i) => (
                      <span
                        key={i}
                        className="text-[12px] px-2.5 py-1 rounded-full"
                        style={{
                          background: m.impact === 'high' ? 'rgba(255,77,87,0.1)' : m.impact === 'medium' ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.05)',
                          color: m.impact === 'high' ? '#FF4D57' : m.impact === 'medium' ? '#D4A853' : '#B0B0B0',
                        }}
                      >
                        {m.dimension.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full rounded-lg p-6"
              style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <Activity className="w-10 h-10 mb-3" style={{ color: '#10B981' }} />
              <p className="text-base font-medium text-center" style={{ color: '#10B981' }}>
                Your intelligence profile is comprehensive.
              </p>
              <p className="text-[13px] text-muted-foreground text-center mt-1">
                All critical dimensions captured.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}