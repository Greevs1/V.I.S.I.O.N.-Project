import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, Video, Headphones, Loader2, PackageOpen, ClipboardList, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import WorksheetCompletionModal from '@/components/worksheets/WorksheetCompletionModal';
import WorksheetCard from '@/components/worksheets/WorksheetCard';
import WorksheetTabs from '@/components/worksheets/WorksheetTabs';
import AssignedResourceCard from '@/components/resources/AssignedResourceCard';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { useDocumentViewer } from '@/hooks/useDocumentViewer';

const staticResources = [
{ title: 'Exit Planning Fundamentals', type: 'Guide', icon: FileText, desc: 'Essential steps for planning a successful business exit.' },
{ title: 'EBITDA Add-Back Checklist', type: 'Template', icon: FileText, desc: 'Comprehensive list of common EBITDA adjustments and add-backs.' },
{ title: 'Tax Strategy Playbook', type: 'Guide', icon: BookOpen, desc: 'Tax optimization strategies for businesses under $20M revenue.' },
{ title: 'Valuation Drivers Masterclass', type: 'Video', icon: Video, desc: 'Understanding what drives enterprise value in service businesses.' },
{ title: 'Freedom Blueprint', type: 'Template', icon: FileText, desc: 'Step-by-step plan to reduce owner dependency.' },
{ title: 'M&A Process Overview', type: 'Podcast', icon: Headphones, desc: 'What to expect when selling your business.' }];



export default function ResourceLibrary() {
  const { user, supabaseProfile } = useAuth();
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [worksheetTab, setWorksheetTab] = useState('assigned');
  
  // Use centralized document viewer hook
  const {
    selectedDocument,
    documentSignedUrl,
    isDocumentViewerOpen,
    isLoadingPreview,
    previewError,
    openDocumentViewer,
    closeDocumentViewer,
    downloadDocument,
    openDocumentInNewTab,
  } = useDocumentViewer();

  // Debug logging on mount
  useEffect(() => {
    console.log('[ResourceLibrary] ====== MOUNT DEBUG ======');
    console.log('[ResourceLibrary] Base44 User ID:', user?.id);
    console.log('[ResourceLibrary] Supabase Profile ID:', supabaseProfile?.id);
    console.log('[ResourceLibrary] =========================================');
  }, [user?.id, supabaseProfile?.id]);

  // Query A: Assigned Resources (INDEPENDENT - loads first, fast)
  const { data: assignedResources = [], isLoading: loadingResources, refetch: refetchResources, error: resourcesError } = useQuery({
    queryKey: ['assigned-resources', supabaseProfile?.id],
    queryFn: async () => {
      if (!supabaseProfile?.id) return [];
      const startTime = performance.now();
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getAssignedResources',
        data: { profileId: supabaseProfile.id }
      });
      const duration = Math.round(performance.now() - startTime);
      console.log('[ResourceLibrary] ✓ Resources:', res.data?.resources?.length || 0, 'in', duration, 'ms');
      return res.data?.resources || [];
    },
    enabled: !!supabaseProfile?.id,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  // Query B: Assigned Worksheets (INDEPENDENT - has fallback)
  const { data: allWorksheets = [], isLoading: loadingWorksheets, refetch: refetchWorksheets, error: worksheetsError } = useQuery({
    queryKey: ['my-assigned-worksheets', supabaseProfile?.id],
    queryFn: async () => {
      if (!supabaseProfile?.id) return [];
      const startTime = performance.now();
      // Try Supabase first
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getAssignedWorksheets',
        data: { profileId: supabaseProfile.id }
      });
      const duration = Math.round(performance.now() - startTime);
      console.log('[ResourceLibrary] ✓ Worksheets (Supabase):', res.data?.worksheets?.length || 0, 'in', duration, 'ms');

      // Fallback to Base44 if Supabase has no assignments
      if (!res.data?.worksheets || res.data.worksheets.length === 0) {
        console.log('[ResourceLibrary] ⚠ No Supabase assignments, trying Base44 fallback...');
        const allBase44 = await base44.entities.Worksheet.list('-created_date', 200);
        const assigned = (allBase44 || []).filter((w) =>
          w.assigned_to?.includes(supabaseProfile.id)
        ).map((w) => ({
          ...w,
          assignment_status: 'assigned',
          source: 'base44_fallback'
        }));
        console.log('[ResourceLibrary] ✓ Base44 fallback:', assigned.length, 'worksheets');
        return assigned;
      }

      return res.data.worksheets;
    },
    enabled: !!supabaseProfile?.id,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const filteredWorksheets = useMemo(() => {
    const all = allWorksheets || [];
    const completed = all.filter((w) => w.assignment_status === 'completed');
    // Scheduled: backend sets effective_status='scheduled' for due_date rows; also catch status='scheduled'
    const scheduled = all.filter((w) => w.assignment_status === 'scheduled' && w.assignment_status !== 'completed');
    // Assigned: active but no due date (not in scheduled or completed)
    const assigned = all.filter((w) => !['completed', 'scheduled'].includes(w.assignment_status));
    return { assigned, completed, scheduled };
  }, [allWorksheets]);

  useEffect(() => {
    const handleWorksheetChange = () => refetchWorksheets();
    const handleResourceChange = () => refetchResources();
    window.addEventListener('worksheet-assigned', handleWorksheetChange);
    window.addEventListener('worksheet-unassigned', handleWorksheetChange);
    window.addEventListener('resource-unassigned', handleResourceChange);
    return () => {
      window.removeEventListener('worksheet-assigned', handleWorksheetChange);
      window.removeEventListener('worksheet-unassigned', handleWorksheetChange);
      window.removeEventListener('resource-unassigned', handleResourceChange);
    };
  }, [refetchWorksheets, refetchResources]);

  // Document viewer handlers - use hook
  const handlePreviewRequest = async (resource) => {
    await openDocumentViewer(resource);
  };

  const handleDownloadResource = async (resource) => {
    // Use centralized hook - handles blob fetch for cross-origin URLs
    await downloadDocument(resource);
  };

  const handleWorksheetClick = (worksheet, assignmentId) => {
    setSelectedWorksheet(worksheet);
    setSelectedAssignmentId(assignmentId);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Static Resources */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Resource Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Guides, templates, and educational content curated for business owners.</p>
        </div>
        















        
      </div>

      {/* Assigned Resources - INDEPENDENT SECTION */}
      <div className="space-y-4">
        <div className="border-t border-border pt-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold">Assigned Resources</h2>
            <p className="text-sm text-muted-foreground mt-1">Files and documents shared with you by your advisory team.</p>
          </div>
          <button onClick={() => refetchResources()} className="text-xs text-primary hover:underline">Refresh</button>
        </div>
        {(loadingResources || !supabaseProfile?.id) && <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        {!loadingResources && supabaseProfile?.id && resourcesError &&
        <div className="glass rounded-xl p-4 border border-destructive/30 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">Resource query error</p>
              <p className="text-xs text-muted-foreground mt-1">{resourcesError.message}</p>
            </div>
          </div>
        }
        {!loadingResources && supabaseProfile?.id && !resourcesError && assignedResources.length === 0 &&
        <div className="glass rounded-xl p-8 text-center space-y-3">
            <PackageOpen className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No assigned resources yet.</p>
            <p className="text-xs text-muted-foreground">Files shared by your advisory team will appear here.</p>
          </div>
        }
        {!loadingResources && supabaseProfile?.id && !resourcesError && assignedResources.length > 0 &&
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignedResources.map((doc) =>
          <AssignedResourceCard
            key={doc.id}
            resource={doc}
            onDownload={handleDownloadResource}
            onPreviewRequest={handlePreviewRequest} />

          )}
          </div>
        }
      </div>

      {/* Worksheet Completion Modal */}
      {selectedWorksheet && (
        <WorksheetCompletionModal
          worksheet={selectedWorksheet}
          assignmentId={selectedAssignmentId}
          onClose={() => {setSelectedWorksheet(null);setSelectedAssignmentId(null);}}
          onCompleted={() => {
            refetchWorksheets();
            setSelectedWorksheet(null);
            setSelectedAssignmentId(null);
          }} />
      )}

      {/* Document Viewer - rendered at page level (not inside cards) */}
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

      {/* Assigned Worksheets with Tabs - INDEPENDENT SECTION */}
      <div className="space-y-4">
        <div className="border-t border-border pt-6">
          <h2 className="text-xl font-display font-bold">Assigned Worksheets</h2>
          <p className="text-sm text-muted-foreground mt-1">Worksheets your advisory team has assigned for you to complete.</p>
        </div>

        <WorksheetTabs
          activeTab={worksheetTab}
          onTabChange={setWorksheetTab}
          assignedCount={filteredWorksheets.assigned.length}
          completedCount={filteredWorksheets.completed.length}
          scheduledCount={filteredWorksheets.scheduled.length} />
        

        {(loadingWorksheets || !supabaseProfile?.id) && <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        
        {!loadingWorksheets && supabaseProfile?.id &&
        <>
            {worksheetTab === 'assigned' &&
          <>
                {filteredWorksheets.assigned.length === 0 &&
            <div className="glass rounded-xl p-8 text-center space-y-3">
                    <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No worksheets assigned yet.</p>
                    <p className="text-xs text-muted-foreground">Worksheets assigned by your advisory team will appear here.</p>
                  </div>
            }
                {filteredWorksheets.assigned.length > 0 &&
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredWorksheets.assigned.map((ws) =>
              <WorksheetCard key={ws.assignment_id || ws.id} worksheet={ws} onClick={(w) => handleWorksheetClick(w, w.assignment_id)} />
              )}
                  </div>
            }
              </>
          }
            {worksheetTab === 'completed' &&
          <>
                {filteredWorksheets.completed.length === 0 &&
            <div className="glass rounded-xl p-8 text-center space-y-3">
                    <CheckCircle className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No completed worksheets yet.</p>
                    <p className="text-xs text-muted-foreground">Completed worksheets will appear here.</p>
                  </div>
            }
                {filteredWorksheets.completed.length > 0 &&
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredWorksheets.completed.map((ws) =>
              <WorksheetCard key={ws.assignment_id || ws.id} worksheet={ws} onClick={(w) => handleWorksheetClick(w, w.assignment_id)} />
              )}
                  </div>
            }
              </>
          }
            {worksheetTab === 'scheduled' &&
          <>
                {filteredWorksheets.scheduled.length === 0 &&
            <div className="glass rounded-xl p-8 text-center space-y-3">
                    <Clock className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No scheduled worksheets.</p>
                    <p className="text-xs text-muted-foreground">Scheduled worksheets will appear here.</p>
                  </div>
            }
                {filteredWorksheets.scheduled.length > 0 &&
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredWorksheets.scheduled.map((ws) =>
              <WorksheetCard key={ws.assignment_id || ws.id} worksheet={ws} onClick={(w) => handleWorksheetClick(w, w.assignment_id)} />
              )}
                  </div>
            }
              </>
          }
          </>
        }

        {/* Worksheet error display */}
        {worksheetsError &&
        <div className="glass rounded-xl p-4 border border-destructive/30 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">Worksheet query error</p>
              <p className="text-xs text-muted-foreground mt-1">{worksheetsError.message}</p>
              <p className="text-xs text-muted-foreground mt-2">Using Base44 fallback</p>
            </div>
          </div>
        }

        <div className="px-4 py-2.5 border-t border-border bg-secondary/20 flex items-center justify-between mt-3 rounded-xl">
          <p className="text-xs text-muted-foreground">
            {filteredWorksheets[worksheetTab]?.length || 0} {worksheetTab} worksheet{(filteredWorksheets[worksheetTab]?.length || 0) !== 1 ? 's' : ''}
            {allWorksheets[0]?.source === 'base44_fallback' && ' (Base44 fallback)'}
          </p>
          <button onClick={() => refetchWorksheets()} className="text-xs text-primary hover:underline">Refresh</button>
        </div>
      </div>
    </div>);

}