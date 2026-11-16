/**
 * ValuationAccessHeader — Phase 13.3G.3
 *
 * Compact, inline access summary for the active valuation shell header.
 * Shows at a glance: Business Owner, Lead Advisor, Advisor count, Reviewer,
 * Publisher. Missing assignments show "Not Assigned".
 *
 * Authorized users see a "Manage Access" button that opens the ManageAccessSheet.
 * Read-only users see the summary without controls.
 *
 * Data is owned by the parent shell (ValuationExperienceShell) and passed in
 * via the `access` prop so the header refreshes immediately when assignments
 * change — no internal fetch, no polling, no page reload.
 */
import React from 'react';
import { Crown, ShieldCheck, Upload, Settings2, Loader2 } from 'lucide-react';

function MiniAvatar({ name }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
      style={{ background: 'rgba(255,255,255,0.06)', color: '#fff' }}
    >
      {initials}
    </div>
  );
}

function AccessChip({ icon: Icon, label, name, empty }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <Icon className="w-3 h-3 text-muted-foreground/50 shrink-0" />
      <div className="min-w-0">
        <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 leading-none">{label}</p>
        {empty ? (
          <p className="text-[10px] text-muted-foreground/50 italic leading-tight mt-0.5">Not Assigned</p>
        ) : (
          <p className="text-[10px] font-medium text-foreground truncate leading-tight mt-0.5">{name}</p>
        )}
      </div>
    </div>
  );
}

export default function ValuationAccessHeader({ access, loading, canManage, onManage }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Loader2 className="w-3 h-3 text-muted-foreground/40 animate-spin" />
      </div>
    );
  }

  if (!access) return null;

  const owners = access.owners || [];
  const primaryOwner = owners.find((o) => o.is_primary_owner) || owners[0] || null;
  const leadAdvisor = access.lead_advisor;
  const advisors = access.advisors || [];
  const reviewer = access.reviewer;
  const publisher = access.publisher;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <AccessChip icon={Crown} label="Owner" name={primaryOwner?.name} empty={!primaryOwner} />
      <AccessChip icon={Crown} label="Lead" name={leadAdvisor?.name} empty={!leadAdvisor} />
      {advisors.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex -space-x-1">
            {advisors.slice(0, 3).map((a, i) => (
              <div key={a.profile_id || i} className="ring-1 ring-background rounded-full">
                <MiniAvatar name={a.name} />
              </div>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">+{advisors.length}</span>
        </div>
      )}
      <AccessChip icon={ShieldCheck} label="Reviewer" name={reviewer?.name} empty={!reviewer} />
      <AccessChip icon={Upload} label="Publisher" name={publisher?.name} empty={!publisher} />
      {canManage && (
        <button
          onClick={onManage}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-1"
          style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.12)' }}
        >
          <Settings2 className="w-3 h-3" />
          Manage
        </button>
      )}
    </div>
  );
}