/**
 * ValuationDetailsDrawer — Phase 13.3F.2
 *
 * Slide-over drawer for administrative details that should not dominate
 * the owner experience. Preserves all information without making it
 * primary content.
 */
import React from 'react';
import { X, Settings, User, GitBranch, FileText, Calendar, Shield } from 'lucide-react';
import { getLatestCalcVersion } from '@/lib/valuation/valuationState';

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[11px] text-muted-foreground/70 shrink-0 pr-3">{label}</span>
      <span className="text-[11px] text-foreground/90 text-right font-medium">{value || '—'}</span>
    </div>
  );
}

export default function ValuationDetailsDrawer({ open, onClose, summary, calcSummary }) {
  if (!open) return null;
  const valuation = summary?.valuation;
  const leadAdvisor = summary?.leadAdvisor;
  const advisorName = leadAdvisor ? `${leadAdvisor.first_name || ''} ${leadAdvisor.last_name || ''}`.trim() : null;
  const engineVersion = getLatestCalcVersion(calcSummary);
  const latestVersion = summary?.latestVersion;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div
        className="relative w-full max-w-md h-full overflow-y-auto p-6 animate-in slide-in-from-right"
        style={{ background: 'hsl(var(--card))', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Valuation Details</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1">
          <DetailRow label="Lifecycle Status" value={valuation?.status?.replace(/_/g, ' ')} />
          <DetailRow label="Sharing Status" value={(valuation?.client_sharing_status || 'not_shared').replace(/_/g, ' ')} />
          {latestVersion && <DetailRow label="Version ID" value={latestVersion.id} />}
          <DetailRow label="Version Number" value={latestVersion ? `v${latestVersion.version_number}` : 'Not published'} />
          <DetailRow label="Engine Version" value={engineVersion} />
          <DetailRow label="Methodology Version" value={calcSummary?.methodology_version || '—'} />
          <DetailRow label="Lead Advisor" value={advisorName || 'Unassigned'} />
          <DetailRow label="Engagement Type" value={valuation?.engagement_type?.replace(/_/g, ' ')} />
          <DetailRow label="Standard of Value" value={valuation?.standard_of_value?.replace(/_/g, ' ')} />
          <DetailRow label="Valuation Premise" value={valuation?.valuation_premise?.replace(/_/g, ' ')} />
          <DetailRow label="Valuation Date" value={valuation?.valuation_date ? new Date(valuation.valuation_date).toLocaleDateString() : '—'} />
          <DetailRow label="Last Updated" value={valuation?.updated_at ? new Date(valuation.updated_at).toLocaleString() : '—'} />
          <DetailRow label="Created" value={valuation?.created_date ? new Date(valuation.created_date).toLocaleDateString() : '—'} />
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.06]">
          <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
            These administrative details are preserved for audit and compliance purposes. They do not affect the
            valuation calculations, publication logic, or sharing status.
          </p>
        </div>
      </div>
    </div>
  );
}