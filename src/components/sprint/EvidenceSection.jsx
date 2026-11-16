import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Sparkles, FileText, BarChart3, Target } from 'lucide-react';

const SOURCE_ICONS = {
  uploaded_document: FileText,
  assessment: BarChart3,
  dashboard_metrics: Target,
  industry_benchmark: Sparkles,
};

export default function EvidenceSection({ reason, evidence, impact, confidence }) {
  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(() => {
    if (!evidence) return [];
    if (typeof evidence === 'string') {
      try { return JSON.parse(evidence); } catch { return []; }
    }
    return Array.isArray(evidence) ? evidence : [];
  }, [evidence]);

  if (!reason && parsed.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Sparkles className="w-3 h-3" />
        Why Galileo recommended this
      </button>
      {expanded && (
        <div className="mt-1.5 ml-1 pl-3 border-l border-primary/20 space-y-2">
          {reason && <p className="text-[11px] text-muted-foreground leading-relaxed">{reason}</p>}
          {parsed.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Supporting Evidence</p>
              {parsed.map((e, i) => {
                const Icon = SOURCE_ICONS[e.source] || Sparkles;
                return (
                  <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <Icon className="w-3 h-3 text-primary/50 shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground/80">{e.field}</span>: {e.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3">
            {impact && (
              <span className="text-[10px]">
                <span className="text-muted-foreground/70">Impact: </span>
                <span className="text-emerald-400 font-medium">{impact}</span>
              </span>
            )}
            {confidence != null && (
              <span className="text-[10px]">
                <span className="text-muted-foreground/70">Confidence: </span>
                <span className={`font-medium ${confidence >= 70 ? 'text-emerald-400' : confidence >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                  {confidence}%
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}