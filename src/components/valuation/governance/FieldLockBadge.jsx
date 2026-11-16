/**
 * FieldLockBadge — small inline indicator showing a field's lock status
 * and owner. Consumes the FieldEvidenceContext to look up governance data.
 *
 * Place next to any editable field to signal ownership and lock state.
 */
import React from 'react';
import { Lock, Unlock, Shield, Sparkles } from 'lucide-react';
import { useFieldEvidence } from './FieldEvidenceContext';

export default function FieldLockBadge({ fieldKey }) {
  const { governance } = useFieldEvidence();
  const record = governance?.getField?.(fieldKey);

  if (!record) return null;

  const isAI = record.source_of_truth === 'ai_extraction' || record.ai_recommendation_status === 'pending';

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        background: record.is_locked ? 'rgba(212,168,83,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${record.is_locked ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.06)'}`,
        color: record.is_locked ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
      }}
      title={record.is_locked
        ? `Locked by ${record.locked_by_name || 'advisor'} — ${record.change_reason || 'field locked'}`
        : `Unlocked — last modified by ${record.last_modified_by_name || 'advisor'}`}
    >
      {record.is_locked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
      {record.current_owner_name || 'Advisor'}
      {isAI && <Sparkles className="w-2.5 h-2.5 text-accent/70" />}
    </span>
  );
}