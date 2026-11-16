/**
 * MembershipUpgradeBanner — shows a contextual upgrade CTA on the dashboard
 * when the user is on the free tier and has hidden opportunities.
 */
import React from 'react';
import { Lock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMembership } from '@/lib/useMembership';
import { useNavigate } from 'react-router-dom';

const fmtMoney = (n) => {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
};

export default function MembershipUpgradeBanner({ hiddenOpportunities = 0, hiddenValue = 0 }) {
  const { isPaid } = useMembership();
  const navigate = useNavigate();
  if (isPaid || (hiddenOpportunities === 0 && !hiddenValue)) return null;

  return (
    <div className="glass-gold rounded-xl p-5 border border-primary/20">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-1">
            {hiddenOpportunities > 0
              ? `You have ${hiddenOpportunities} additional opportunities hidden.`
              : 'More opportunities available.'}
          </p>
          {hiddenValue > 0 && (
            <p className="text-xs text-muted-foreground mb-1">
              Potential Additional Value Available: <strong className="text-primary">{fmtMoney(hiddenValue)}</strong>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Unlock your complete strategic sprint plan.
          </p>
        </div>
        <Button size="sm" className="text-xs shrink-0" onClick={() => navigate('/strategy-call')}>
          <TrendingUp className="w-3 h-3 mr-1" />
          Upgrade
        </Button>
      </div>
    </div>
  );
}