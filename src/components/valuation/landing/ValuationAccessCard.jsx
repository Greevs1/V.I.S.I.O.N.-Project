/**
 * ValuationAccessCard — Phase 13.3G.3
 *
 * Compact, calm access card for the Business Valuation landing page.
 * Shows at a glance:
 *   - Business name + status
 *   - Business Owner (or "No business owner linked")
 *   - Lead Advisor (or "No lead advisor assigned")
 *   - Additional Advisors (count + avatars)
 *   - Reviewer (or "Not assigned")
 *   - Publisher (or "Not assigned")
 *   - Client Access state (Not Shared / Shared / Revoked)
 *
 * Authorized users see a "Manage Access" button that opens the
 * ManageAccessSheet. Read-only users see the same card without the button.
 *
 * Data source: getValuationAccessSummary (backend-mediated).
 * Does NOT duplicate the AssignmentConsole — the sheet reuses it.
 */
import React, { useEffect, useState } from 'react';
import { Building2, User, Crown, Users, ShieldCheck, Upload, Share2, Settings2, UserPlus, Loader2 } from 'lucide-react';
import { getValuationAccessSummary } from '@/lib/valuationService';

function Avatar({ name, size = 'sm' }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
    >
      {initials}
    </div>
  );
}

function Row({ icon: Icon, label, value, sub, empty, emptyAction, onEmptyAction }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
        {empty ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground/50 italic">{empty}</p>
            {emptyAction && (
              <button
                onClick={onEmptyAction}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <UserPlus className="w-2.5 h-2.5" />
                {emptyAction}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs font-medium text-foreground truncate">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}

const ACCESS_LABELS = {
  not_shared: { label: 'Not Shared', color: '#6B7280' },
  shared: { label: 'Shared', color: '#22c55e' },
  revoked: { label: 'Revoked', color: '#EF4444' },
};

export default function ValuationAccessCard({ valuationId, canManage, onManage, access: preloadedAccess }) {
  const [access, setAccess] = useState(preloadedAccess || null);
  const [loading, setLoading] = useState(!preloadedAccess);

  useEffect(() => {
    if (preloadedAccess) { setAccess(preloadedAccess); setLoading(false); return; }
    if (!valuationId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getValuationAccessSummary(valuationId)
      .then((res) => { if (!cancelled) setAccess(res); })
      .catch(() => { if (!cancelled) setAccess(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [valuationId, preloadedAccess]);

  if (loading) {
    return (
      <div className="rounded-xl p-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!access) {
    return (
      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs text-muted-foreground">Unable to load access summary.</p>
      </div>
    );
  }

  const owners = access.owners || [];
  const primaryOwner = owners.find((o) => o.is_primary_owner) || owners[0] || null;
  const leadAdvisor = access.lead_advisor;
  const advisors = access.advisors || [];
  const reviewer = access.reviewer;
  const publisher = access.publisher;
  const clientAccess = access.client_access || {};
  const accessMeta = ACCESS_LABELS[clientAccess.status] || ACCESS_LABELS.not_shared;
  const business = access.business;

  return (
    <div
      className="rounded-xl p-4 space-y-1"
      style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary/70" />
          <h3 className="text-sm font-semibold text-foreground">Valuation Access</h3>
        </div>
        {canManage && (
          <button
            onClick={onManage}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 className="w-3 h-3" />
            Manage Access
          </button>
        )}
      </div>

      {/* Business */}
      <Row
        icon={Building2}
        label="Business"
        value={business?.name || 'Unknown'}
        sub={business?.industry || ''}
      />

      {/* Business Owner */}
      {primaryOwner ? (
        <Row
          icon={User}
          label="Business Owner"
          value={primaryOwner.name}
          sub={`${primaryOwner.role || 'Owner'}${primaryOwner.is_primary_owner ? ' · Primary' : ''}${primaryOwner.ownership_percentage ? ` · ${primaryOwner.ownership_percentage}%` : ''}`}
        />
      ) : (
        <Row
          icon={User}
          label="Business Owner"
          empty="No business owner linked"
          emptyAction={canManage ? 'Assign' : null}
          onEmptyAction={onManage}
        />
      )}

      {/* Lead Advisor */}
      {leadAdvisor ? (
        <Row
          icon={Crown}
          label="Lead Advisor"
          value={leadAdvisor.name}
          sub={leadAdvisor.email}
        />
      ) : (
        <Row
          icon={Crown}
          label="Lead Advisor"
          empty="No lead advisor assigned"
          emptyAction={canManage ? 'Assign' : null}
          onEmptyAction={onManage}
        />
      )}

      {/* Additional Advisors */}
      {advisors.length > 0 && (
        <div className="flex items-center gap-2.5 py-1.5">
          <Users className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Additional Advisors</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex -space-x-1.5">
                {advisors.slice(0, 4).map((a, i) => (
                  <div key={a.profile_id || i} className="ring-1 ring-background rounded-full">
                    <Avatar name={a.name} />
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {advisors.length} advisor{advisors.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Reviewer */}
      <Row
        icon={ShieldCheck}
        label="Reviewer"
        value={reviewer?.name}
        sub={reviewer?.email}
        empty={reviewer ? null : 'Not assigned'}
      />

      {/* Publisher */}
      <Row
        icon={Upload}
        label="Publisher"
        value={publisher?.name}
        sub={publisher?.email}
        empty={publisher ? null : 'Not assigned'}
      />

      {/* Client Access */}
      <div className="flex items-center gap-2.5 py-1.5">
        <Share2 className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Client Access</p>
          <p className="text-xs font-medium" style={{ color: accessMeta.color }}>{accessMeta.label}</p>
        </div>
      </div>
    </div>
  );
}