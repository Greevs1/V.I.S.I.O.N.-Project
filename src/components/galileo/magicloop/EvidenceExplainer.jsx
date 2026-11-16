/**
 * EvidenceExplainer — "Show Me Why"
 *
 * An early prototype of the Evidence model. Explains simply: what Galileo
 * noticed, what information he used, which source contributed, what
 * assumption was made, and how the conclusion was calculated. No technical
 * database language. Makes Galileo trustworthy rather than overwhelming.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { getOpportunityStateLabel, getOpportunityStateColor } from '@/lib/galileo/opportunityQualification';

const fmt = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const DOC_TYPE_LABELS = {
  profit_and_loss: 'Profit & Loss',
  balance_sheet: 'Balance Sheet',
  business_tax_return: 'Tax Return',
  other: 'Document',
};

export default function EvidenceExplainer({ opportunity, extractedFacts, onBack, onContinue }) {
  if (!opportunity) return null;

  const facts = extractedFacts?.facts || {};
  const period = extractedFacts?.period;
  const docLabel = DOC_TYPE_LABELS[extractedFacts?.document_type] || 'Document';
  const hasDocEvidence = extractedFacts?.success && (facts.annual_revenue?.normalized != null || facts.reported_ebitda?.normalized != null);

  // Build document evidence rows
  const docRows = [];
  if (facts.annual_revenue?.normalized != null) {
    docRows.push({ label: 'Revenue', value: fmt(facts.annual_revenue.normalized) });
  }
  if (facts.cogs?.normalized != null) {
    docRows.push({ label: 'Cost of Goods Sold', value: fmt(facts.cogs.normalized) });
  }
  if (facts.gross_profit?.normalized != null && facts.annual_revenue?.normalized > 0) {
    const gm = (facts.gross_profit.normalized / facts.annual_revenue.normalized) * 100;
    docRows.push({ label: 'Gross Profit', value: fmt(facts.gross_profit.normalized) });
    docRows.push({ label: 'Gross Margin', value: `${Math.round(gm * 10) / 10}%` });
  }
  if (facts.operating_expenses?.normalized != null) {
    docRows.push({ label: 'Operating Expenses', value: fmt(facts.operating_expenses.normalized) });
  }
  if (facts.reported_ebitda?.normalized != null) {
    docRows.push({ label: 'EBITDA', value: fmt(facts.reported_ebitda.normalized) });
  } else if (facts.operating_income?.normalized != null) {
    docRows.push({ label: 'Operating Income', value: fmt(facts.operating_income.normalized) });
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto px-6 pt-4 w-full">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-2">
          Show me why — {opportunity.title}
        </p>
        <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-6">
          Here's how I got there.
        </h2>

        <div className="space-y-4">
          {/* Document-backed evidence — shown when extraction succeeded */}
          {hasDocEvidence && docRows.length > 0 && (
            <div className="rounded-xl border border-[#D4A853]/20 bg-[#D4A853]/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-[#D4A853]" />
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#D4A853] font-semibold">
                  Source — {docLabel}{period ? ` (${period})` : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {docRows.map((row) => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-sm text-white/50">{row.label}</span>
                    <span className="text-sm text-white/85 font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intelligence state badge */}
          {opportunity.intelligenceState && (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 py-1 rounded-full border ${getOpportunityStateColor(opportunity.intelligenceState)}`}>
                {getOpportunityStateLabel(opportunity.intelligenceState)}
              </span>
            </div>
          )}

          {/* What I noticed */}
          <Section label="What I noticed">
            {opportunity.title === 'Value Gap'
              ? (hasDocEvidence
                ? `Your historical financials show ${facts.reported_ebitda?.normalized != null ? `EBITDA of ${fmt(facts.reported_ebitda.normalized)}` : 'a clear earnings picture'}. There's a gap between what your business is worth today and what it could be worth at a stronger valuation multiple.`
                : "There's a gap between what your business is worth today and what it could be worth at a stronger valuation multiple.")
              : "How much the business depends on you day-to-day is showing up as a risk to both your freedom and your valuation."}
          </Section>

          {/* What I used */}
          <Section label="What I used">
            <ul className="space-y-1.5">
              {opportunity.evidence?.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#D4A853] mt-0.5">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Assumption */}
          <Section label="The assumption I'm making">
            {opportunity.title === 'Value Gap'
              ? "I'm using an industry-typical multiple range (roughly 4x to 9.5x EBITDA). Your actual multiple depends on recurring revenue, systems, and owner dependency — which is exactly what moves it."
              : "I'm estimating operations health from your reported involvement. A formal Operations assessment would sharpen this considerably."}
          </Section>

          {/* How it was calculated */}
          <Section label="How I calculated it">
            {opportunity.title === 'Value Gap'
              ? (hasDocEvidence && facts.reported_ebitda?.normalized != null
                ? `Current value = your EBITDA of ${fmt(facts.reported_ebitda.normalized)} × current multiple (4x) = ${fmt(facts.reported_ebitda.normalized * 4)}. Potential value = your EBITDA × a stronger multiple (up to 9.5x). The gap is the difference — the value sitting on the table if you strengthened the business.`
                : "Current value = your EBITDA × current multiple. Potential value = your EBITDA × a stronger multiple. The gap is the difference — the value sitting on the table if you strengthened the business.")
              : "I compared your reported owner involvement to operations-health benchmarks. The more the business runs on you, the more buyers discount the value and the fewer hours you're free."}
          </Section>
        </div>

        <div className="flex justify-between mt-8">
          <Button onClick={onBack} variant="ghost" className="text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={onContinue} className="h-11 px-5 bg-[#D4A853] text-black hover:bg-[#D4A853]/90">
            What could we do? <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold mb-2">{label}</p>
      <div className="text-sm text-white/65 leading-relaxed">{children}</div>
    </div>
  );
}