/**
 * MembershipGate — wraps any content with a blur/lock overlay for free-tier users.
 * 
 * Usage:
 *   <MembershipGate>
 *     <PremiumContent />
 *   </MembershipGate>
 * 
 * Props:
 *   feature      — short label for what's being locked (e.g. "Full Sprint Plan")
 *   children     — the content to conditionally show/gate
 *   showPreview  — if true, shows blurred children instead of hiding them entirely
 *   className    — additional wrapper class
 */
import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMembership } from '@/lib/useMembership';
import { useNavigate } from 'react-router-dom';

export default function MembershipGate({ children, feature = 'This Feature', showPreview = true, className = '' }) {
  const { isPaid } = useMembership();
  const navigate = useNavigate();

  if (isPaid) return <>{children}</>;

  if (!showPreview) {
    return (
      <div className={`glass rounded-xl p-6 text-center space-y-3 ${className}`}>
        <Lock className="w-6 h-6 text-primary mx-auto" />
        <p className="text-sm font-semibold">{feature} — Members Only</p>
        <p className="text-xs text-muted-foreground">Upgrade to unlock this feature.</p>
        <Button size="sm" className="text-xs" onClick={() => navigate('/strategy-call')}>Upgrade to Unlock</Button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.5 }}>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
        <Lock className="w-5 h-5 text-primary mb-2" />
        <p className="text-sm font-semibold text-foreground mb-1">{feature}</p>
        <p className="text-xs text-muted-foreground mb-3 text-center px-4">
          Upgrade your membership to unlock full access.
        </p>
        <Button size="sm" className="text-xs" onClick={() => navigate('/strategy-call')}>Upgrade Now</Button>
      </div>
    </div>
  );
}