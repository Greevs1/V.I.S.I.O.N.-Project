/**
 * ExpertAdvisorsView
 * Portal for expert_advisor / advisor / admin / super_admin roles.
 * - expert_advisor / advisor: only sees their assigned clients
 * - admin / super_admin: sees all active assignments
 *
 * IQ Dashboard + Recent Activity are ALWAYS visible for any active assignment.
 * All other sections are permission-controlled.
 */
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import {
  User, Building, ChevronLeft, Loader2, Shield, Activity,
  FileText, ClipboardList, TrendingUp, FolderOpen, BookOpen,
  Target, BarChart3, Zap, LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ClientActivityFeed from '@/components/shared/ClientActivityFeed';
import OutcomeTrackingPanel from '@/components/admin/OutcomeTrackingPanel';
import ExpertClientDashboard from '@/components/expert/ExpertClientDashboard';
import ExpertClientDocuments from '@/components/expert/ExpertClientDocuments';
import ExpertClientAssessments from '@/components/expert/ExpertClientAssessments';
import ExpertClientSprint from '@/components/expert/ExpertClientSprint';
import ExpertClientResources from '@/components/expert/ExpertClientResources';
import ExpertClientOpportunities from '@/components/expert/ExpertClientOpportunities';
import ExpertClientHeader from '@/components/expert/ExpertClientHeader';
import OpportunityQueue from '@/components/admin/OpportunityQueue';
import WeeklyDigestCard from '@/components/digest/WeeklyDigestCard';
import AdvisorCommandCenter from '@/components/advisor/AdvisorCommandCenter';
import ClientNotesEditor from '@/components/notes/ClientNotesEditor';

// Optional (permission-gated) sections only — IQ + Activity are always shown
// Order matters — displayed left to right
const OPTIONAL_SECTION_CONFIG = {
  assessments:         { label: 'Assessments',         icon: BarChart3 },
  documents:           { label: 'Documents',           icon: FolderOpen },
  resources:           { label: 'Resources',           icon: BookOpen },
  sprints:             { label: '90-Day Sprints',      icon: Target },
  outcome_tracking:    { label: 'Outcome Tracking',    icon: TrendingUp },
  opportunities:       { label: 'Opportunities',       icon: Zap },
  strategy_expansions: { label: 'Strategy',            icon: Shield },
  freedom_projections: { label: 'Freedom Projections', icon: ClipboardList },
  galileo_summary:     { label: 'Galileo Summary',     icon: BarChart3 },
  notes:               { label: 'Notes',               icon: FileText },
};

const ALLOWED_ROLES = ['super_admin', 'admin', 'expert_advisor', 'advisor'];
const FILTERED_ROLES = ['expert_advisor', 'advisor'];

export default function ExpertAdvisorsView() {
  const { supabaseProfile } = useAuth();
  const appRole = supabaseProfile?.app_role;
  const isAdminLevel = appRole === 'super_admin' || appRole === 'admin';
  const isSuperAdmin = appRole === 'super_admin';
  const needsFilter = FILTERED_ROLES.includes(appRole);
  const [myProfileId, setMyProfileId] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [view, setView] = useState('command'); // 'command' | 'clients'

  // Resolve own profile id
  useEffect(() => {
    setProfileLoading(true);
    base44.functions.invoke('expertAdvisorAccess', { action: 'getMyProfileId' })
      .then(res => setMyProfileId(res.data?.profile_id || null))
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  // For admin/super_admin: show all active assignments
  const { data: adminClients, isLoading: adminLoading } = useQuery({
    queryKey: ['expert-all-clients'],
    queryFn: async () => {
      const res = await base44.functions.invoke('expertAdvisorAccess', { action: 'listAllAssignments' });
      return res.data?.access_records || [];
    },
    enabled: isAdminLevel,
    staleTime: 30000,
  });

  // For expert_advisor/advisor: only their own assigned clients
  const { data: myClients, isLoading: myLoading } = useQuery({
    queryKey: ['expert-my-clients', myProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('expertAdvisorAccess', {
        action: 'listMyClients',
        expert_profile_id: myProfileId,
      });
      return res.data?.access_records || [];
    },
    enabled: !isAdminLevel && !!myProfileId,
    staleTime: 30000,
  });

  const clients = isAdminLevel ? (adminClients || []) : (myClients || []);
  const isLoading = profileLoading || (isAdminLevel ? adminLoading : myLoading);

  // Gate: block disallowed roles
  if (appRole && !ALLOWED_ROLES.includes(appRole)) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-3">
        <Shield className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="text-sm text-muted-foreground">You do not have access to this area.</p>
      </div>
    );
  }

  if (selectedClient) {
    return (
      <ClientDetailView
        accessRecord={selectedClient}
        isAdminLevel={isAdminLevel}
        isSuperAdmin={isSuperAdmin}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Expert Advisor Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdminLevel ? 'All active expert advisor assignments.' : 'Your assigned clients and advisory access.'}
          </p>
        </div>
      </div>

      {/* Top-level nav: Command Center | Assigned Clients */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary w-fit">
        {[
          { id: 'command', label: 'Command Center' },
          { id: 'clients', label: 'Assigned Clients' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {/* Command Center */}
      {view === 'command' && (
        <AdvisorCommandCenter
          expertProfileId={myProfileId}
          onSelectClient={(summary) => {
            // Find matching client record and open detail view
            const match = clients.find(c =>
              c.client_email === summary.email ||
              c.client_profile_id === summary.profile_id
            );
            if (match) {
              setSelectedClient(match);
            } else if (isAdminLevel && clients.length > 0) {
              // For admin viewing all, synthesize minimal access record
              setSelectedClient({
                client_email: summary.email,
                client_name: summary.client_name,
                client_profile_id: summary.profile_id,
                business_id: summary.business_id,
                permissions: { iq_dashboard: true, activity_feed: true },
                access_status: 'active',
              });
            }
          }}
        />
      )}

      {/* Assigned Clients list */}
      {view === 'clients' && (
        <>
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && clients.length === 0 && (
            <div className="glass rounded-xl p-12 text-center space-y-2">
              <User className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">No clients assigned yet.</p>
              <p className="text-xs text-muted-foreground">
                {isAdminLevel
                  ? 'Assign advisors to clients via Admin → Users & Clients → Expert Advisors tab.'
                  : 'Contact your administrator to be assigned to a client.'}
              </p>
            </div>
          )}

          {!isLoading && clients.length > 0 && (
            <div className="space-y-3">
              {clients.map(record => {
                const permCount = Object.entries(record.permissions || {})
                  .filter(([k, v]) => v === true && !['iq_dashboard', 'activity_feed'].includes(k)).length;
                return (
                  <button
                    key={record.id}
                    onClick={() => setSelectedClient(record)}
                    className="w-full glass rounded-xl p-5 text-left hover:border-primary/30 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {(record.client_name || record.client_email || '?')[0]?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{record.client_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{record.client_email || '—'}</p>
                      {record.business_name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3" /> {record.business_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 block">
                        {record.access_status}
                      </span>
                      <p className="text-[10px] text-muted-foreground">IQ + Activity + {permCount} sections</p>
                      {isAdminLevel && record.expert_name && (
                        <p className="text-[10px] text-muted-foreground">Advisor: {record.expert_name}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Client Detail View ────────────────────────────────────────────────────────

function ClientDetailView({ accessRecord, isAdminLevel, isSuperAdmin, onBack }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [resolvedIqScore, setResolvedIqScore] = useState(null);
  const perms = accessRecord.permissions || {};

  // Build tab list: Overview always first, then IQ Dashboard + Activity Feed, then permitted optional sections
  const baseTabs = [
    { id: 'overview',      label: 'Overview',        icon: LayoutDashboard },
    { id: 'iq_dashboard',  label: 'IQ Dashboard',    icon: LayoutDashboard },
    { id: 'activity_feed', label: 'Recent Activity', icon: Activity },
  ];

  const optionalTabs = Object.entries(OPTIONAL_SECTION_CONFIG)
    .filter(([key]) => isAdminLevel || perms[key] === true)
    .map(([key, cfg]) => ({ id: key, ...cfg }));

  const allTabs = [...baseTabs, ...optionalTabs];

  // Keep active section valid — default to overview
  const currentSection = allTabs.find(t => t.id === activeSection) ? activeSection : 'overview';

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12">
      {/* Back button */}
      <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
        <ChevronLeft className="w-3.5 h-3.5" /> Back to Client List
      </Button>

      {/* Workspace Header — iqScore sourced from IQ Dashboard data */}
      <ExpertClientHeader accessRecord={accessRecord} iqScore={resolvedIqScore} />

      {/* Section Tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary overflow-x-auto">
        {allTabs.map(section => {
          const Icon = section.icon;
          const isBaseline = section.id === 'overview' || section.id === 'iq_dashboard' || section.id === 'activity_feed';
          const active = currentSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : isBaseline
                  ? 'text-emerald-400/80 hover:text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {section.label}
              {isBaseline && <span className="text-[9px] text-emerald-500/60">•</span>}
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      <SectionContent
        sectionId={currentSection}
        accessRecord={accessRecord}
        isSuperAdmin={isSuperAdmin}
        onIqScoreResolved={setResolvedIqScore}
      />
    </div>
  );
}

// ── Section Content ───────────────────────────────────────────────────────────

function SectionContent({ sectionId, accessRecord, isSuperAdmin, onIqScoreResolved }) {
  const { supabaseProfile } = useAuth();
  const clientProfileId = accessRecord.client_profile_id;
  const clientBusinessId = accessRecord.business_id;
  const clientEmail = accessRecord.client_email;

  // ── Always-on: Overview (Digest + Activity) ───────────────────────────────
  if (sectionId === 'overview') {
    return (
      <div className="space-y-4">
        <WeeklyDigestCard
          profileId={clientProfileId}
          businessId={clientBusinessId}
          userEmail={clientEmail}
          isSuperAdmin={isSuperAdmin}
          readOnly={true}
        />
        <div className="glass rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Recent Activity</p>
          <ClientActivityFeed
            profileId={clientProfileId}
            businessId={clientBusinessId}
            mode="expert_advisor"
            limit={15}
          />
        </div>
      </div>
    );
  }

  // ── Always-on: IQ Dashboard ───────────────────────────────────────────────
  if (sectionId === 'iq_dashboard') {
    return (
      <ExpertClientDashboard
        clientProfileId={clientProfileId}
        clientBusinessId={clientBusinessId}
        clientEmail={clientEmail}
        clientName={accessRecord.client_name}
        onIqScoreResolved={onIqScoreResolved}
      />
    );
  }

  // ── Always-on: Recent Activity ────────────────────────────────────────────
  if (sectionId === 'activity_feed') {
    return (
      <div className="glass rounded-xl p-5">
        <p className="text-sm font-semibold mb-4">Recent Activity</p>
        <ClientActivityFeed
          profileId={clientProfileId}
          businessId={clientBusinessId}
          mode="expert_advisor"
          limit={30}
        />
      </div>
    );
  }

  // ── Permission-gated: Assessments ────────────────────────────────────────
  if (sectionId === 'assessments') {
    return <ExpertClientAssessments clientProfileId={clientProfileId} />;
  }

  // ── Permission-gated: Documents ───────────────────────────────────────────
  if (sectionId === 'documents') {
    return <ExpertClientDocuments clientProfileId={clientProfileId} clientBusinessId={clientBusinessId} clientEmail={clientEmail} />;
  }

  // ── Permission-gated: Resources ───────────────────────────────────────────
  if (sectionId === 'resources') {
    return <ExpertClientResources clientProfileId={clientProfileId} clientBusinessId={clientBusinessId} clientEmail={clientEmail} />;
  }

  // ── Permission-gated: 90-Day Sprints ─────────────────────────────────────
  if (sectionId === 'sprints') {
    return <ExpertClientSprint clientProfileId={clientProfileId} />;
  }

  // ── Permission-gated: Outcome Tracking ───────────────────────────────────
  if (sectionId === 'outcome_tracking') {
    return (
      <OutcomeTrackingPanel
        targetProfileId={clientProfileId}
        targetBusinessId={clientBusinessId}
        clientName={accessRecord.client_name}
        clientEmail={accessRecord.client_email}
        isSuperAdmin={false}
      />
    );
  }

  // ── Permission-gated: Opportunities — reuse exact same component as Admin view ──
  if (sectionId === 'opportunities') {
    return <OpportunityQueue userEmail={clientEmail} />;
  }

  // ── Permission-gated: Notes ───────────────────────────────────────────────
  if (sectionId === 'notes') {
    return (
      <ClientNotesEditor
        profileId={clientProfileId}
        businessId={clientBusinessId}
        currentUserName={supabaseProfile?.full_name || supabaseProfile?.email || ''}
        currentUserProfileId={supabaseProfile?.id || null}
      />
    );
  }

  // Placeholder for remaining sections (strategy, freedom, galileo)
  const cfg = OPTIONAL_SECTION_CONFIG[sectionId];
  return (
    <div className="glass rounded-xl p-10 text-center space-y-2">
      <p className="text-sm text-muted-foreground">{cfg?.label || sectionId} — coming soon.</p>
      <p className="text-xs text-muted-foreground">Contact your administrator for more information.</p>
    </div>
  );
}