/**
 * ExpertNetwork — top-level router for the Expert Network section.
 * Tabs: Find an Expert | My Experts | Apply as an Expert
 */
import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useMembership } from '@/lib/useMembership';
import FindAnExpert from '@/components/expert-network/FindAnExpert';
import MyExperts from '@/components/expert-network/MyExperts';
import ApplyAsExpert from '@/components/expert-network/ApplyAsExpert';
import PremiumWorkspaceOverlay from '@/components/premium/PremiumWorkspaceOverlay';
import { Search, Users, UserPlus } from 'lucide-react';

const TABS = [
  { id: 'find',  label: 'Find an Expert',    icon: Search },
  { id: 'mine',  label: 'My Experts',         icon: Users },
  { id: 'apply', label: 'Apply as an Expert', icon: UserPlus },
];

const TAB_PARAM_MAP = { mine: 'mine', apply: 'apply', find: 'find' };

export default function ExpertNetwork({ payload = null, initialTab = null }) {
  const { isPaid } = useMembership();
  const urlParams = new URLSearchParams(window.location.search);
  const paramTab = urlParams.get('tab') || initialTab;
  // A Sprint task can arrive carrying the expertise it recommended (workspace
  // payload, or ?expertise= on its own route).
  const requestedExpertise = payload || urlParams.get('expertise') || null;
  const [activeTab, setActiveTab] = useState(TAB_PARAM_MAP[paramTab] || 'find');

  const gated = !isPaid && (activeTab === 'find' || activeTab === 'mine');

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-display font-bold">V.I.S.I.O.N. Expert Network</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vetted professionals across tax, wealth, operations, exit planning, protection, and more.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {requestedExpertise && !gated && (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-white/40">Requested expertise</p>
          <p className="text-sm font-medium text-cyan-300">{requestedExpertise}</p>
          <p className="mt-0.5 text-[11.5px] text-white/40">
            From your 90-Day Sprint. Specialists listed below cover this and adjacent expertise.
          </p>
        </div>
      )}

      {/* Content — premium overlay (page loads blurred, overlay shown for free members) */}
      <PremiumWorkspaceOverlay isPaid={!gated} feature="Expert Network"
        onScheduleCall={() => { window.location.href = '/strategy-call'; }}
        onBecomeMember={() => { window.location.href = '/strategy-call'; }}>
        {activeTab === 'find'  && <FindAnExpert key={requestedExpertise || 'all'} initialSpecialty={requestedExpertise} />}
        {activeTab === 'mine'  && <MyExperts />}
        {activeTab === 'apply' && <ApplyAsExpert />}
      </PremiumWorkspaceOverlay>
    </div>
  );
}