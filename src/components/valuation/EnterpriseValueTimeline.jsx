/**
 * EnterpriseValueTimeline — Phase 13.3D
 * Enhanced timeline showing published versions with delta intelligence,
 * value attribution, waterfall, and valuation stories.
 *
 * Flow per published version:
 *   Published Version → EV Delta → Confidence Delta →
 *   Value Attribution → Valuation Story → Advisor Notes → Supporting Evidence
 */
import React, { useState, useEffect } from 'react';
import { getValuationVersions, getValuationAuditLog, getVersionDeltas } from '@/lib/valuationService';
import { getCalculationSummary } from '@/lib/valuationCalculationService';
import { Loader2, TrendingUp, TrendingDown, FileText, Calculator, Award, ChevronDown, ChevronRight } from 'lucide-react';
import VersionDeltaPanel from './VersionDeltaPanel';

export default function EnterpriseValueTimeline({ valuationId }) {
  const [events, setEvents] = useState([]);
  const [deltas, setDeltas] = useState([]);
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const [versionsRes, auditRes, summaryRes, deltasRes] = await Promise.all([
        getValuationVersions(valuationId),
        getValuationAuditLog(valuationId),
        getCalculationSummary(valuationId),
        getVersionDeltas(valuationId).catch(() => ({ deltas: [] })),
      ]);

      setDeltas(deltasRes.deltas || []);

      const allEvents = [];

      // Published versions — with delta intelligence
      (versionsRes.versions || []).forEach((v) => {
        const delta = (deltasRes.deltas || []).find(d => d.current_version_id === v.id);
        allEvents.push({
          date: v.published_at,
          type: 'published',
          version_id: v.id,
          version_number: v.version_number,
          title: `Version ${v.version_number} Published`,
          description: v.version_label || '',
          icon: FileText,
          color: '#10B981',
          delta,
        });
      });

      // Calculation events from audit log
      (auditRes.logs || []).filter(l => l.action === 'calculation_saved').forEach((l) => {
        const details = l.action_details?.new || {};
        allEvents.push({
          date: l.acted_at,
          type: 'calculation',
          title: `Calculation: ${details.method || details.calculation_type || 'Unknown'}`,
          description: details.ev_mid ? `EV: $${Math.round(details.ev_mid).toLocaleString()}` : '',
          icon: Calculator,
          color: '#D4A853',
        });
      });

      // Value driver events
      (auditRes.logs || []).filter(l => l.action === 'value_driver_saved').forEach((l) => {
        allEvents.push({
          date: l.acted_at,
          type: 'value_driver',
          title: `Value Driver: ${l.action_details?.new?.driver_key || 'Identified'}`,
          description: '',
          icon: Award,
          color: '#00D4FF',
        });
      });

      // Sort by date descending
      allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
      setEvents(allEvents);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const formatCurrency = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + Math.round(n).toLocaleString();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Enterprise Value Timeline</h3>
        <p className="text-xs text-muted-foreground">
          Published versions with delta intelligence, value attribution, and valuation stories.
          Deltas are immutable derived artifacts — never computed against drafts or stale calculations.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-xs text-muted-foreground">
          No valuation events yet. Published versions, calculations, and value drivers will appear here.
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {events.map((event, idx) => {
              const Icon = event.icon || TrendingUp;
              const isExpanded = expandedVersion === event.version_id;
              const hasDelta = !!event.delta;
              return (
                <div key={idx} className="relative pl-12">
                  <div
                    className="absolute left-2 top-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: `${event.color}15`, border: `1px solid ${event.color}40` }}
                  >
                    <Icon className="w-3 h-3" style={{ color: event.color }} />
                  </div>

                  <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">{event.title}</p>
                          {hasDelta && (
                            <button
                              onClick={() => setExpandedVersion(isExpanded ? null : event.version_id)}
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                            >
                              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              Delta Intelligence
                            </button>
                          )}
                        </div>
                        {event.description && <p className="text-[11px] text-muted-foreground mt-0.5">{event.description}</p>}
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {new Date(event.date).toLocaleString()}
                        </p>
                        {/* Delta summary inline */}
                        {hasDelta && !isExpanded && event.delta?.delta_summary?.metrics && (
                          <div className="flex gap-3 mt-1.5">
                            {event.delta.delta_summary.metrics
                              .filter(m => m.metric === 'enterprise_value_mid' || m.metric === 'confidence')
                              .map((m, mi) => (
                                <span key={mi} className="text-[10px] text-muted-foreground">
                                  {m.metric === 'enterprise_value_mid' ? 'EV' : 'Conf'}: {' '}
                                  <span style={{ color: (m.absolute_delta || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                                    {m.percentage_delta != null ? `${m.percentage_delta}%` : '—'}
                                  </span>
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded delta intelligence */}
                    {isExpanded && hasDelta && (
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <VersionDeltaPanel valuationId={valuationId} currentVersionId={event.version_id} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}