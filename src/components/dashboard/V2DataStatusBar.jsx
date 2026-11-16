import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';

/**
 * Displays data freshness + confidence indicators when V2 snapshot data exists.
 * Renders nothing when no V2 data is available — purely additive.
 */
export default function V2DataStatusBar({ latestSnapshot }) {
  if (!latestSnapshot?.snapshot_date) return null;

  const snapshotDate = new Date(latestSnapshot.snapshot_date);
  const now = new Date();
  const daysDiff = Math.floor((now - snapshotDate) / (1000 * 60 * 60 * 24));
  const isStale = daysDiff > 90;
  const confidence = latestSnapshot.data_confidence ?? latestSnapshot.confidence_score ?? null;
  const isLowConfidence = confidence != null && confidence < 60;

  const formattedDate = snapshotDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {/* Data freshness */}
      <span className={`flex items-center gap-1 ${isStale ? 'text-amber-400' : 'text-emerald-400'}`}>
        <Clock className="w-3 h-3" />
        Data as of {formattedDate}
        {isStale && ` (${daysDiff}d ago)`}
      </span>

      {/* Confidence indicator */}
      {confidence != null && (
        <span className={`flex items-center gap-1 ${isLowConfidence ? 'text-amber-400' : 'text-muted-foreground'}`}>
          {isLowConfidence && <AlertCircle className="w-3 h-3" />}
          {confidence}% data confidence
          {isLowConfidence && ' — complete more assessments for higher accuracy'}
        </span>
      )}
    </div>
  );
}