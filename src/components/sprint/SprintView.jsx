import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useBusinessContext } from '@/lib/BusinessContext';
import { fetchSprintRecommendations } from '@/lib/sprintRecommendations';
import {
  List, GanttChartSquare, Download, Calendar,
  Loader2, ChevronDown, ChevronRight, Plus, Sparkles, AlertCircle, X, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import ConnectCalendarModal from '@/components/calendar/ConnectCalendarModal';
import { Button } from '@/components/ui/button';
import SprintTaskItem from '@/components/sprint/SprintTaskItem';
import NextBestAction from '@/components/sprint/NextBestAction';
import PathSelection from '@/components/sprint/PathSelection';
import SprintVerificationBadge from '@/components/sprint/SprintVerificationBadge';
import SprintVerificationControls from '@/components/sprint/SprintVerificationControls';
import SprintExpertPanel from '@/components/sprint/expert/SprintExpertPanel';

// Stages:
//   loading           — initial data fetch
//   stage1            — no paths generated yet
//   generating_paths  — Galileo generating opportunities
//   stage2            — paths generated, user picks one
//   generating_sprint — path selected, Galileo building tasks
//   stage3            — active sprint with tasks

const WEEK_LABELS = { 1:'Week 1',2:'Week 2',3:'Week 3',4:'Week 4',5:'Week 5',6:'Week 6',7:'Week 7',8:'Week 8',9:'Week 9',10:'Week 10',11:'Week 11',12:'Week 12' };
const MONTH_LABELS = { 1:'Day 1–30: Foundation', 2:'Day 31–60: Acceleration', 3:'Day 61–90: Optimization' };
const STATUS_COLORS = { completed:'bg-emerald-400', in_progress:'bg-amber-400', blocked:'bg-red-400', not_started:'bg-muted-foreground/30' };

export default function SprintView({ onExplainWhy, onOpen }) {
  const { role, activeContext } = useAuth();
  const { bisVersion } = useBusinessContext();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const lastSyncedVersion = useRef(0);

  // ── Core stage state ──
  const [stage, setStage] = useState('loading');
  const [paths, setPaths] = useState([]);
  const [selecting, setSelecting] = useState(null);

  // ── Sprint data (stage3) ──
  const [sprint, setSprint] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [nextAction, setNextAction] = useState(null);

  // ── UI state ──
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [collapsedMonths, setCollapsedMonths] = useState({});
  const [collapsedWeeks, setCollapsedWeeks] = useState({});
  const [subtaskInputs, setSubtaskInputs] = useState({});
  const [addingSubtask, setAddingSubtask] = useState(null);
  const [syncingToGoogle, setSyncingToGoogle] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  // The task whose expert-role pill was opened. Held by the Sprint so the expert
  // surface closes back onto THIS sprint, with the task context intact.
  const [expertTask, setExpertTask] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(null);

  // ── BIE-driven generation helper ──
  // Consumes bis.engine.recommendations (canonical) → Sprint Objectives + Tasks.
  // Falls back to LLM generation only when no recommendations are available.
  const generateFromBie = async (sprintId, sprintTitle, sprintGoal) => {
    const bizId = activeContext?.businessId || undefined;
    const recommendations = await fetchSprintRecommendations(bizId);
    if (recommendations.length > 0) {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'generateFromRecommendations',
        data: { sprint_id: sprintId, recommendations, active_business_id: bizId },
      });
    } else {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'generateSprint',
        data: { sprint_id: sprintId, sprint_title: sprintTitle, sprint_goal: sprintGoal, active_business_id: bizId },
      });
    }
    const res = await base44.functions.invoke('ninetyDaySprint', {
      action: 'getSprint',
      ...(bizId ? { active_business_id: bizId } : {}),
    });
    return res.data?.tasks || [];
  };

  // ── Initialization ──
  // Phase 6.9 — must not fire before the business context has resolved, and must
  // re-run when the selection changes. Firing early sent getSprint with no business
  // id, which the backend now correctly REFUSES rather than answering with another
  // business's Sprint. Clearing local state first means Business A's Sprint can
  // never remain on screen while Business B loads.
  useEffect(() => {
    if (!activeContext?.initialized) return;
    setSprint(null);
    setTasks([]);
    setNotes([]);
    setDocs([]);
    setReminders([]);
    setNextAction(null);
    setPaths([]);
    setStage('loading');
    initSprintFlow();
  }, [activeContext?.initialized, activeContext?.businessId]);

  const initSprintFlow = async () => {
    try {
      // Step 1: check for active sprint
      // Pass active_business_id so getSprint filters by the selected business context
      const bizId = activeContext?.businessId || undefined;
      const sprintRes = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getSprint',
        ...(bizId ? { active_business_id: bizId } : {}),
      });
      if (sprintRes.data?.sprint) {
        const loadedSprint = sprintRes.data.sprint;
        const loadedTasks = sprintRes.data.tasks || [];
        setSprint(loadedSprint);
        setNotes(sprintRes.data.notes || []);
        setDocs(sprintRes.data.docs || []);
        setReminders(sprintRes.data.reminders || []);

        // Auto-generate tasks if sprint exists but has none
        if (loadedTasks.filter(t => t.task_type === 'main_task' && !t.is_deleted).length === 0) {
          setStage('generating_sprint');
          const newTasks = await generateFromBie(loadedSprint.id, loadedSprint.path_title, loadedSprint.path_goal);
          setTasks(newTasks);
        } else {
          setTasks(loadedTasks);
        }
        setStage('stage3');
        return;
      }
      // Step 2: no active sprint → check for generated paths
      const pathsRes = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'getActivePaths',
        data: { active_business_id: activeContext?.businessId || null },
      });
      const activePaths = pathsRes.data?.active_paths || [];
      if (activePaths.length > 0) {
        setPaths(activePaths);
        setStage('stage2');
      } else {
        setStage('stage1');
      }
    } catch (e) {
      console.error('initSprintFlow error:', e);
      setStage('stage1');
    }
  };

  // Load next best action when sprint is active
  useEffect(() => {
    if (stage === 'stage3' && sprint?.id) {
      base44.functions.invoke('ninetyDaySprint', {
        action: 'getNextBestAction',
        active_business_id: activeContext?.businessId || null,
      })
        .then(res => setNextAction(res.data?.action || null))
        .catch(() => {});
    }
  }, [stage, sprint?.id, activeContext?.businessId]);

  // Google Calendar connection status
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('calendarService', { action: 'getConnections' });
        const conn = (res.data?.connections || []).find(c => c.provider === 'google');
        setGoogleConnected(conn?.connected || false);
      } catch { setGoogleConnected(false); }
    })();
  }, []);

  // ── STAGE 1 → STAGE 2: Generate paths ──
  const handleGeneratePaths = async () => {
    setError(null);
    setStage('generating_paths');
    try {
      const res = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'generateOpportunities',
        data: { generation_type: 'initial_generation', trigger_source: 'manual_refresh', active_business_id: activeContext?.businessId || null },
      });
      const generated = res.data?.active_paths || [];
      if (generated.length > 0) {
        setPaths(generated);
        setStage('stage2');
      } else {
        setError('No paths were generated. Please try again.');
        setStage('stage1');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to generate paths');
      setStage('stage1');
    }
  };

  // ── STAGE 2: Regenerate paths ──
  const handleRegeneratePaths = async () => {
    setError(null);
    setStage('generating_paths');
    try {
      const res = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'generateOpportunities',
        data: { generation_type: 'manual_regeneration', trigger_source: 'manual_refresh', active_business_id: activeContext?.businessId || null },
      });
      const generated = res.data?.active_paths || [];
      setPaths(generated);
      setStage(generated.length > 0 ? 'stage2' : 'stage1');
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to regenerate');
      setStage('stage2');
    }
  };

  // ── STAGE 2 → STAGE 3: Select a path ──
  const handleSelectPath = async (path) => {
    setError(null);
    setSelecting(path.id);
    try {
      // A: Create sprint row in Supabase
      const selectRes = await base44.functions.invoke('ninetyDaySprint', {
        action: 'selectPath',
        data: {
          active_business_id: activeContext?.businessId || null,
          pathId: path.category || path.title?.toLowerCase().replace(/\s+/g, '_'),
          pathTitle: path.title,
          pathGoal: path.expected_outcome || path.description,
          pathSummary: path.description,
          confidence: path.confidence_score,
          opportunityBase44Id: path.id,
        },
      });
      if (selectRes.data?.error) {
        setError(selectRes.data.error);
        setSelecting(null);
        return;
      }
      const newSprint = selectRes.data?.sprint;
      if (!newSprint?.id) {
        setError('Failed to create sprint — no data returned.');
        setSelecting(null);
        return;
      }
      setSprint(newSprint);
      setSelecting(null);

      // B: Generate sprint tasks only if new (not restored)
      if (selectRes.data?.restored) {
        // Restored sprint — reload full data from getSprint
        setStage('loading');
        const reloadRes = await base44.functions.invoke('ninetyDaySprint', {
          action: 'getSprint',
          ...(activeContext?.businessId ? { active_business_id: activeContext.businessId } : {}),
        });
        setTasks(reloadRes.data?.tasks || []);
        setNotes(reloadRes.data?.notes || []);
        setDocs(reloadRes.data?.docs || []);
        setReminders(reloadRes.data?.reminders || []);
      } else {
        setStage('generating_sprint');
        const newTasks = await generateFromBie(newSprint.id, newSprint.path_title, newSprint.path_goal);
        setTasks(newTasks);
        setNotes([]); setDocs([]); setReminders([]);
      }
      setStage('stage3');
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to select path');
      setSelecting(null);
      setStage('stage2');
    }
  };

  // ── STAGE 3 → STAGE 2: Change path ──
  const handleChangePath = async () => {
    try {
      const pathsRes = await base44.functions.invoke('galileoOpportunityEngine', {
        action: 'getActivePaths',
        data: { active_business_id: activeContext?.businessId || null },
      });
      const activePaths = pathsRes.data?.active_paths || [];
      setPaths(activePaths);
      setStage(activePaths.length > 0 ? 'stage2' : 'stage1');
    } catch {
      setStage('stage1');
    }
  };

  // ── Refresh sprint data (used by task item callbacks) ──
  const fetchSprint = useCallback(async () => {
    try {
      const bizId = activeContext?.businessId || undefined;
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'getSprint',
        ...(bizId ? { active_business_id: bizId } : {}),
      });
      if (res.data?.sprint) {
        setSprint(res.data.sprint);
        setTasks(res.data.tasks || []);
        setNotes(res.data.notes || []);
        setDocs(res.data.docs || []);
        setReminders(res.data.reminders || []);
      }
    } catch (e) { console.error('fetchSprint error:', e); }
  }, [activeContext?.businessId]);

  // ── Automatic regeneration: when the BIE recalculates (assessment / document /
  // scenario / advisor), merge new/changed recommendations into the active sprint.
  // Preserves completed work, deduplicates, and only adds missing objectives/tasks. ──
  useEffect(() => {
    if (stage !== 'stage3' || !sprint?.id) return;
    if (bisVersion === lastSyncedVersion.current) return;
    lastSyncedVersion.current = bisVersion;
    (async () => {
      try {
        const bizId = activeContext?.businessId || undefined;
        const recommendations = await fetchSprintRecommendations(bizId);
        if (recommendations.length === 0) return;
        await base44.functions.invoke('ninetyDaySprint', {
          action: 'generateFromRecommendations',
          data: { sprint_id: sprint.id, recommendations, active_business_id: activeContext?.businessId || null },
        });
        await fetchSprint();
      } catch (e) { console.error('auto-regen sprint error:', e); }
    })();
  }, [bisVersion, stage, sprint?.id, fetchSprint, activeContext?.businessId]);

  const handleAddSubtask = async (parentTaskId, weekNumber) => {
    const text = subtaskInputs[parentTaskId];
    if (!text?.trim()) return;
    setAddingSubtask(parentTaskId);
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'addSubtask',
        data: {
          active_business_id: activeContext?.businessId || null,
          sprint_id: sprint.id,
          parent_task_id: parentTaskId,
          title: text,
          is_user_created: true,
          week_number: weekNumber,
          sort_order: tasks.length + 1,
        },
      });
      setSubtaskInputs(prev => ({ ...prev, [parentTaskId]: '' }));
      fetchSprint();
    } catch (e) { console.error('addSubtask error:', e); }
    setAddingSubtask(null);
  };

  const toggleMonth = (m) => setCollapsedMonths(prev => ({ ...prev, [m]: !prev[m] }));
  const toggleWeek = (key) => setCollapsedWeeks(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSyncSprintToGoogle = async () => {
    if (googleConnected === false) { setShowConnectModal(true); return; }
    setSyncingToGoogle(true);
    try {
      const res = await base44.functions.invoke('calendarService', {
        action: 'syncSprintToGoogle', data: { sprint_id: sprint.id },
      });
      if (res.data?.error) {
        if (res.data.error === 'Google Calendar not connected') {
          setShowConnectModal(true); setGoogleConnected(false);
        } else { toast.error(res.data.error); }
      } else {
        const synced = res.data?.synced || 0;
        const failed = res.data?.errors?.length || 0;
        if (synced > 0) toast.success(`Synced ${synced} task(s)${failed ? ` — ${failed} failed` : ''}`);
        else if (failed > 0) toast.error(`${failed} task(s) failed to sync`);
        else toast.success('Sprint synced to Google Calendar');
        setGoogleConnected(true);
      }
    } catch (e) { toast.error(e?.response?.data?.error || 'Sync failed'); }
    setSyncingToGoogle(false);
  };

  const handleDownloadPDF = async () => {
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', { action: 'generatePDF', data: { sprint_id: sprint.id } });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '90-day-sprint.html'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('generatePDF error:', e); }
  };

  const handleDownloadICS = async () => {
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', { action: 'generateICS', data: { sprint_id: sprint.id } });
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '90-day-sprint.ics'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('generateICS error:', e); }
  };

  // ════════════════════════════════════════
  // RENDERS
  // ════════════════════════════════════════

  // ── Loading ──
  if (stage === 'loading') {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading sprint...</p>
      </div>
    );
  }

  // ── Stage 1: No paths yet ──
  if (stage === 'stage1' || stage === 'generating_paths') {
    return (
      <div className="flex flex-col items-center text-center py-16 max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-5">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-display font-bold mb-3">Your 90-Day Sprint Starts Here</h3>
        <p className="text-sm text-muted-foreground mb-8">
          Galileo will analyze your assessments, uploaded documents, IQ™ results, and business priorities to identify your top strategic opportunities.
        </p>
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-left flex items-start gap-2 w-full">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)}><X className="w-3.5 h-3.5 text-red-400" /></button>
          </div>
        )}
        {stage === 'generating_paths' ? (
          <div>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm font-medium">Galileo is analyzing your business data...</p>
            <p className="text-xs text-muted-foreground mt-1">Generating strategic opportunities, scoring, and ranking</p>
          </div>
        ) : (
          <Button onClick={handleGeneratePaths} className="gap-2 px-6" size="lg">
            <Sparkles className="w-4 h-4" />
            Generate Your Strategic Opportunities
          </Button>
        )}
      </div>
    );
  }

  // ── Stage 2: Path selection ──
  if (stage === 'stage2') {
    return (
      <PathSelection
        paths={paths}
        selecting={selecting}
        onSelect={handleSelectPath}
        onExplainWhy={onExplainWhy}
        onRegenerate={handleRegeneratePaths}
        error={error}
        onClearError={() => setError(null)}
      />
    );
  }

  // ── Generating sprint tasks ──
  if (stage === 'generating_sprint') {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm font-medium">Galileo is building your 90-day sprint...</p>
        <p className="text-xs text-muted-foreground mt-1">Creating month-by-month execution plan</p>
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg mx-auto max-w-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════
  // STAGE 3: Active sprint plan
  // ════════════════════════════════════════
  const mainTasks = tasks.filter(t => t.task_type === 'main_task' && !t.is_deleted);
  const completedMain = mainTasks.filter(t => t.status === 'completed').length;
  const totalMain = mainTasks.length;
  const progress = totalMain > 0 ? Math.round((completedMain / totalMain) * 100) : 0;
  const sprintStartStr = sprint?.start_date || (sprint?.created_at ? sprint.created_at.split('T')[0] : '');
  const startDate = sprintStartStr ? new Date(sprintStartStr) : new Date();
  const endDate = sprint?.end_date || (() => { const d = new Date(startDate); d.setDate(d.getDate() + 90); return d.toISOString().split('T')[0]; })();
  const daysElapsed = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.min(Math.max(Math.ceil(daysElapsed / 7), 1), 12);

  const monthGroups = [1, 2, 3].map(m => {
    const monthTasks = mainTasks.filter(t => t.month_number === m);
    const weeks = {};
    monthTasks.forEach(t => { const w = t.week_number || 1; if (!weeks[w]) weeks[w] = []; weeks[w].push(t); });
    const comp = monthTasks.filter(t => t.status === 'completed').length;
    const tot = monthTasks.length;
    return { month: m, tasks: monthTasks, weeks, completed: comp, total: tot, progress: tot > 0 ? Math.round((comp / tot) * 100) : 0 };
  });

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Sprint Header */}
      <div className="rounded-xl p-5" style={{ backgroundColor: '#141418' }}>
        {/* Verification Badge */}
        <div className="mb-4">
          <SprintVerificationBadge sprint={sprint} />
        </div>

        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-1">90-Day Sprint Active</p>
            <h3 className="text-xl font-display font-bold">{sprint?.path_title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{sprint?.path_goal}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={handleSyncSprintToGoogle} disabled={syncingToGoogle}>
              <Calendar className="w-3 h-3" />
              {syncingToGoogle ? 'Syncing…' : 'Sync'}
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={handleDownloadICS}>
              <Download className="w-3 h-3" /> .ics
            </Button>
            <Button size="sm" className="gap-1 text-xs h-8" onClick={handleDownloadPDF}>
              <Download className="w-3 h-3" /> PDF
            </Button>
          </div>
        </div>

        {/* Change Focused Path */}
        <button
          onClick={handleChangePath}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary mb-1 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Change Focused Path
        </button>
        <p className="text-[10px] text-muted-foreground mb-4">
          Choose another recommendation from Galileo's Opportunity Vault or your generated path options.
        </p>
        {sprint?.industry_context && (
          <p className="text-[10px] text-muted-foreground/60 mb-4">
            Industry lens: <span className="text-muted-foreground">{sprint.industry_context}</span>
          </p>
        )}

        {/* Verification Controls (admin/expert only) */}
        <SprintVerificationControls
          sprint={sprint}
          fetchSprint={fetchSprint}
          onVerified={fetchSprint}
        />

        {/* Progress summary */}
        <div className="flex items-center gap-6 mb-3">
          <div className="text-center">
            <p className="text-2xl font-display font-bold text-primary">{progress}%</p>
            <p className="text-[10px] text-muted-foreground">Complete</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-xs font-medium">{completedMain} of {totalMain} actions completed</p>
            <p className="text-[10px] text-muted-foreground">Galileo Confidence: {sprint?.galileo_confidence || '—'}%</p>
          </div>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Week {currentWeek} of 12</span>
          <span>{sprintStartStr} → {endDate}</span>
        </div>
      </div>

      {/* Next Best Action */}
      <NextBestAction action={nextAction} />

      {/* View toggle */}
      <div className="flex items-center gap-2">
        {[{ key: 'list', label: 'List', Icon: List }, { key: 'timeline', label: 'Timeline', Icon: GanttChartSquare }].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {monthGroups.map(group => {
            const isCollapsed = collapsedMonths[group.month];
            return (
              <div key={group.month} className="rounded-xl border border-border overflow-hidden" style={{ backgroundColor: '#141418' }}>
                <button
                  onClick={() => toggleMonth(group.month)}
                  className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">{group.month}</div>
                    <div className="text-left">
                      <h4 className="text-sm font-semibold">{MONTH_LABELS[group.month]}</h4>
                      <p className="text-[10px] text-muted-foreground">{group.completed}/{group.total} complete</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${group.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{group.progress}%</span>
                    </div>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border">
                    {group.tasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">No tasks this month</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {Object.keys(group.weeks).sort((a, b) => Number(a) - Number(b)).map(weekNum => {
                          const weekTasks = group.weeks[weekNum];
                          const weekKey = `${group.month}-${weekNum}`;
                          const isWeekCollapsed = collapsedWeeks[weekKey];
                          const weekComplete = weekTasks.filter(t => t.status === 'completed').length;
                          return (
                            <div key={weekKey} className="p-3">
                              <button onClick={() => toggleWeek(weekKey)} className="flex items-center gap-2 mb-2 w-full text-left">
                                {isWeekCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                <span className="text-xs font-medium">{WEEK_LABELS[weekNum] || `Week ${weekNum}`}</span>
                                <span className="text-[10px] text-muted-foreground">{weekComplete}/{weekTasks.length}</span>
                              </button>
                              {!isWeekCollapsed && (
                                <div className="space-y-2">
                                  {weekTasks.map(task => {
                                    const weekSubtasks = tasks.filter(t => t.parent_task_id === task.id && !t.is_deleted);
                                    return (
                                      <div key={task.id}>
                                        <SprintTaskItem
                                          task={task}
                                          sprintId={sprint.id}
                                          subtasks={weekSubtasks}
                                          notes={notes}
                                          docs={docs}
                                          reminders={reminders}
                                          onUpdate={fetchSprint}
                                          isLocked={task.locked && task.is_galileo_generated}
                                          onExpertHelp={setExpertTask}
                                        />
                                        <div className="ml-7 mt-1">
                                          {subtaskInputs[task.id] !== undefined ? (
                                            <div className="flex gap-1.5">
                                              <input
                                                value={subtaskInputs[task.id]}
                                                onChange={e => setSubtaskInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                                                onKeyDown={e => e.key === 'Enter' && handleAddSubtask(task.id, weekNum)}
                                                placeholder="Add a subtask..."
                                                className="flex-1 h-7 bg-secondary border border-border rounded-md px-2 text-[11px] outline-none focus:border-primary/50"
                                                autoFocus
                                              />
                                              <Button size="sm" className="h-7 text-[10px]"
                                                onClick={() => handleAddSubtask(task.id, weekNum)}
                                                disabled={addingSubtask === task.id || !subtaskInputs[task.id]?.trim()}>
                                                {addingSubtask === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                                              </Button>
                                              <Button variant="outline" size="sm" className="h-7 text-[10px]"
                                                onClick={() => setSubtaskInputs(prev => ({ ...prev, [task.id]: undefined }))}>
                                                Cancel
                                              </Button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => setSubtaskInputs(prev => ({ ...prev, [task.id]: '' }))}
                                              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                                            >
                                              <Plus className="w-3 h-3" /> Add subtask
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {mainTasks.length === 0 && (
            <div className="text-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Generating sprint tasks...</p>
            </div>
          )}
        </div>
      )}

      {/* ── TIMELINE VIEW ── */}
      {viewMode === 'timeline' && (
        <div className="rounded-xl border border-border overflow-hidden" style={{ backgroundColor: '#141418' }}>
          {monthGroups.map(group => (
            <div key={group.month} className="border-b border-border last:border-b-0">
              <div className="px-4 py-3 bg-secondary/30 flex items-center justify-between">
                <h4 className="text-xs font-semibold">{MONTH_LABELS[group.month]}</h4>
                <span className="text-[10px] text-muted-foreground">{group.completed}/{group.total} · {group.progress}%</span>
              </div>
              <div className="grid grid-cols-4 gap-0.5 p-1">
                {Array.from({ length: 4 }, (_, i) => {
                  const weekNum = (group.month - 1) * 4 + i + 1;
                  const weekTasks = mainTasks.filter(t => t.week_number === weekNum);
                  return (
                    <div key={weekNum} className="rounded-lg p-2 min-h-[80px]">
                      <p className="text-[9px] font-semibold text-muted-foreground mb-1.5">W{weekNum}</p>
                      <div className="space-y-1">
                        {weekTasks.map(t => {
                          const subs = tasks.filter(st => st.parent_task_id === t.id && !st.is_deleted);
                          const subComp = subs.filter(st => st.status === 'completed').length;
                          return (
                            <div key={t.id} className={`rounded-md px-2 py-1.5 text-[10px] border ${
                              t.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                              : t.status === 'in_progress' ? 'border-amber-500/30 bg-amber-500/5 text-amber-400'
                              : 'border-border bg-secondary/40 text-muted-foreground'
                            }`}>
                              <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[t.status]}`} />
                                <span className={`truncate ${t.status === 'completed' ? 'line-through' : ''}`}>{t.title}</span>
                              </div>
                              {subs.length > 0 && <p className="text-[8px] mt-0.5 ml-2.5 opacity-70">{subComp}/{subs.length} subtasks</p>}
                            </div>
                          );
                        })}
                        {weekTasks.length === 0 && <div className="h-6 rounded bg-secondary/20 border border-dashed border-border/50" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {mainTasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tasks to display</p>}
        </div>
      )}

      {expertTask && (
        <SprintExpertPanel
          task={expertTask}
          sprint={sprint}
          subtasks={tasks.filter(t => t.parent_task_id === expertTask.id && !t.is_deleted)}
          documentCount={docs.filter(d => (d.task_id || d.sprint_task_id) === expertTask.id).length}
          onOpen={onOpen}
          onClose={() => setExpertTask(null)}
        />
      )}

      {showConnectModal && (
        <ConnectCalendarModal
          onClose={() => setShowConnectModal(false)}
          onSync={() => setGoogleConnected(true)}
          onDownloadIcs={handleDownloadICS}
        />
      )}
    </div>
  );
}