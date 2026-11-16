import React from 'react';
import { useMembership } from '@/lib/useMembership';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function RoadmapLockedItem({ count = 1 }) {
  const { isPaid } = useMembership();
  const navigate = useNavigate();

  if (isPaid) {
    return null;
  }

  return (
    <div className="relative rounded-xl border border-border bg-card/50 overflow-hidden">
      <div className="absolute inset-0 backdrop-blur-[2px] z-10" />
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="w-4 h-4" />
          <span className="text-sm font-medium">
            {count} {count === 1 ? 'strategy' : 'strategies'} locked
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Upgrade to unlock implementation details, advisor notes, and next steps.
        </p>
        <Button 
          size="sm" 
          onClick={() => navigate('/strategy-call')}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Upgrade to Unlock
        </Button>
      </div>
    </div>
  );
}