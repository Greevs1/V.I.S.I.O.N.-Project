/**
 * AssessmentCenter — the assessment launcher, hosted inside VisionWorkspace.
 *
 * This is presentation only. Each entry mounts the REAL assessment page (which
 * is itself a thin content wrapper around an existing *AssessmentCore), so no
 * assessment logic or calculation is reimplemented here.
 *
 * No completion badge is shown: the authoritative assessment records live in
 * Supabase, and this surface has no verified read of them. A badge derived from
 * the retired legacy mirror would state something untrue.
 */

import React, { Suspense } from 'react';
import { Target, ArrowRight, ArrowLeft, LayoutGrid, Clock, TrendingUp, Receipt, Workflow } from 'lucide-react';
import WorkspaceSkeleton from './WorkspaceSkeleton';

const ASSESSMENTS = [
  {
    key: 'profit-gap',
    title: 'Profit Gap',
    desc: 'Net margin compared with best-in-class operators',
    icon: TrendingUp,
    Component: React.lazy(() => import('@/pages/assessments/ProfitGap')),
  },
  {
    key: 'value-gap',
    title: 'Value Gap',
    desc: 'Enterprise value against your industry benchmark',
    icon: Target,
    Component: React.lazy(() => import('@/pages/assessments/ValueGap')),
  },
  {
    key: 'recast-ebitda',
    title: 'Recast EBITDA',
    desc: 'Normalized earnings a buyer would underwrite',
    icon: LayoutGrid,
    Component: React.lazy(() => import('@/pages/assessments/RecastEBITDA')),
  },
  {
    key: 'tax-gap',
    title: 'Tax Gap',
    desc: 'Recoverable tax exposure across structures',
    icon: Receipt,
    Component: React.lazy(() => import('@/pages/assessments/TaxGap')),
  },
  {
    key: 'operations-gap',
    title: 'Operations Gap',
    desc: 'Operational drag on margin and valuation',
    icon: Workflow,
    Component: React.lazy(() => import('@/pages/assessments/OperationsGap')),
  },
  {
    key: 'freedom',
    title: 'Freedom Assessment',
    desc: 'Owner dependence and time freedom',
    icon: Clock,
    Component: React.lazy(() => import('@/pages/assessments/FreedomAssessment')),
  },
];

export default function AssessmentCenter({ payload, onOpen }) {
  const selected = ASSESSMENTS.find((a) => a.key === payload);

  // ── One assessment is open inside the workspace ────────────────────────
  if (selected) {
    const { Component } = selected;
    return (
      <div>
        <div className="border-b border-white/[0.05] px-6 py-3.5 md:px-9">
          <button
            type="button"
            onClick={() => onOpen?.('assessments')}
            className="inline-flex items-center gap-1.5 text-[11.5px] text-white/40 transition-colors hover:text-white/75 vision-focus"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All assessments
          </button>
        </div>
        <Suspense fallback={<WorkspaceSkeleton label="Opening assessment" />}>
          <Component />
        </Suspense>
      </div>
    );
  }

  // ── The assessment list ───────────────────────────────────────────────
  return (
    <div className="px-6 py-7 md:px-9 md:py-9">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Business health</p>
      <h3 className="mt-2 font-display text-[24px] text-white/90">Assessments</h3>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-white/50">
        Each assessment feeds the canonical business intelligence layer. Galileo explains the
        results; it never invents the numbers.
      </p>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ASSESSMENTS.map(({ key, title, desc, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpen?.('assessments', key)}
            className="group flex flex-col items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-left transition-all duration-200 hover:border-vision-gold/25 hover:bg-white/[0.035] vision-focus"
          >
            <Icon className="h-4 w-4 text-vision-champagne/60" />
            <span className="block">
              <span className="block text-[14px] text-white/85">{title}</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-white/40">{desc}</span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1 text-[11.5px] text-vision-champagne/70 transition-colors group-hover:text-vision-bright">
              Open
              <ArrowRight className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}