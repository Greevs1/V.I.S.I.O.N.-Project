import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  Users, FileText, Activity, ClipboardList, FolderOpen,
  BarChart2, Link2, Palette, Code2
} from 'lucide-react';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminUserProfileContext from '@/components/admin/AdminUserProfileContext';
import AdminWorksheets from '@/components/admin/AdminWorksheets';
import AdminActivityLog from '@/components/admin/AdminActivityLog';
import AdminAnalytics from '@/components/admin/AdminAnalytics';
import AdminFiles from '@/components/admin/AdminFiles';
import AdminBranding from '@/components/admin/AdminBranding';
import AdminIntegrations from '@/components/admin/AdminIntegrations';
import StrategyLibraryManager from '@/pages/admin/StrategyLibraryManager';
import ExpansionEngineTestPanel from '@/pages/admin/ExpansionEngineTestPanel';
import AdvisorCommandCenter from '@/components/advisor/AdvisorCommandCenter';
import QACommandCenter from '@/components/admin/QACommandCenter';
import ExpertApplicationsManager from '@/components/admin/ExpertApplicationsManager';
import SprintVerificationQueue from '@/components/sprint/SprintVerificationQueue';
import { Brain, Layers, Crosshair, Network, ShieldCheck, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const ALL_TABS = [
  { id: 'users',        label: 'Users & Clients',    icon: Users,         superAdminOnly: false },
  { id: 'command',      label: 'Command Center',     icon: Crosshair,     superAdminOnly: false },
  { id: 'worksheets',   label: 'Worksheets',         icon: ClipboardList, superAdminOnly: false },
  { id: 'files',        label: 'Files',              icon: FolderOpen,    superAdminOnly: false },
  { id: 'activity',     label: 'Activity Log',       icon: Activity,      superAdminOnly: false },
  { id: 'analytics',    label: 'Analytics & Reports', icon: BarChart2,    superAdminOnly: false },
  { id: 'integrations', label: 'Integrations',       icon: Link2,         superAdminOnly: false },
  { id: 'branding',     label: 'Branding',           icon: Palette,       superAdminOnly: true },
  { id: 'strategy',     label: 'Strategy Library',   icon: Brain,         superAdminOnly: true },
  { id: 'expansion',    label: 'Expansion Engine',   icon: Layers,        superAdminOnly: true },
  { id: 'sprint_verify', label: 'Sprint Verification', icon: ShieldCheck,   superAdminOnly: false },
  { id: 'expert_apps',  label: 'Expert Network',      icon: Network,       superAdminOnly: false },
  { id: 'developer',    label: 'Developer',            icon: Code2,         superAdminOnly: true },
];

/**
 * AdminView — the EXISTING Admin surface. Its tabs, data fetching, backend calls,
 * authorization and role filtering are unchanged.
 *
 * TWO HOSTS, ONE IMPLEMENTATION
 *   · the legacy /admin route (no props below) — behaviour identical to before
 *   · the VISION Admin workspace (AdminWorkspaceHost), which passes the
 *     administrative subject it read from the workspace URL and is told when the
 *     admin picks a different one, so the LAYER can carry it in the trail.
 * Both props are optional and additive: without them this component behaves
 * exactly as it always did.
 */
export default function AdminView({ initialSubject = null, onSubjectChange } = {}) {
  const { supabaseProfile } = useAuth();
  const isSuperAdmin = supabaseProfile?.app_role === 'super_admin';
  const TABS = ALL_TABS.filter(t => !t.superAdminOnly || isSuperAdmin);

  const [activeTab, setActiveTab] = useState('users');
  // The administrative SUBJECT — the user/client being inspected. It is local to
  // this surface and is never written to the owner-facing business context. The
  // host remounts this component when the URL names a different subject, so no
  // synchronisation effect is needed here.
  const [selectedUserContext, setSelectedUserContext] = useState(initialSubject || null);

  // Load pending sprint count for badge
  const { data: pendingSprintCount = 0 } = useQuery({
    queryKey: ['sprint-pending-count'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSprintVerificationQueue', { mode: 'admin' });
      const sprints = res.data?.sprints || [];
      return sprints.filter(s =>
        s.needs_expert_review === true ||
        s.verification_status === 'galileo_verified_pending_expert' ||
        s.verification_status === 'expert_changes_requested'
      ).length;
    },
    staleTime: 60_000,
  });

  // If the current active tab becomes hidden (role downgrade), reset to users
  React.useEffect(() => {
    if (!TABS.find(t => t.id === activeTab)) setActiveTab('users');
  }, [isSuperAdmin]);

  // Report the administrative subject to the host, so the workspace layer can
  // reflect it as a level (and Back walks out of it). Reporting only — the host
  // decides what the layer does, and the owner-facing business context is never
  // involved. No prop supplied (the /admin route) → nothing happens.
  useEffect(() => {
    onSubjectChange?.(selectedUserContext);
  }, [selectedUserContext, onSubjectChange]);

  // Block super_admin-only tab content from rendering for non-super_admins
  const superAdminOnlyIds = ['branding', 'strategy', 'expansion', 'developer'];
  const isTabBlocked = (tabId) => superAdminOnlyIds.includes(tabId) && !isSuperAdmin;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold">Admin View</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage users, team members, and client agreements.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const showBadge = tab.id === 'sprint_verify' && pendingSprintCount > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {showBadge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
                  {pendingSprintCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* User Profile Context Panel (replaces tab content when a user is selected) */}
      {selectedUserContext && (
        <AdminUserProfileContext
          selectedUser={selectedUserContext}
          onBack={() => setSelectedUserContext(null)}
        />
      )}

      {/* Tab Content — hidden while viewing a user profile */}
      {!selectedUserContext && activeTab === 'users'        && <AdminUsers onViewUser={setSelectedUserContext} />}
      {!selectedUserContext && activeTab === 'command'      && (
        <AdvisorCommandCenter
          onSelectClient={(summary) => {
            // Map command center summary to AdminUsers selectedUser shape
            setSelectedUserContext({ email: summary.email, full_name: summary.client_name, id: summary.profile_id });
            setActiveTab('users');
          }}
        />
      )}
      {!selectedUserContext && activeTab === 'worksheets'   && <AdminWorksheets />}
      {!selectedUserContext && activeTab === 'files'        && <AdminFiles />}
      {!selectedUserContext && activeTab === 'activity'     && <AdminActivityLog />}
      {!selectedUserContext && activeTab === 'analytics'    && <AdminAnalytics />}
      {!selectedUserContext && activeTab === 'integrations' && <AdminIntegrations />}
      {!selectedUserContext && activeTab === 'branding'     && !isTabBlocked('branding')   && <AdminBranding />}
      {!selectedUserContext && activeTab === 'strategy'     && !isTabBlocked('strategy')   && <StrategyLibraryManager />}
      {!selectedUserContext && activeTab === 'expansion'    && !isTabBlocked('expansion')  && <ExpansionEngineTestPanel />}
      {!selectedUserContext && activeTab === 'sprint_verify' && (
        <SprintVerificationQueue
          onReviewSprint={(sprint) => {
            // Navigate to the client's admin profile context
            setSelectedUserContext({
              email: sprint.client_email || '',
              full_name: sprint.client_name || sprint.path_title || '—',
              id: sprint.profile_id || null,
            });
            setActiveTab('users');
          }}
        />
      )}
      {!selectedUserContext && activeTab === 'expert_apps'  && <ExpertApplicationsManager />}
      {!selectedUserContext && activeTab === 'developer'    && !isTabBlocked('developer')  && <DeveloperTab />}
    </div>
  );
}

function AdminPlaceholder({ title, desc }) {
  return (
    <div className="rounded-xl border border-border bg-card p-12 text-center space-y-2">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function DeveloperTab() {
  return (
    <div className="space-y-6">
      <QACommandCenter />
      <DeveloperToolsSection />
    </div>
  );
}

function DeveloperToolsSection() {
  const appId = typeof window !== 'undefined' ? window.location.hostname.split('.')[0] : 'your-app';
  const [regenerating, setRegenerating] = useState(false);
  const [regenResult, setRegenResult] = useState(null);

  const handleRegenerateIQ = async () => {
    setRegenerating(true);
    setRegenResult(null);
    try {
      const res = await base44.functions.invoke('regenerateCiqMetrics', {});
      setRegenResult(res.data);
    } catch (error) {
      setRegenResult({ error: error.message });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">API & Developer Settings</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">App ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground">{appId}</code>
              <button onClick={() => navigator.clipboard.writeText(appId)} className="text-xs text-primary hover:underline">Copy</button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Backend Functions</label>
            <div className="space-y-1">
              {['profitBenchmark', 'valueBenchmark', 'regenerateCiqMetrics', 'saveAssessmentToSupabase', 'supabaseUserData', 'supabaseHealthCheck', 'debugSupabaseWrite'].map(fn => (
                <div key={fn} className="flex items-center justify-between bg-secondary border border-border rounded-lg px-3 py-2">
                  <code className="text-xs font-mono text-foreground">{fn}</code>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">Active</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Environment</label>
            <div className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground">
              NODE_ENV=production · Platform V3+
            </div>
          </div>
          
          {/* IQ™ Regeneration Action */}
          <div className="pt-4 border-t border-border space-y-4">
            <div>
              <h4 className="text-xs font-semibold mb-3">IQ™ Aggregation</h4>
              <button
                onClick={handleRegenerateIQ}
                disabled={regenerating}
                className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {regenerating ? 'Regenerating...' : 'Regenerate IQ™ + Dashboard Metrics'}
              </button>
              
              {regenResult && (
                <div className="mt-3 bg-secondary border border-border rounded-lg p-3 space-y-2">
                  {regenResult.error ? (
                    <p className="text-xs text-destructive">Error: {regenResult.error}</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">IQ™ Score</span>
                        <span className="text-xs font-semibold">{regenResult.ciq_score ?? 'N/A'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Scores Used</span>
                        <span className="text-xs font-mono">{JSON.stringify(regenResult.scores_used || {})}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Dashboard Metrics</span>
                        <span className={`text-xs ${regenResult.dashboard_metrics_updated ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {regenResult.dashboard_metrics_updated ? 'Updated' : 'Not updated'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Snapshot Created</span>
                        <span className={`text-xs ${regenResult.snapshot_created ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {regenResult.snapshot_created ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Assessments Found</span>
                        <span className="text-xs font-semibold">{regenResult.assessment_count}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Sprint Verification Migration */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-semibold mb-1">Sprint Verification Columns</h4>
              <p className="text-[10px] text-muted-foreground mb-2">
                To fully enable sprint verification, run this SQL in your Supabase SQL Editor (Database → SQL Editor):
              </p>
              <pre className="text-[10px] font-mono bg-black/40 border border-border rounded-lg p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap select-all">
            {`ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'galileo_verified_pending_expert';
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS needs_expert_review BOOLEAN DEFAULT TRUE;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified BOOLEAN DEFAULT FALSE;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified_by TEXT;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS expert_verified_at TIMESTAMPTZ;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_notes TEXT;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_profile_id TEXT;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_name TEXT;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_email TEXT;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_role TEXT;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS assigned_verifier_at TIMESTAMPTZ;
            ALTER TABLE ninety_day_sprint_paths ADD COLUMN IF NOT EXISTS verification_assignment_status TEXT DEFAULT 'unassigned';`}
              </pre>
            </div>

            {/* Sample Extracted Fields Generator */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-semibold mb-3">Phase 2.3 Testing</h4>
              <button
                onClick={async () => {
                  try {
                    const res = await base44.functions.invoke('createSampleExtractedFields', {});
                    alert(res.data?.created ? `Created ${res.data.count} sample fields for ${res.data.document.name}` : `Failed: ${res.data.error}`);
                  } catch (error) {
                    alert(`Error: ${error.message}`);
                  }
                }}
                className="w-full bg-accent text-accent-foreground rounded-lg px-4 py-2.5 text-xs font-medium hover:bg-accent/90 transition-colors"
              >
                Create Sample Extracted Fields
              </button>
              <p className="text-[10px] text-muted-foreground mt-2">
                Creates 5 sample extracted fields (annual_revenue, gross_profit, net_profit, total_expenses, owner_compensation) for the most recent profit_and_loss document.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}