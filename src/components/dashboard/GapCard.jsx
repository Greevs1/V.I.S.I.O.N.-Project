import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

const severityColors = {
  small: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  moderate: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  significant: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function GapCard({ title, severity, highlight, highlightLabel, secondary, secondaryLabel, detail, detailColor = 'text-primary', link }) {
  return (
    <Link to={link} className="block">
      <div className="glass rounded-xl p-5 hover:border-primary/20 transition-all group h-full">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium text-primary">{title}</p>
          {severity && (
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${severityColors[severity]}`}>
              {severity}
            </Badge>
          )}
        </div>
        <p className="text-2xl font-display font-bold text-cyan-gradient mb-1">{highlight}</p>
        {highlightLabel && <p className="text-xs text-muted-foreground mb-2">{highlightLabel}</p>}
        {secondary && (
          <>
            <p className="text-lg font-semibold text-foreground">{secondary}</p>
            {secondaryLabel && <p className="text-xs text-muted-foreground mb-2">{secondaryLabel}</p>}
          </>
        )}
        {detail && <p className={`text-xs mt-2 ${detailColor}`}>{detail}</p>}
      </div>
    </Link>
  );
}