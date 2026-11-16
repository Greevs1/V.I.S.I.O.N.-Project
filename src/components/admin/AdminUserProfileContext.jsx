import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, FileText, X, Loader2, CheckCircle, AlertCircle,
  User, Building, Briefcase, Calendar, DollarSign, TrendingUp,
  Target, ClipboardList, ShieldCheck, FolderOpen, FilePenLine,
  MessageSquare, BarChart3, Map, Cpu, RefreshCw, BookOpen, Edit3, Check,
  Trash2, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import AdminAgreements from './AdminAgreements';
import OpportunityQueue from './OpportunityQueue';
import OutcomeTrackingPanel from './OutcomeTrackingPanel';
import ExpertAdvisorAccessManager from './ExpertAdvisorAccessManager';
import ClientActivityFeed from '@/components/shared/ClientActivityFeed';
import { useAuth } from '@/lib/AuthContext';
import DeleteWorksheetAssignmentModal from './DeleteWorksheetAssignmentModal';
import AdminWorksheetResponseModal from './AdminWorksheetResponseModal';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { useDocumentViewer } from '@/hooks/useDocumentViewer';
import WeeklyDigestCard from '@/components/digest/WeeklyDigestCard';
import ClientNotesEditor from '@/components/notes/ClientNotesEditor';
import MeetingBriefPanel from '@/components/advisor/MeetingBriefPanel';

const DOCUMENT_TYPES = [
  { value: 'agreement', label: 'Agreement' },
  { value: 'client_agreement', label: 'Client Agreement' },
  { value: 'engagement_letter', label: 'Engagement Letter' },
  { value: 'verification_document', label: 'Verification Document' },
  { value: 'business_tax_return', label: 'Business Tax Return' },
  { value: 'personal_tax_return', label: 'Personal Tax Return' },
  { value: 'profit_and_loss', label: 'Profit & Loss' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'debt_schedule', label: 'Debt Schedule' },
  { value: 'payroll_report', label: 'Payroll Report' },
  { value: 'insurance_document', label: 'Insurance Document' },
  { value: 'entity_document', label: 'Entity Document' },
  { value: 'buy_sell_agreement', label: 'Buy-Sell Agreement' },
  { value: 'estate_document', label: 'Estate Document' },
  { value: 'other', label: 'Other' }
];

const SECTIONS = [
  { id: 'overview',      label: 'Overview',          icon: User },
  { id: 'documents',     label: 'Documents',         icon: FolderOpen },
  { id: 'resources',     label: 'Resources',         icon: BookOpen },
  { id: 'worksheets',    label: 'Worksheets',        icon: ClipboardList },
  { id: 'agreements',    label: 'Agreements',        icon: FilePenLine },
  { id: 'outcomes',      label: 'Outcome Tracking',  icon: Target },
  { id: 'expert_access', label: 'Expert Advisors',   icon: ShieldCheck },
  { id: 'extracted',     label: 'Extracted Fields',  icon: Cpu },
  { id: 'assessments',   label: 'Assessments',       icon: BarChart3 },
  { id: 'opportunities', label: 'Opportunities',     icon: TrendingUp },
  { id: 'actions',       label: 'Next Best Actions', icon: Target },
  { id: 'metrics',       label: 'Dashboard Metrics', icon: DollarSign },
  { id: 'notes',         label: 'Notes',             icon: FileText },
];

export default function AdminUserProfileContext({ selectedUser, onBack }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [docType, setDocType] = useState('other');
  const [uploadProgress, setUploadProgress] = useState({});
  const [activeSection, setActiveSection] = useState('overview');
  const [deletingWorksheet, setDeletingWorksheet] = useState(null);
  const [deletingResource, setDeletingResource] = useState(null);
  const [viewingResponse, setViewingResponse] = useState(null);
  const [worksheetSubTab, setWorksheetSubTab] = useState('assigned');
  const [localResources, setLocalResources] = useState(null); // optimistic local override
  const [localWorksheets, setLocalWorksheets] = useState(null); // optimistic local override
  const [editingRole, setEditingRole] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState(null);
  const [roleSuccess, setRoleSuccess] = useState(null);

  // Use centralized document viewer hook
  const {
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    openDocumentViewer,
    closeDocumentViewer,
    downloadDocument,
    openDocumentInNewTab,
  } = useDocumentViewer();

  // ── Documents (P5) ────────────────────────────────────────────────────────
  // A client's document row opens THE DOCUMENT through the one existing viewer,
  // by its exact documents.id. The stored 24-hour file_url is withheld at THIS
  // call site only, so the back-end decision (S3.1 getDocumentSignedUrl → the
  // persisted row's own business and approved bucket) is the only route to a
  // preview: a document the back end refuses leaves no URL and the viewer shows
  // its existing generic error state. Nothing here authorizes, and no business
  // context is read or written.
  // Persisted identity (documents.id) is the ONLY precondition for ATTEMPTING a
  // resolution. file_url is deliberately not trusted, and file_path is storage
  // metadata — neither may suppress the attempt. If the shared hook cannot
  // resolve the row it fails safely, in its existing generic error state.
  const handleOpenDocument = (doc) => {
    if (!doc?.id) return;
    openDocumentViewer({ ...doc, file_url: null });
  };

  // Fetch current user's Supabase profile for role verification
  const { data: currentUserProfile } = useQuery({
    queryKey: ['current-user-profile', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const res = await base44.functions.invoke('supabaseProfileData', {
        action: 'getProfile',
        _router_user_email: currentUser.email,
      });
      return res.data?.profile || null;
    },
    enabled: !!currentUser?.email,
  });

  const VALID_ROLES = ['super_admin', 'admin', 'owner', 'team_member', 'expert_advisor', 'user'];
  const currentUserAppRole = currentUserProfile?.app_role || currentUser?.role || 'user';
  const isSuperAdmin = currentUserAppRole === 'super_admin';
  const isAdmin = currentUserAppRole === 'admin' || isSuperAdmin;

  // Only super_admin can assign super_admin; admin can assign admin and below
  const getAvailableRoles = () => {
    if (isSuperAdmin) return VALID_ROLES;
    if (isAdmin) return VALID_ROLES.filter(r => r !== 'super_admin');
    return [];
  };

  const handleRoleSave = async () => {
    if (!newRole) return;
    setSavingRole(true);
    setRoleError(null);
    setRoleSuccess(null);
    try {
      const res = await base44.functions.invoke('supabaseProfileData', {
        action: 'updateProfileRole',
        _router_user_email: currentUser?.email,
        data: { newRole, editorEmail: currentUser?.email, target_profile_id: selectedProfileId, target_user_email: userEmail },
      });
      if (res.data?.error) {
        setRoleError(res.data.error);
      } else {
        setRoleSuccess(`Role updated to "${newRole}"`);
        setEditingRole(false);
        queryClient.invalidateQueries({ queryKey: ['admin-target-profile', userEmail] });
      }
    } catch (e) {
      setRoleError(e?.response?.data?.error || e.message || 'Failed to update role');
    }
    setSavingRole(false);
  };

  const startEditRole = () => {
    setNewRole(profile?.app_role || selectedUser?.role || 'user');
    setRoleError(null);
    setRoleSuccess(null);
    setEditingRole(true);
  };

  const userEmail = selectedUser?.email;

  const { data: targetProfile } = useQuery({
    queryKey: ['admin-target-profile', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseProfileData', {
        action: 'getFullProfile',
        _router_user_email: userEmail,
      });
      return res.data;
    },
    enabled: !!userEmail
  });

  const selectedProfileId = targetProfile?.profile?.id || null;
  const selectedBusinessId = targetProfile?.business?.id || null;

  const { data: documentsData } = useQuery({
    queryKey: ['admin-user-documents', userEmail, selectedProfileId, selectedBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getClientDocumentsForUser',
        _router_user_email: userEmail,
        data: {
          selectedProfileId,
          selectedBusinessId,
        },
      });
      return res.data || { documents: [] };
    },
    enabled: !!userEmail && activeSection === 'documents'
  });
  const documents = documentsData?.documents || [];

  const { data: resourcesData } = useQuery({
    queryKey: ['admin-user-resources', userEmail, selectedProfileId, selectedBusinessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getAssignedResources',
        _router_user_email: userEmail,
        data: {
          selectedProfileId,
          selectedBusinessId,
        },
      });
      return res.data || { resources: [] };
    },
    enabled: !!userEmail && !!selectedProfileId
  });
  const assignedResources = localResources ?? resourcesData?.resources ?? [];

  const { data: assignedWorksheets, refetch: refetchWorksheets, isLoading: worksheetsLoading } = useQuery({
    queryKey: ['admin-user-worksheets', selectedProfileId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getAdminAssignedWorksheetsForUser',
        _router_user_email: userEmail,
        data: {
          selected_profile_id: selectedProfileId,
          selected_business_id: selectedBusinessId,
        },
      });
      return res.data?.worksheets || [];
    },
    enabled: !!selectedProfileId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const displayedWorksheets = localWorksheets ?? assignedWorksheets;

  const handleUnassignWorksheet = async (worksheet) => {
    const assignmentId = worksheet.assignment_id;
    if (!assignmentId) {
      toast.error('No assignment ID found — cannot remove');
      return;
    }
    try {
      const res = await base44.functions.invoke('assignWorksheetToUser', {
        action: 'cancel',
        assignment_id: assignmentId,
      });
      const affectedRows = res.data?.affected_rows ?? (res.data?.success ? 1 : 0);

      console.log('[RemoveAssignment]', {
        type: 'worksheet',
        assignmentId,
        targetProfileId: selectedProfileId,
        targetBusinessId: selectedBusinessId,
        actionName: 'assignWorksheetToUser/cancel',
        response: res.data,
        affectedRows,
      });

      if (affectedRows === 0 && !res.data?.success) {
        toast.error('Assignment was not found or was already removed.');
        return;
      }

      // Optimistic local removal
      setLocalWorksheets(prev => (prev ?? assignedWorksheets ?? []).filter(w => w.assignment_id !== assignmentId));

      // Invalidate both admin and user-side queries
      queryClient.invalidateQueries({ queryKey: ['admin-user-worksheets', selectedProfileId] });
      queryClient.invalidateQueries({ queryKey: ['my-assigned-worksheets'] });

      // Refetch admin list in background
      refetchWorksheets().then(() => setLocalWorksheets(null));

      // Signal user-side resource library
      window.dispatchEvent(new CustomEvent('worksheet-unassigned'));
      toast.success('Assigned worksheet removed');
    } catch (e) {
      toast.error('Failed to remove worksheet assignment: ' + (e.message || ''));
    }
  };

  const handleUnassignResource = async (resource) => {
    const assignmentId = resource.assignment_id;
    if (!assignmentId) {
      toast.error('No assignment ID found — cannot remove');
      return;
    }
    try {
      const res = await base44.functions.invoke('assignDocumentToUser', {
        action: 'deleteAssignment',
        assignment_id: assignmentId,
      });
      const affectedRows = res.data?.affected_rows ?? (res.data?.success ? 1 : 0);

      console.log('[RemoveAssignment]', {
        type: 'resource',
        assignmentId,
        targetProfileId: selectedProfileId,
        targetBusinessId: selectedBusinessId,
        actionName: 'assignDocumentToUser/deleteAssignment',
        response: res.data,
        affectedRows,
      });

      if (affectedRows === 0 && !res.data?.success) {
        toast.error('Assignment was not found or was already removed.');
        return;
      }

      // Optimistic local removal
      setLocalResources(prev => (prev ?? assignedResources).filter(r => r.assignment_id !== assignmentId));

      // Invalidate both admin and user-side queries
      queryClient.invalidateQueries({ queryKey: ['admin-user-resources', userEmail, selectedProfileId, selectedBusinessId] });
      queryClient.invalidateQueries({ queryKey: ['assigned-resources'] });

      // Refetch admin list in background, clear local override when done
      queryClient.refetchQueries({ queryKey: ['admin-user-resources', userEmail, selectedProfileId, selectedBusinessId] })
        .then(() => setLocalResources(null));

      // Signal user-side resource library
      window.dispatchEvent(new CustomEvent('resource-unassigned'));

      toast.success('Assignment removed');
    } catch (e) {
      toast.error('Failed to remove resource assignment: ' + (e.message || ''));
    }
  };

  const { data: docQueue } = useQuery({
    queryKey: ['admin-user-docqueue', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseDocumentData', {
        action: 'getAnalysisQueue',
        _router_user_email: userEmail,
      });
      return res.data?.queue || [];
    },
    enabled: !!userEmail && activeSection === 'queue'
  });

  const { data: extractedFields } = useQuery({
    queryKey: ['admin-user-extracted', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseDocumentData', {
        action: 'getFieldsForReview',
        _router_user_email: userEmail,
      });
      return res.data?.fields || [];
    },
    enabled: !!userEmail && activeSection === 'extracted'
  });

  const { data: roadmapItems } = useQuery({
    queryKey: ['admin-user-roadmap', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getRoadmapItems',
        _router_user_email: userEmail,
      });
      return res.data?.items || [];
    },
    enabled: !!userEmail && activeSection === 'roadmap'
  });

  const { data: nextBestActions } = useQuery({
    queryKey: ['admin-user-nba', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseOpportunityData', {
        action: 'getNextBestActions',
        _router_user_email: userEmail,
      });
      return res.data?.actions || [];
    },
    enabled: !!userEmail && activeSection === 'actions'
  });

  const { data: verificationQueue } = useQuery({
    queryKey: ['admin-user-vce', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseVerificationData', {
        action: 'getVerificationQueue',
        _router_user_email: userEmail,
      });
      return res.data;
    },
    enabled: !!userEmail && activeSection === 'verification'
  });

  const { data: assessments } = useQuery({
    queryKey: ['admin-user-assessments', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseProfileData', {
        action: 'getBusinessAssessments',
        _router_user_email: userEmail,
      });
      return res.data?.assessments || [];
    },
    enabled: !!userEmail && activeSection === 'assessments'
  });

  const { data: dashboardMetrics } = useQuery({
    queryKey: ['admin-user-metrics', userEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseDashboardData', {
        action: 'getDashboardMetrics',
        _router_user_email: userEmail,
      });
      return res.data?.metrics || null;
    },
    enabled: !!userEmail && activeSection === 'metrics'
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const fileId = `${file.name}-${Date.now()}`;
      setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 5, status: 'uploading' } }));
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const current = prev[fileId]?.progress || 0;
          if (current >= 90) return prev;
          return { ...prev, [fileId]: { ...prev[fileId], progress: current + 10 } };
        });
      }, 300);
      try {
        const base64File = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        const uploadRes = await base44.functions.invoke('adminUploadDocument', {
          target_profile_id: selectedUser.id,
          target_business_id: targetProfile?.business?.id || null,
          file_name: file.name,
          file_type: file.type || 'application/pdf',
          file_size: file.size,
          document_type: docType,
          year: null,
          base64_file: base64File,
        });
        clearInterval(progressInterval);
        setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 100, status: 'completed' } }));
        if (!uploadRes.data?.success) throw new Error(uploadRes.data?.error || 'Upload failed');
        return uploadRes.data.document;
      } catch (error) {
        clearInterval(progressInterval);
        setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 0, status: 'failed' } }));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-documents'] });
      setTimeout(() => setUploadProgress({}), 3000);
    }
  });

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    files.forEach((f) => uploadMutation.mutate(f));
  };

  const profile  = targetProfile?.profile;
  const business = targetProfile?.business;

  return (
    <div className="space-y-6">
      {/* Context Banner */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Client Workspace</p>
              <h3 className="text-lg font-display font-bold">{profile?.full_name || selectedUser?.full_name || '—'}</h3>
              <p className="text-sm text-muted-foreground">{profile?.email || selectedUser?.email || '—'}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
            <X className="w-3.5 h-3.5" /> Back to All Clients
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Business</p>
              <p className="text-sm font-medium">{business?.name || profile?.company || 'My Business'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase">Role</p>
              {editingRole ? (
                <div className="flex items-center gap-2 mt-1">
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/50"
                  >
                    {getAvailableRoles().map(r => (
                      <option key={r} value={r}>{{
                        super_admin: 'Super Admin',
                        admin: 'Admin',
                        expert_advisor: 'Expert Advisor',
                        advisor: 'Advisor',
                        owner: 'Owner',
                        team_member: 'Team Member',
                        user: 'User',
                      }[r] || r}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRoleSave}
                    disabled={savingRole}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {savingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => { setEditingRole(false); setRoleError(null); }}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium capitalize">{profile?.app_role || selectedUser?.role || 'user'}</p>
                  {(isSuperAdmin || isAdmin) && (
                    <button onClick={startEditRole} className="text-muted-foreground hover:text-primary transition-colors" title="Edit role">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {roleError && <p className="text-[10px] text-destructive mt-0.5">{roleError}</p>}
              {roleSuccess && <p className="text-[10px] text-emerald-400 mt-0.5">{roleSuccess}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Last Active</p>
              <p className="text-sm font-medium">{selectedUser?.updated_date ? new Date(selectedUser.updated_date).toLocaleDateString() : '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Industry</p>
              <p className="text-sm font-medium">{business?.industry || profile?.industry || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary overflow-x-auto">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {section.label}
            </button>
          );
        })}
      </div>

      {/* ── Overview ── */}
      {activeSection === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Business Name', value: business?.name || profile?.company || '—' },
              { label: 'Industry',      value: business?.industry || '—' },
              { label: 'Revenue',       value: business?.revenue ? `$${(business.revenue/1000).toFixed(0)}K` : '—' },
              { label: 'Email',         value: selectedUser?.email || '—' },
            ].map(item => (
              <div key={item.label} className="glass rounded-lg p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-semibold mt-1">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Meeting Intelligence — Two-Minute Brief for advisor preparation */}
          {selectedProfileId && selectedBusinessId && (
            <MeetingBriefPanel
              businessId={selectedBusinessId}
              profileId={selectedProfileId}
              userEmail={userEmail}
            />
          )}

          {/* Weekly Digest — admin view of selected client */}
          {selectedProfileId && (
            <WeeklyDigestCard
              profileId={selectedProfileId}
              businessId={selectedBusinessId}
              userEmail={userEmail}
              isSuperAdmin={isSuperAdmin}
              readOnly={false}
            />
          )}

          {/* Client Activity Feed — admin view */}
          {selectedProfileId && (
            <div className="glass rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity</p>
              <ClientActivityFeed
                profileId={selectedProfileId}
                businessId={selectedBusinessId}
                mode="admin_client"
                limit={15}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Documents ── */}
      {activeSection === 'documents' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground">
                {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
              </select>
            </div>
            <label onDrop={handleDrop} onDragOver={e => e.preventDefault()}
              className="rounded-xl border-2 border-dashed border-border hover:border-primary/30 p-8 text-center transition-all cursor-pointer block">
              <input type="file" accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg" onChange={handleDrop} className="hidden" multiple />
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drop files or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Admin upload — linked to {profile?.full_name || 'this user'}</p>
            </label>
          </div>
          {Object.keys(uploadProgress).length > 0 && (
            <div className="space-y-2">
              {Object.entries(uploadProgress).map(([fileId, progress]) => (
                <div key={fileId} className="glass rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{fileId.split('-').slice(0, -1).join('-')}</span>
                    <span className="text-xs text-muted-foreground">{progress.progress}%</span>
                  </div>
                  <Progress value={progress.progress} className="h-1" />
                  {progress.status === 'failed' && <p className="text-xs text-destructive">Upload failed.</p>}
                </div>
              ))}
            </div>
          )}
          {documents && documents.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {['File', 'Type', 'Source', 'Status', 'Uploaded'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => {
                    // The whole row is the click target (the Vision row language), and it
                    // is interactive whenever the row carries an identity — storage
                    // metadata never gates the authorization attempt.
                    const canOpen = Boolean(doc?.id);
                    return (
                    <tr
                      key={doc.id}
                      onClick={canOpen ? () => handleOpenDocument(doc) : undefined}
                      onKeyDown={canOpen ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDocument(doc); }
                      } : undefined}
                      tabIndex={canOpen ? 0 : undefined}
                      title={canOpen ? 'Open document' : undefined}
                      className={`border-b border-border/50 hover:bg-secondary/30 vision-focus ${canOpen ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground shrink-0" /><span className="text-xs font-medium truncate max-w-[200px]">{doc.name}</span></div></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{(doc.document_type || 'other').replace('_', ' ')}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={`text-xs ${doc.upload_source === 'admin' ? 'bg-primary/10 text-primary border-primary/30' : ''}`}>{doc.upload_source === 'admin' ? 'Admin' : 'User'}</Badge></td>
                      <td className="px-4 py-3"><span className={`text-[11px] border rounded-full px-2.5 py-0.5 ${doc.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : doc.status === 'processing' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-secondary text-foreground border-border'}`}>{doc.status}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{doc.created_date ? new Date(doc.created_date).toLocaleDateString() : '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {documents && documents.length === 0 && <EmptyState label="No documents found" />}
        </div>
      )}

      {/* ── Resources ── */}
      {activeSection === 'resources' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Assigned Resources <span className="text-muted-foreground text-xs">({assignedResources.length})</span></p>
          </div>
          {assignedResources && assignedResources.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {['File', 'Type', 'Assigned', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignedResources.map(doc => (
                    <tr key={doc.id} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate max-w-[200px]">{doc.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{(doc.document_type || 'other').replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openDocumentViewer(doc)}
                          className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded" title="Preview"
                        ><FileText className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => setDeletingResource(doc)}
                          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded" title="Remove"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState label="No assigned resources found" />}
        </div>
      )}

      {/* ── Worksheets ── */}
      {activeSection === 'worksheets' && (() => {
        const all = displayedWorksheets || [];
        const completedWs = all.filter(w => w.assignment_status === 'completed');
        const scheduledWs = all.filter(w => w.assignment_status === 'scheduled');
        const assignedWs = all.filter(w => !['completed', 'scheduled'].includes(w.assignment_status));
        const shownWs = worksheetSubTab === 'completed' ? completedWs : worksheetSubTab === 'scheduled' ? scheduledWs : assignedWs;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Worksheets</p>
              <p className="text-xs text-muted-foreground">Manage worksheets assigned to this user</p>
            </div>
            {/* Sub-tabs */}
            <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-secondary w-fit">
              {[
                { key: 'assigned', label: `Assigned (${assignedWs.length})` },
                { key: 'scheduled', label: `Scheduled (${scheduledWs.length})` },
                { key: 'completed', label: `Completed (${completedWs.length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setWorksheetSubTab(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    worksheetSubTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >{tab.label}</button>
              ))}
            </div>
            {worksheetsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : shownWs.length > 0 ? (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Worksheet', 'Folder', worksheetSubTab === 'completed' ? 'Completed' : worksheetSubTab === 'scheduled' ? 'Due Date' : 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownWs.map(ws => (
                      <tr key={ws.assignment_id || ws.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[200px]">{ws.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{ws.folder || '—'}</td>
                        <td className="px-4 py-3">
                          {worksheetSubTab === 'completed' ? (
                            <span className="text-xs text-muted-foreground">
                              {ws.completed_at ? new Date(ws.completed_at).toLocaleDateString() : '—'}
                            </span>
                          ) : worksheetSubTab === 'scheduled' ? (
                            <span className="text-xs text-muted-foreground">
                              {ws.due_date ? new Date(ws.due_date).toLocaleDateString() : '—'}
                            </span>
                          ) : (
                            <span className={`text-[11px] border rounded-full px-2.5 py-0.5 ${
                              ws.assignment_status === 'in_progress' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-secondary text-muted-foreground border-border'
                            }`}>{ws.assignment_status || 'assigned'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {worksheetSubTab === 'completed' && (
                              <button
                                onClick={() => setViewingResponse({ ...ws, targetProfileId: selectedProfileId })}
                                className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded text-xs" title="View Response"
                              ><MessageSquare className="w-3.5 h-3.5" /></button>
                            )}
                            <button
                              onClick={() => setDeletingWorksheet(ws)}
                              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded" title="Remove assignment"
                            ><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !worksheetsLoading && <EmptyState label={worksheetSubTab === 'completed' ? 'No completed worksheets yet' : 'No active worksheets assigned'} />}
          </div>
        );
      })()}

      {/* ── Agreements ── */}
      {activeSection === 'agreements' && (
        <AdminAgreements selectedBusinessId={selectedBusinessId} clientUserId={selectedUser?.id} />
      )}

      {/* ── Expert Advisor Access ── */}
      {activeSection === 'expert_access' && (
        <ExpertAdvisorAccessManager
          clientProfileId={selectedProfileId}
          clientBusinessId={selectedBusinessId}
        />
      )}

      {/* ── Outcome Tracking ── */}
      {activeSection === 'outcomes' && (
        <OutcomeTrackingPanel
          targetProfileId={selectedProfileId}
          targetBusinessId={selectedBusinessId}
          clientName={profile?.full_name || selectedUser?.full_name}
          clientEmail={profile?.email || selectedUser?.email}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {/* ── Document Queue ── */}
      {activeSection === 'queue' && (
        <div className="space-y-3">
          {docQueue && docQueue.length > 0 ? docQueue.map(item => (
            <div key={item.id} className="glass rounded-lg p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{item.document_name || item.file_name || '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.analysis_type || '—'} · {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</p>
              </div>
              <span className={`text-[11px] border rounded-full px-2.5 py-0.5 shrink-0 ${
                item.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                item.status === 'processing' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                item.status === 'failed' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                'bg-secondary text-foreground border-border'
              }`}>{item.status || 'pending'}</span>
            </div>
          )) : <EmptyState label="No items in document queue" />}
        </div>
      )}

      {/* ── Extracted Fields ── */}
      {activeSection === 'extracted' && (
        <div className="space-y-3">
          {extractedFields && extractedFields.length > 0 ? extractedFields.map(field => (
            <div key={field.id} className="glass rounded-lg p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{field.field_name || '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Value: {field.extracted_value ?? '—'} · Confidence: {field.confidence_score ? `${Math.round(field.confidence_score * 100)}%` : '—'}</p>
              </div>
              <span className={`text-[11px] border rounded-full px-2.5 py-0.5 shrink-0 ${
                field.review_status === 'approved' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                field.review_status === 'rejected' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}>{field.review_status || 'pending'}</span>
            </div>
          )) : <EmptyState label="No extracted fields to review" />}
        </div>
      )}

      {/* ── Assessments ── */}
      {activeSection === 'assessments' && (
        <div className="space-y-3">
          {assessments && assessments.length > 0 ? assessments.map(a => (
            <div key={a.id} className="glass rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold capitalize">{(a.assessment_type || '').replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Score: {a.score || '—'} · {a.status}</p>
              </div>
              {a.completed_at && <span className="text-xs text-muted-foreground shrink-0">{new Date(a.completed_at).toLocaleDateString()}</span>}
            </div>
          )) : <EmptyState label="No assessments found" />}
        </div>
      )}

      {/* ── Opportunities ── */}
      {activeSection === 'opportunities' && (
        <OpportunityQueue userEmail={userEmail} />
      )}

      {/* ── Next Best Actions ── */}
      {activeSection === 'actions' && (
        <div className="space-y-3">
          {nextBestActions && nextBestActions.length > 0 ? nextBestActions.map(action => (
            <div key={action.id} className="glass rounded-lg p-4">
              <p className="text-sm font-semibold">{action.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{action.description || '—'}</p>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="outline" className="text-xs">{action.status}</Badge>
                <span className="text-xs text-muted-foreground">Priority: {action.priority_score || '—'}</span>
              </div>
            </div>
          )) : <EmptyState label="No next best actions found" />}
        </div>
      )}

      {/* ── Roadmap ── */}
      {activeSection === 'roadmap' && (
        <div className="space-y-3">
          {roadmapItems && roadmapItems.length > 0 ? roadmapItems.map(item => (
            <div key={item.id} className="glass rounded-lg p-4">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{item.description || '—'}</p>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="outline" className="text-xs">{item.category || 'General'}</Badge>
                <Badge variant="outline" className="text-xs">{item.status}</Badge>
                {item.estimated_value_created && <span className="text-xs text-primary">${(item.estimated_value_created / 1000).toFixed(0)}K</span>}
              </div>
            </div>
          )) : <EmptyState label="No sprint items found" />}
        </div>
      )}

      {/* ── Verification Queue ── */}
      {activeSection === 'verification' && (
        <div className="space-y-4">
          {verificationQueue?.roadmap_items?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3">Sprint Items Needing Verification</p>
              <div className="space-y-2">
                {verificationQueue.roadmap_items.map(item => (
                  <div key={item.id} className="glass rounded-lg p-4 flex items-center justify-between">
                    <div><p className="text-sm font-semibold">{item.title}</p></div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{item.status}</Badge>
                      {item.estimated_value_created && <span className="text-xs text-primary">${(item.estimated_value_created / 1000).toFixed(0)}K</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {verificationQueue?.value_creation_events?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3">Value Creation Events</p>
              <div className="space-y-2">
                {verificationQueue.value_creation_events.map(event => (
                  <div key={event.id} className="glass rounded-lg p-4 flex items-center justify-between">
                    <div><p className="text-sm font-semibold">{event.title}</p></div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{event.status}</Badge>
                      {event.estimated_impact && <span className="text-xs text-primary">${(event.estimated_impact / 1000).toFixed(0)}K</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(!verificationQueue?.roadmap_items?.length && !verificationQueue?.value_creation_events?.length) && (
            <EmptyState label="No items needing verification" />
          )}
        </div>
      )}

      {/* ── Dashboard Metrics ── */}
      {activeSection === 'metrics' && (
        <MetricsTab dashboardMetrics={dashboardMetrics} userEmail={userEmail} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['admin-user-metrics', userEmail] })} />
      )}

      {/* ── Notes ── */}
      {activeSection === 'notes' && selectedProfileId && (
        <ClientNotesEditor
          profileId={selectedProfileId}
          businessId={selectedBusinessId}
          currentUserName={currentUser?.full_name || currentUser?.email || ''}
          currentUserProfileId={currentUserProfile?.id || null}
        />
      )}
      {activeSection === 'notes' && !selectedProfileId && (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading profile…</div>
      )}

      {/* ── Delete Worksheet Assignment Modal ── */}
      {deletingWorksheet && (
        <DeleteWorksheetAssignmentModal
          worksheet={deletingWorksheet}
          onClose={() => setDeletingWorksheet(null)}
          onConfirm={async () => {
            await handleUnassignWorksheet(deletingWorksheet);
            setDeletingWorksheet(null);
          }}
        />
      )}

      {/* ── Delete Resource Assignment Modal ── */}
      {deletingResource && (
        <DeleteWorksheetAssignmentModal
          worksheet={{ title: deletingResource.name }}
          onClose={() => setDeletingResource(null)}
          onConfirm={async () => {
            await handleUnassignResource(deletingResource);
            setDeletingResource(null);
          }}
        />
      )}

      {/* ── View Worksheet Response Modal ── */}
      {viewingResponse && (
        <AdminWorksheetResponseModal
          worksheet={viewingResponse}
          targetProfileId={viewingResponse.targetProfileId}
          onClose={() => setViewingResponse(null)}
        />
      )}

      {/* ── Document Viewer ── */}
      {isDocumentViewerOpen && (
        <DocumentViewer
          isOpen={isDocumentViewerOpen}
          onClose={closeDocumentViewer}
          document={selectedDocument}
          signedUrl={documentSignedUrl}
          onDownload={() => downloadDocument(selectedDocument)}
          onOpenNewTab={() => openDocumentInNewTab()}
        />
      )}
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="text-center py-12 text-sm text-muted-foreground">{label}</div>;
}

function MetricCard({ label, value, accent }) {
  return (
    <div className="glass rounded-lg p-4">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-display font-bold mt-1 ${accent ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}

function MetricsTab({ dashboardMetrics, userEmail, onRefresh }) {
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState(null);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairResult(null);
    try {
      const res = await base44.functions.invoke('forceUpdateDashboardMetrics', { _router_user_email: userEmail });
      setRepairResult(res.data?.success ? 'success' : 'error');
      if (res.data?.success) onRefresh();
    } catch {
      setRepairResult('error');
    }
    setRepairing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Dashboard Metrics</p>
        <div className="flex items-center gap-2">
          {repairResult === 'success' && <span className="text-xs text-emerald-400">✓ Metrics rebuilt</span>}
          {repairResult === 'error' && <span className="text-xs text-destructive">Rebuild failed</span>}
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleRepair} disabled={repairing}>
            {repairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {repairing ? 'Rebuilding…' : 'Repair Metrics'}
          </Button>
        </div>
      </div>
      {dashboardMetrics ? (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="V.I.S.I.O.N IQ™ Score" value={dashboardMetrics.overall_impact_score || dashboardMetrics.overall_impact_score || '—'} accent />
          <MetricCard label="Revenue" value={dashboardMetrics.revenue ? `$${(dashboardMetrics.revenue / 1000).toFixed(0)}K` : '—'} />
          <MetricCard label="Net Profit" value={dashboardMetrics.net_profit ? `$${(dashboardMetrics.net_profit / 1000).toFixed(0)}K` : '—'} />
          <MetricCard label="Enterprise Value" value={dashboardMetrics.enterprise_value ? `$${(dashboardMetrics.enterprise_value / 1000000).toFixed(1)}M` : '—'} />
          <MetricCard label="Profit Gap" value={dashboardMetrics.profit_gap?.gap_to_best ? `$${(dashboardMetrics.profit_gap.gap_to_best / 1000).toFixed(0)}K` : '—'} />
          <MetricCard label="Tax Gap" value={dashboardMetrics.tax_gap?.annual_overpayment ? `$${(dashboardMetrics.tax_gap.annual_overpayment / 1000).toFixed(0)}K/yr` : '—'} />
        </div>
      ) : (
        <div className="space-y-3">
          <EmptyState label="No dashboard metrics available" />
          <div className="text-center">
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleRepair} disabled={repairing}>
              {repairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Generate Metrics from Assessments
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}