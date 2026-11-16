/**
 * PathSelection — Stage 2 of the 90-Day Sprint flow.
 * Purely presentational: receives paths as a prop, no internal fetching.
 * SprintView owns all stage state and transitions.
 */
import React from 'react';
import { Sparkles, TrendingUp, Shield, DollarSign, Loader2, Check, Info, AlertCircle, X, BookOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const EASE_BADGES = {
  easy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  advanced: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const CATEGORY_ICONS = {
  profit: DollarSign,
  value: TrendingUp,
  tax: Shield,
  cash_flow: DollarSign,
  risk: Shield,
  exit_readiness: TrendingUp,
  growth: TrendingUp,
  wealth: DollarSign,
  governance: Shield,
};

function formatCurrency(val) {
  if (!val) return null;
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${Math.round(val / 1000)}K`;
  return `$${val}`;
}

export default function PathSelection({
  paths = [],
  selecting = null,
  onSelect,
  onExplainWhy,
  onRegenerate,
  error,
  onClearError,
}) {
  const { activeContext } = useAuth();
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Choose Your 90-Day Outcome</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Select one path to begin your 90-day execution sprint. Galileo's top recommendations are ranked below.
          </p>
        </div>
        {onRegenerate && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={onRegenerate} disabled={!!selecting}>
            <RefreshCw className="w-3 h-3" /> Regenerate
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-400 font-medium">Error</p>
            <p className="text-xs text-red-300/80">{error}</p>
          </div>
          {onClearError && (
            <button onClick={onClearError} className="text-red-400 hover:text-red-300 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {paths.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">No paths available.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paths.map((path) => {
            const Icon = CATEGORY_ICONS[path.category] || Sparkles;
            const easeLevel = path.ease_score >= 70 ? 'easy' : path.ease_score >= 40 ? 'medium' : 'advanced';
            const impactVal = formatCurrency(path.estimated_value_created);
            const isSelecting = selecting === path.id;

            return (
              <div
                key={path.id}
                className="rounded-xl p-4 flex flex-col border border-border hover:border-primary/30 transition-all min-w-0"
                style={{ backgroundColor: '#141418' }}
              >
                {/* Header */}
                <div className="flex items-start gap-2 mb-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="text-sm font-semibold min-w-0 break-words leading-snug">{path.title}</h4>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground mb-2 line-clamp-3 break-words">{path.description}</p>

                {/* Expected outcome */}
                {path.expected_outcome && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2 break-words">
                    <strong>Expected:</strong> {path.expected_outcome}
                  </p>
                )}

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 whitespace-nowrap ${EASE_BADGES[easeLevel]}`}>
                    {easeLevel}
                  </span>
                  {impactVal && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{impactVal}</span>
                  )}
                  {path.category && (
                    <span className="text-[10px] text-muted-foreground truncate">{path.category}</span>
                  )}
                </div>

                {/* Score */}
                <div className="flex items-center gap-1 mb-3 min-w-0">
                  <Sparkles className="w-3 h-3 text-primary shrink-0" />
                  <span className="text-[10px] text-primary font-medium truncate">
                    Score: {path.strategic_opportunity_score} · {path.confidence_score}% conf.
                  </span>
                </div>

                {/* Why Galileo recommended */}
                {onExplainWhy && (
                  <button
                    onClick={() => onExplainWhy(path)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary mb-2 transition-colors"
                  >
                    <Info className="w-3 h-3 shrink-0" /> Why did Galileo recommend this?
                  </button>
                )}

                {/* Actions */}
                <div className="mt-auto space-y-1.5 pt-1">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await base44.functions.invoke('savedPlaybookData', {
                          action: 'savePlaybookItem',
                          data: {
                            title: path.title,
                            content: path.description || path.expected_outcome || '',
                            category: path.category || 'strategy',
                            saved_from: 'sprint_path',
                            active_business_id: activeContext?.businessId || null,
                          },
                        });
                      } catch (err) { console.error('Save to playbook error:', err); }
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary w-full transition-colors"
                  >
                    <BookOpen className="w-3 h-3 shrink-0" /> Save to Playbook
                  </button>
                  <Button
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={(e) => { e.stopPropagation(); onSelect(path); }}
                    disabled={!!selecting}
                  >
                    {isSelecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {isSelecting ? 'Building Sprint...' : 'Select This Outcome'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center mt-4">
        Ranked by Galileo's Strategic Opportunity Score™ (Impact 35% · Ease 15% · Urgency 20% · Confidence 20% · Time-to-Value 10%)
      </p>
    </div>
  );
}