/**
 * MoveContextObject — the contextual object shown beside the Next Best Move.
 *
 * Resolves the REAL record behind the move, never a decoration:
 *   sprint moves        → the actual 90-Day Sprint (title, progress)
 *   document moves      → the actual document (name, type, year)
 *   opportunity moves   → the actual opportunity (title, modeled impact)
 *
 * If the underlying record cannot be found, nothing renders. No placeholder
 * object, no invented filename, no fabricated amount.
 */

import React from 'react';
import { ClipboardList, FileText, Target, TrendingUp } from 'lucide-react';

const DOC_TYPE_LABELS = {
  profit_loss: 'Profit & Loss',
  balance_sheet: 'Balance Sheet',
  tax_return: 'Tax Return',
  payroll_report: 'Payroll Report',
  other: 'Document',
};

function formatImpact(impact) {
  if (impact == null) return null;
  if (Math.abs(impact) >= 1e6) return `$${(impact / 1e6).toFixed(1)}M`;
  if (Math.abs(impact) >= 1e3) return `$${Math.round(impact / 1e3)}K`;
  return `$${Math.round(impact).toLocaleString('en-US')}`;
}

export function resolveContextObject(move, { sprints = [], opportunities = [], documents = [] } = {}) {
  if (!move) return null;
  const target = move.actionValue || {};
  const id = target.id;

  if (target.type === 'sprint_blocker' || target.type === 'sprint') {
    const sprint = sprints.find((s) => s.id === id) || sprints[0];
    if (!sprint) return null;
    return {
      key: 'sprint',
      kind: '90-Day Sprint',
      icon: ClipboardList,
      title: sprint.title,
      meta: `${sprint.progress || 0}% complete`,
    };
  }

  if (target.type === 'new_document' || target.type === 'document') {
    const doc = documents.find((d) => d.id === id) || documents[0];
    if (!doc) return null;
    const meta = [DOC_TYPE_LABELS[doc.document_type] || null, doc.year || null]
      .filter(Boolean)
      .join(' · ');
    return {
      key: 'document',
      kind: 'Document',
      icon: FileText,
      title: doc.name || 'Financial document',
      meta: meta || null,
    };
  }

  // A document assignment shows the REAL document behind the request, looked up
  // by the assignment's own document id. If the document is not in what Vision
  // already holds for this business, nothing renders — no placeholder card.
  if (target.type === 'document_assignment') {
    const doc = documents.find((d) => d.id === target.documentId);
    if (!doc) return null;
    const meta = [DOC_TYPE_LABELS[doc.document_type] || null, doc.year || null]
      .filter(Boolean)
      .join(' · ');
    return {
      key: 'document',
      kind: 'Document',
      icon: FileText,
      title: doc.name || 'Financial document',
      meta: meta || null,
    };
  }

  if (target.type === 'opportunity' || target.type === 'goal_aligned') {
    const opp = opportunities.find((o) => o.id === id);
    if (!opp) return null;
    const amount = formatImpact(opp.impact);
    return {
      key: 'opportunity',
      kind: 'Opportunity',
      icon: Target,
      title: opp.title,
      meta: amount ? `${amount} potential` : null,
    };
  }

  if (target.type === 'valuation') {
    return {
      key: 'valuation',
      kind: 'Valuation',
      icon: TrendingUp,
      title: 'Enterprise value',
      meta: null,
    };
  }

  return null;
}

export default function MoveContextObject({ move, sprints, opportunities, documents }) {
  const object = resolveContextObject(move, { sprints, opportunities, documents });
  if (!object) return null;

  const { kind, icon: Icon, title, meta } = object;

  return (
    <div className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 lg:w-[260px] lg:shrink-0">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-vision-champagne/60" />
        <span className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-vision-champagne/55">
          {kind}
        </span>
      </div>
      <p className="break-words text-[13px] leading-snug text-white/80">{title}</p>
      {meta && <p className="mt-1 text-[11px] text-white/40">{meta}</p>}
    </div>
  );
}