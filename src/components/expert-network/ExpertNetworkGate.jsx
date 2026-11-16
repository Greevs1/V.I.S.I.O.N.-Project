import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Star } from 'lucide-react';

export default function ExpertNetworkGate() {
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-background p-12 text-center space-y-5 max-w-xl mx-auto">
      <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
        <Lock className="w-6 h-6 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-display font-bold">Unlock the V.I.S.I.O.N. Expert Network</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Work with vetted professionals across tax strategy, wealth, operations, exit planning,
          asset protection, insurance, legal, and more — matched directly to your opportunities and sprint tasks.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-left max-w-sm mx-auto">
        {[
          'Tax Strategists & CPAs',
          'Wealth Advisors',
          'Exit Planning Experts',
          'Operations Consultants',
          'Asset Protection Attorneys',
          'Insurance Specialists',
        ].map(s => (
          <div key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Star className="w-3 h-3 text-primary shrink-0" />
            {s}
          </div>
        ))}
      </div>
      <Link to="/strategy-call"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
        Schedule a Strategy Call
      </Link>
    </div>
  );
}