import React from 'react';
import { Building2, TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useMembership } from '@/lib/useMembership';
import PremiumWorkspaceOverlay from '@/components/premium/PremiumWorkspaceOverlay';

const buyers = [
  {
    type: 'Private Equity',
    subtitle: 'Financial Buyer',
    icon: Building2,
    valuation: '$1.8M',
    basis: 'Based on 4.0x EBITDA',
    color: 'text-foreground',
    insights: [
      { type: 'warning', text: 'High owner dependency (Ops Score: 47). A PE firm will heavily discount the multiple or require a long earn-out period to mitigate transition risk.' },
      { type: 'warning', text: 'You have $40K in EBITDA add-backs. PE firms will scrutinize heavily during Quality of Earnings (QoE) due diligence. Documentation is critical.' },
      { type: 'info', text: 'Your tax inefficiencies ($20K/yr) represent a quick post-acquisition win for a PE firm to boost cash flow.' },
    ]
  },
  {
    type: 'Strategic Acquisition',
    subtitle: 'Industry Competitor / Adjacent',
    icon: TrendingUp,
    valuation: '$2.7M',
    basis: 'Based on 6.0x EBITDA + Synergies',
    color: 'text-cyan-gradient',
    insights: [
      { type: 'success', text: 'Your margins are best-in-class. A strategic buyer will value your business as a premium asset that can potentially improve their own averages.' },
      { type: 'info', text: 'In the Residential HVAC sector, strategic buyers often pay a premium for market share, customer lists, and avoiding the cost of customer acquisition.' },
      { type: 'success', text: 'Strategic buyers are often less concerned about owner dependency than PE firms, as they plan to integrate your operations, back office, and leadership into their existing infrastructure.' },
    ]
  }
];

const insightIcons = {
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

const insightColors = {
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-200',
};

export default function MASimulator() {
  const { isPaid } = useMembership();
  return (
    <PremiumWorkspaceOverlay isPaid={isPaid} feature="M&A Simulator"
      onScheduleCall={() => { window.location.href = '/strategy-call'; }}
      onBecomeMember={() => { window.location.href = '/strategy-call'; }}>
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">Simulation Engine</p>
        <h1 className="text-3xl font-display font-bold">M&A Buyer Simulator</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-lg">
          See how different types of acquirers view your business, what drives their valuation, and what red flags they look for based on your assessment data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {buyers.map((buyer) => {
          const BuyerIcon = buyer.icon;
          return (
            <div key={buyer.type} className="glass rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <BuyerIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{buyer.type}</h3>
                  <p className="text-xs text-muted-foreground">{buyer.subtitle}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Estimated Valuation</p>
                <p className={`text-4xl font-display font-bold ${buyer.color}`}>{buyer.valuation}</p>
                <p className="text-xs text-muted-foreground mt-1">{buyer.basis}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3">Their View of Your Data</p>
                <div className="space-y-2">
                  {buyer.insights.map((insight, i) => {
                    const Icon = insightIcons[insight.type];
                    return (
                      <div key={i} className={`rounded-lg p-3 border text-sm leading-relaxed ${insightColors[insight.type]}`}>
                        <div className="flex gap-2">
                          <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{insight.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </PremiumWorkspaceOverlay>
  );
}