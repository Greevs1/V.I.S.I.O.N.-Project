import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { FilePenLine, ArrowRight, PenLine, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

const PENDING = new Set(['assigned', 'awaiting_review', 'awaiting_signature']);

export default function PendingAgreementsCard() {
  const { user } = useAuth();

  const { data: agreements = [] } = useQuery({
    queryKey: ['pending-agreements', user?.id],
    queryFn: () => base44.entities.Agreement.filter({ assigned_to: { $contains: user?.id } }, '-created_date', 50),
    enabled: !!user?.id,
  });

  const pending = agreements.filter(a => PENDING.has(a.status));
  if (pending.length === 0) return null;

  const needsSignature = pending.filter(a => a.status === 'awaiting_signature').length;
  const needsReview    = pending.filter(a => ['assigned', 'awaiting_review'].includes(a.status)).length;

  return (
    <Link to="/agreements" className="block">
      <div className="glass-gold rounded-xl p-5 flex items-center gap-4 hover:border-primary/40 transition-colors cursor-pointer group">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <FilePenLine className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary">
            {pending.length} Agreement{pending.length !== 1 ? 's' : ''} Need{pending.length === 1 ? 's' : ''} Attention
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
            {needsSignature > 0 && (
              <span className="flex items-center gap-1">
                <PenLine className="w-3 h-3" /> {needsSignature} awaiting signature
              </span>
            )}
            {needsReview > 0 && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> {needsReview} pending review
              </span>
            )}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>
    </Link>
  );
}