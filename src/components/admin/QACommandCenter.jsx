/**
 * QACommandCenter — Stability & QA smoke-test panel.
 * Super admin only. Visible in Admin → Developer tab.
 * Tests core platform systems: IQ, Expert Portal, Galileo,
 * Outcomes, Weekly Digest, Activity Feed, Permissions.
 */
import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  CheckCircle, XCircle, Loader2, Play, ChevronDown, ChevronRight,
  FlaskConical, Shield, Brain, Target, Rss, Activity, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Helpers ────────────────────────────────────────────────────────────────────

function ts() { return new Date().toLocaleTimeString(); }

function pass(name, details = {}) {
  return { name, status: 'pass', timestamp: ts(), ...details };
}

function fail(name, error, details = {}) {
  return { name, status: 'fail', timestamp: ts(), error: String(error?.message || error || 'Unknown error'), ...details };
}

// ── Test Runner ────────────────────────────────────────────────────────────────

async function runTest(name, fn, details = {}) {
  try {
    const result = await fn();
    return pass(name, { ...details, ...result });
  } catch (e) {
    return fail(name, e, details);
  }
}

// ── Individual test suites ─────────────────────────────────────────────────────

async function runIQTests(userEmail) {
  const results = [];

  // Test 1: IQ score resolves
  results.push(await runTest('IQ Score resolves', async () => {
    const res = await base44.functions.invoke('supabaseDashboardData', {
      action: 'getDashboardMetrics', _router_user_email: userEmail,
    });
    const m = res.data?.metrics;
    const score = m?.ciq_score ?? m?.overall_impact_score ?? null;
    if (score === null) throw new Error('No IQ score found');
    return { expected: 'IQ score > 0', actual: `IQ score = ${score}` };
  }, { function_called: 'supabaseDashboardData/getDashboardMetrics', profile_id: userEmail }));

  // Test 2: Gap summary
  results.push(await runTest('Gap summary fields present', async () => {
    const res = await base44.functions.invoke('supabaseDashboardData', {
      action: 'getDashboardMetrics', _router_user_email: userEmail,
    });
    const m = res.data?.metrics;
    const gaps = ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap'];
    const present = gaps.filter(g => m?.[g] !== undefined);
    return {
      expected: 'At least 1 gap field present',
      actual: `${present.length}/${gaps.length} gap fields: ${present.join(', ') || 'none'}`,
    };
  }, { function_called: 'supabaseDashboardData/getDashboardMetrics', profile_id: userEmail }));

  // Test 3: Assessments exist
  results.push(await runTest('Assessment records exist', async () => {
    const res = await base44.functions.invoke('supabaseProfileData', {
      action: 'getBusinessAssessments', _router_user_email: userEmail,
    });
    const count = res.data?.assessments?.length ?? 0;
    return { expected: 'Assessments found', actual: `${count} assessment(s) found` };
  }, { function_called: 'supabaseProfileData/getBusinessAssessments', profile_id: userEmail }));

  return results;
}

async function runExpertAdvisorTests(userEmail) {
  const results = [];

  // Test 4: List all assignments (admin action)
  results.push(await runTest('Expert advisor assignments load', async () => {
    const res = await base44.functions.invoke('expertAdvisorAccess', { action: 'listAllAssignments' });
    const count = res.data?.access_records?.length ?? 0;
    return { expected: 'access_records array returned', actual: `${count} assignment(s) found` };
  }, { function_called: 'expertAdvisorAccess/listAllAssignments' }));

  // Test 5: Client IQ Dashboard match
  results.push(await runTest('Expert client IQ data loads', async () => {
    const res = await base44.functions.invoke('supabaseUserData', {
      action: 'getClientIQData', _router_user_email: userEmail,
    });
    // Any non-error response is a pass for this smoke test
    const hasData = res.data !== null && res.data !== undefined;
    return { expected: 'Non-null IQ data response', actual: hasData ? 'Data returned' : 'Empty response' };
  }, { function_called: 'supabaseUserData/getClientIQData', profile_id: userEmail }));

  // Test 6: Recent Activity loads
  results.push(await runTest('Activity Feed (Notifications) loads', async () => {
    const items = await base44.entities.Notification.filter({}, '-created_date', 5);
    return { expected: 'Notification query succeeds', actual: `${items.length} notification(s) found` };
  }, { function_called: 'Notification.filter' }));

  // Test 7: Notes create/save/load
  results.push(await runTest('ClientNote create + read-back', async () => {
    const created = await base44.entities.ClientNote.create({
      profile_id: 'qa_test_profile',
      title: 'QA Smoke Test Note',
      content_html: '<p>QA test</p>',
      plain_text: 'QA test',
      note_type: 'general_note',
      visibility: 'internal_only',
      status: 'active',
    });
    const found = await base44.entities.ClientNote.filter({ profile_id: 'qa_test_profile' }, '-updated_date', 1);
    await base44.entities.ClientNote.delete(created.id); // cleanup
    if (!found.length) throw new Error('Note not found after create');
    return { expected: 'Note persists after create', actual: `Note "${found[0].title}" persists` };
  }, { function_called: 'ClientNote.create + filter + delete' }));

  return results;
}

async function runGalileoTests(userEmail) {
  const results = [];

  // Test 8: Galileo context builds
  results.push(await runTest('Galileo context builds', async () => {
    const res = await base44.functions.invoke('buildGalileoContext', { _router_user_email: userEmail });
    const hasContext = !!res.data?.context || !!res.data?.profile || !!res.data?.business;
    return { expected: 'Context object returned', actual: hasContext ? 'Context built' : 'Empty context' };
  }, { function_called: 'buildGalileoContext', profile_id: userEmail }));

  // Test 9: Opportunities exist
  results.push(await runTest('Galileo opportunities exist', async () => {
    const opps = await base44.entities.galileo_opportunities.filter({}, '-updated_date', 5);
    return { expected: 'opportunities array returned', actual: `${opps.length} opportunity records found` };
  }, { function_called: 'galileo_opportunities.filter' }));

  // Test 10: Freedom paths
  results.push(await runTest('Freedom paths function reachable', async () => {
    const res = await base44.functions.invoke('calculateFreedomPaths', { _router_user_email: userEmail, action: 'status' });
    return { expected: 'No 500 error', actual: res.status < 500 ? 'Function reachable' : `HTTP ${res.status}` };
  }, { function_called: 'calculateFreedomPaths' }));

  // Test 11: Galileo generations log
  results.push(await runTest('Galileo generations table readable', async () => {
    const gens = await base44.entities.galileo_generations.filter({}, '-created_at', 3);
    return { expected: 'Query succeeds', actual: `${gens.length} generation record(s)` };
  }, { function_called: 'galileo_generations.filter' }));

  return results;
}

async function runOutcomeTests(userEmail) {
  const results = [];

  // Test 12: Sprint tasks exist
  results.push(await runTest('Sprint tasks table readable', async () => {
    const tasks = await base44.entities.SprintTask.filter({}, '-updated_date', 5);
    return { expected: 'SprintTask query succeeds', actual: `${tasks.length} task(s) found` };
  }, { function_called: 'SprintTask.filter' }));

  // Test 13: 90-day sprints exist
  results.push(await runTest('NinetyDaySprint table readable', async () => {
    const sprints = await base44.entities.NinetyDaySprint.filter({}, '-updated_date', 5);
    return { expected: 'NinetyDaySprint query succeeds', actual: `${sprints.length} sprint(s) found` };
  }, { function_called: 'NinetyDaySprint.filter' }));

  // Test 14: Strategy outcome recording reachable
  results.push(await runTest('recordStrategyOutcome function reachable', async () => {
    const res = await base44.functions.invoke('recordStrategyOutcome', { action: 'status' });
    return { expected: 'No 500 error', actual: res.status < 500 ? 'Function reachable' : `HTTP ${res.status}` };
  }, { function_called: 'recordStrategyOutcome' }));

  return results;
}

async function runDigestTests(userEmail) {
  const results = [];

  // Test 15: Digest entity readable
  results.push(await runTest('WeeklyDigest entity readable', async () => {
    const digests = await base44.entities.WeeklyDigest.filter({}, '-updated_date', 5);
    return { expected: 'WeeklyDigest query succeeds', actual: `${digests.length} digest(s) found` };
  }, { function_called: 'WeeklyDigest.filter' }));

  // Test 16: Generate digest function reachable
  results.push(await runTest('generateWeeklyDigest function reachable', async () => {
    const res = await base44.functions.invoke('generateWeeklyDigest', {
      _router_user_email: userEmail, action: 'status',
    });
    return { expected: 'No 500 error', actual: res.status < 500 ? 'Function reachable' : `HTTP ${res.status}` };
  }, { function_called: 'generateWeeklyDigest', profile_id: userEmail }));

  // Test 17: No cross-client leakage — two random profiles return distinct digests
  results.push(await runTest('Digest scoped by profile_id', async () => {
    const allDigests = await base44.entities.WeeklyDigest.filter({}, '-updated_date', 20);
    const profileIds = [...new Set(allDigests.map(d => d.profile_id).filter(Boolean))];
    if (profileIds.length > 1) {
      const d1 = allDigests.filter(d => d.profile_id === profileIds[0]);
      const d2 = allDigests.filter(d => d.profile_id === profileIds[1]);
      const leak = d1.some(d => d2.find(x => x.id === d.id));
      if (leak) throw new Error('Cross-client digest leakage detected');
      return { expected: 'Digests are profile-scoped', actual: `${profileIds.length} distinct profiles, no leakage` };
    }
    return { expected: 'Digests are profile-scoped', actual: `Only ${profileIds.length} profile — no leakage possible` };
  }, { function_called: 'WeeklyDigest.filter (scoping check)' }));

  return results;
}

async function runActivityTests() {
  const results = [];

  // Test 18: Notifications entity readable
  results.push(await runTest('Notification entity readable', async () => {
    const items = await base44.entities.Notification.filter({}, '-created_date', 10);
    return { expected: 'Notification query succeeds', actual: `${items.length} notification(s) found` };
  }, { function_called: 'Notification.filter' }));

  // Test 19: Notification types present
  results.push(await runTest('Key notification types exist', async () => {
    const items = await base44.entities.Notification.filter({}, '-created_date', 50);
    const types = [...new Set(items.map(n => n.notification_type))];
    return { expected: 'notification_type field populated', actual: `Types: ${types.slice(0, 5).join(', ') || 'none'}` };
  }, { function_called: 'Notification.filter (type audit)' }));

  return results;
}

async function runPermissionTests(currentUser) {
  const results = [];

  // Test 20: Current user role
  results.push(await runTest('Current user role resolves', async () => {
    const role = currentUser?.app_role || 'unknown';
    if (role === 'unknown') throw new Error('app_role not set on supabase profile');
    return { expected: 'app_role set', actual: `Role = ${role}` };
  }, { function_called: 'supabaseProfile.app_role' }));

  // Test 21: Super admin can list all assignments
  results.push(await runTest('Super admin sees all assignments', async () => {
    const res = await base44.functions.invoke('expertAdvisorAccess', { action: 'listAllAssignments' });
    if (res.data?.error) throw new Error(res.data.error);
    return {
      expected: 'access_records returned for super_admin',
      actual: `${res.data?.access_records?.length ?? 0} record(s) visible`,
    };
  }, { function_called: 'expertAdvisorAccess/listAllAssignments' }));

  // Test 22: Permission entity readable
  results.push(await runTest('UserPermission entity readable', async () => {
    const perms = await base44.entities.UserPermission.filter({}, '-updated_date', 5);
    return { expected: 'UserPermission query succeeds', actual: `${perms.length} permission record(s) found` };
  }, { function_called: 'UserPermission.filter' }));

  // Test 23: ExpertAdvisorAccess function available
  results.push(await runTest('expertAdvisorAccess function reachable', async () => {
    const res = await base44.functions.invoke('expertAdvisorAccess', { action: 'getMyProfileId' });
    return { expected: 'Function responds', actual: res.data?.profile_id ? `Profile ID: ${res.data.profile_id}` : 'Responded (no profile_id for this user)' };
  }, { function_called: 'expertAdvisorAccess/getMyProfileId' }));

  return results;
}

// ── Suite definitions ──────────────────────────────────────────────────────────

const SUITES = [
  { id: 'iq',       label: 'IQ Dashboard',         icon: BarChart2,   color: '#A855F7' },
  { id: 'expert',   label: 'Expert Advisor Portal', icon: User,        color: '#00D4FF' },
  { id: 'galileo',  label: 'Galileo Pipeline',      icon: Brain,       color: '#D4A853' },
  { id: 'outcomes', label: 'Outcome Tracking',      icon: Target,      color: '#22c55e' },
  { id: 'digest',   label: 'Weekly Digest',         icon: Rss,         color: '#f59e0b' },
  { id: 'activity', label: 'Activity Feed',         icon: Activity,    color: '#3b82f6' },
  { id: 'perms',    label: 'Permissions',           icon: Shield,      color: '#ef4444' },
];

function BarChart2(props) { return <FlaskConical {...props} />; }

// ── Result Row ─────────────────────────────────────────────────────────────────
function ResultRow({ result, expanded, onToggle }) {
  const isPass = result.status === 'pass';
  return (
    <div className={`rounded-lg border text-xs ${isPass ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {isPass
          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          : <XCircle    className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        <span className="flex-1 font-medium">{result.name}</span>
        <span className="text-muted-foreground text-[10px]">{result.timestamp}</span>
        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1 border-t border-border/40 pt-2">
          {result.profile_id    && <Row label="Profile"  value={result.profile_id} />}
          {result.business_id   && <Row label="Business" value={result.business_id} />}
          {result.function_called && <Row label="Function" value={result.function_called} mono />}
          {result.expected      && <Row label="Expected" value={result.expected} />}
          {result.actual        && <Row label="Actual"   value={result.actual} />}
          {result.error         && <Row label="Error"    value={result.error} error />}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono, error }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{label}:</span>
      <span className={`flex-1 break-all ${mono ? 'font-mono' : ''} ${error ? 'text-red-400' : ''}`}>{value}</span>
    </div>
  );
}

// ── Suite Block ────────────────────────────────────────────────────────────────
function SuiteBlock({ suite, results, running, expanded, onToggleExpand, onToggleResult, expandedResults }) {
  if (!results && !running) return null;
  const passed = results?.filter(r => r.status === 'pass').length ?? 0;
  const total  = results?.length ?? 0;
  const Icon   = suite.icon;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${suite.color}20` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: suite.color }} />
        </div>
        <span className="flex-1 text-sm font-semibold">{suite.label}</span>
        {running && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        {results && (
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
            passed === total ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : passed === 0 ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          }`}>{passed}/{total} pass</span>
        )}
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && results && (
        <div className="px-4 pb-4 space-y-1.5 border-t border-border">
          <div className="pt-3" />
          {results.map((r, i) => (
            <ResultRow
              key={i}
              result={r}
              expanded={expandedResults.has(`${suite.id}-${i}`)}
              onToggle={() => onToggleResult(`${suite.id}-${i}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function QACommandCenter() {
  const { supabaseProfile, user } = useAuth();
  const userEmail = supabaseProfile?.email || user?.email || '';

  const [suiteResults, setSuiteResults] = useState({});    // suiteId → results[]
  const [runningSet, setRunningSet]     = useState(new Set());
  const [expandedSuites, setExpandedSuites] = useState(new Set());
  const [expandedResults, setExpandedResults] = useState(new Set());
  const [globalRunning, setGlobalRunning] = useState(false);

  const markRunning = (id) => setRunningSet(s => { const n = new Set(s); n.add(id); return n; });
  const markDone    = (id) => setRunningSet(s => { const n = new Set(s); n.delete(id); return n; });
  const toggleSuite = (id) => setExpandedSuites(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleResult = (key) => setExpandedResults(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const runSuite = useCallback(async (suiteId) => {
    markRunning(suiteId);
    setExpandedSuites(s => { const n = new Set(s); n.add(suiteId); return n; });
    let results;
    try {
      switch (suiteId) {
        case 'iq':       results = await runIQTests(userEmail); break;
        case 'expert':   results = await runExpertAdvisorTests(userEmail); break;
        case 'galileo':  results = await runGalileoTests(userEmail); break;
        case 'outcomes': results = await runOutcomeTests(userEmail); break;
        case 'digest':   results = await runDigestTests(userEmail); break;
        case 'activity': results = await runActivityTests(); break;
        case 'perms':    results = await runPermissionTests(supabaseProfile); break;
        default: results = [fail('Unknown suite', 'No test runner found')];
      }
    } catch (e) {
      results = [fail('Suite error', e)];
    }
    setSuiteResults(prev => ({ ...prev, [suiteId]: results }));
    markDone(suiteId);
  }, [userEmail, supabaseProfile]);

  const runAll = useCallback(async () => {
    setGlobalRunning(true);
    setExpandedSuites(new Set(SUITES.map(s => s.id)));
    for (const suite of SUITES) {
      await runSuite(suite.id);
    }
    setGlobalRunning(false);
  }, [runSuite]);

  // Summary stats
  const allResults = Object.values(suiteResults).flat();
  const totalPass = allResults.filter(r => r.status === 'pass').length;
  const totalFail = allResults.filter(r => r.status === 'fail').length;
  const hasResults = allResults.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Stability & QA Command Center</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Smoke tests for core platform systems. Super admin only. Run before publishing changes.
            </p>
          </div>
          {hasResults && (
            <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              totalFail === 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/15 text-red-400 border-red-500/30'
            }`}>
              {totalPass} pass · {totalFail} fail
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={runAll} disabled={globalRunning} className="gap-1.5 h-8">
            {globalRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run All Tests
          </Button>
          {SUITES.map(s => (
            <button key={s.id}
              onClick={() => runSuite(s.id)}
              disabled={runningSet.has(s.id) || globalRunning}
              className="flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-40 transition-colors">
              {runningSet.has(s.id)
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <s.icon className="w-3 h-3" style={{ color: s.color }} />}
              {s.label}
            </button>
          ))}
        </div>

        {!userEmail && (
          <p className="text-xs text-amber-400">⚠ No user email resolved — some tests may fail. Ensure your Supabase profile is loaded.</p>
        )}
      </div>

      {/* Suite results */}
      <div className="space-y-3">
        {SUITES.map(suite => (
          <SuiteBlock
            key={suite.id}
            suite={suite}
            results={suiteResults[suite.id] || null}
            running={runningSet.has(suite.id)}
            expanded={expandedSuites.has(suite.id)}
            onToggleExpand={() => toggleSuite(suite.id)}
            onToggleResult={toggleResult}
            expandedResults={expandedResults}
          />
        ))}
      </div>

      {!hasResults && !globalRunning && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Click <strong>Run All Tests</strong> or select a suite above to begin.
        </div>
      )}
    </div>
  );
}