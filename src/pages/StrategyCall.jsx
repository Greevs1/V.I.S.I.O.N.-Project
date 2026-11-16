import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ArrowLeft, Sparkles } from 'lucide-react';
import BookingModal from '@/components/sprint/BookingModal';

const BULLETS = [
  'Full sprint plan access',
  'Galileo Strategic Advisor',
  'Advisor-reviewed document insights',
  'Verified value tracking',
  'Ongoing next best actions',
];

export default function StrategyCall() {
  const [bookingOpen, setBookingOpen] = useState(false);

  // Contextual arrival from a Sprint task's expert-role pill. THIS IS DISPLAY
  // ONLY: it grants nothing and authorizes nothing. Entitlement and access are
  // decided by the account, server-side, never by a query parameter.
  const urlParams = new URLSearchParams(window.location.search);
  const fromSprint = urlParams.get('source') === 'sprint_expert_recommendation';
  const contextRole = urlParams.get('role');
  const contextTask = urlParams.get('task');

  // Open booking modal on mount
  useEffect(() => {
    setBookingOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-8">

        {/* Badge */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-xs text-primary font-semibold tracking-wider uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            V.I.S.I.O.N. Advisory
          </div>
        </div>

        {/* What brought them here — their own task, in their own words */}
        {fromSprint && (contextRole || contextTask) && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
              Exploring expert support for
            </p>
            {contextRole && <p className="mt-1 text-sm font-medium text-foreground">{contextRole}</p>}
            {contextTask && <p className="text-xs text-muted-foreground">{contextTask}</p>}
          </div>
        )}

        {/* Headline */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
            Unlock Your Full Strategic Sprint
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            See every hidden opportunity, implementation step, and advisor-backed recommendation.
          </p>
        </div>

        {/* Bullets */}
        <div className="glass rounded-xl p-6 space-y-3">
          {BULLETS.map((bullet) => (
            <div key={bullet} className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground/90">{bullet}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Button
          className="w-full h-12 text-base"
          onClick={() => setBookingOpen(true)}
        >
          Book a Strategy Call →
        </Button>

        {/* Secondary CTA */}
        <div className="text-center">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="text-muted-foreground text-xs gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to Dashboard
            </Button>
          </Link>
        </div>

        <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
      </div>
    </div>
  );
}