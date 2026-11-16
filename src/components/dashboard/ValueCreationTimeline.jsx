import React from 'react';
import { CheckCircle2, Clock, DollarSign, TrendingUp } from 'lucide-react';

/**
 * Value Creation Timeline Component
 * Visual ledger showing measurable results from implementing recommendations
 */
export default function ValueCreationTimeline({ events }) {
  const formatCurrency = (n) => {
    if (!n) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
    return `$${Math.round(n)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Profit Improvement': '#10B981',
      'Tax Savings': '#00D1B2',
      'Value Growth': '#00D9FF',
      'Cash Flow Improvement': '#3B82F6',
      'Debt Reduction': '#8B5CF6',
      'Operations Improvement': '#F59E0B',
      'Wealth Growth': '#D4A853',
      'Protection Improvement': '#EF4444'
    };
    return colors[category] || '#9CA3AF';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Profit Improvement': TrendingUp,
      'Tax Savings': DollarSign,
      'Value Growth': TrendingUp,
      'Cash Flow Improvement': TrendingUp,
      'Debt Reduction': DollarSign,
      'Operations Improvement': CheckCircle2,
      'Wealth Growth': TrendingUp,
      'Protection Improvement': CheckCircle2
    };
    return icons[category] || CheckCircle2;
  };

  // Sort by date, newest first
  const sortedEvents = [...(events || [])].sort((a, b) => 
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  if (!sortedEvents || sortedEvents.length === 0) {
    return (
      <div 
        className="rounded-2xl p-8"
        style={{ background: '#0D0D10', border: '1px solid #24242A' }}
      >
        <p className="text-sm text-muted-foreground text-center">
          No value creation events yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 md:p-8" style={{ background: '#0D0D10', border: '1px solid #24242A' }}>
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5" style={{ color: '#10B981' }} />
        <h3 className="text-lg font-display font-bold" style={{ color: '#F5F5F5' }}>
          Value Creation Timeline
        </h3>
      </div>

      <div className="space-y-4">
        {sortedEvents.map((event, index) => {
          const Icon = getCategoryIcon(event.category);
          const color = getCategoryColor(event.category);
          const isVerified = event.status === 'verified';

          return (
            <div
              key={event.id || index}
              className="relative pl-8 pb-6 border-l"
              style={{ borderColor: isVerified ? '#10B981' : '#3B82F6' }}
            >
              {/* Timeline Dot */}
              <div 
                className="absolute left-[-6px] top-0 w-3 h-3 rounded-full"
                style={{ background: color }}
              />

              {/* Event Card */}
              <div 
                className="rounded-xl p-5"
                style={{ 
                  background: isVerified ? 'rgba(16,185,129,0.05)' : 'rgba(59,130,246,0.05)',
                  border: `1px solid ${isVerified ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}`
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: `${color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {event.category}
                      </p>
                      <p className="text-sm font-medium" style={{ color: '#F5F5F5' }}>
                        {formatDate(event.created_at)}
                      </p>
                    </div>
                  </div>
                  {isVerified && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.15)' }}>
                      <CheckCircle2 className="w-3 h-3" style={{ color: '#10B981' }} />
                      <span className="text-[10px] font-semibold" style={{ color: '#10B981' }}>
                        Verified
                      </span>
                    </div>
                  )}
                </div>

                <h4 className="text-base font-semibold mb-2" style={{ color: '#F5F5F5' }}>
                  {event.title}
                </h4>

                {event.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {event.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <p 
                    className="text-2xl font-display font-bold"
                    style={{ color: event.verified_value || event.estimated_impact ? '#10B981' : '#3B82F6' }}
                  >
                    +{formatCurrency(event.verified_value || event.estimated_impact || 0)}
                  </p>
                  {event.advisor_initials && (
                    <p className="text-xs text-muted-foreground">
                      Verified by {event.advisor_initials}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}