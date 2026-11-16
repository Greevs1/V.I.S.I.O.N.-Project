#!/usr/bin/env node
/**
 * adminWorkspaceAccess.test.cjs — the VISION Admin workspace (P1 + P2).
 *
 * Run:  node scripts/adminWorkspaceAccess.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * browser, no production record read, created, modified or deleted.
 *
 *   UNIT   — the REAL src/lib/authz/adminAccess.js is executed in a node:vm
 *            sandbox (its `export` keywords are stripped) and the workspace's
 *            decision table is exercised: allow / deny / wait, fail-closed.
 *
 *   WIRING — static assertions on the shipped sources, proving:
 *            · Admin is registered as a VISION workspace pointing at the host
 *            · the host gates on the ONE canonical decision BEFORE AdminView is
 *              rendered or even downloaded, so ?workspace=admin fails closed
 *            · AdminView is REUSED (13 tabs, super_admin filter, no navigation)
 *            · neither the host nor the Admin surface can touch the owner-facing
 *              business context (activeBusinessId)
 *            · the shell (VisionHeader / Galileo bar / notifications) is the
 *              host shell's, not the workspace's
 *            · the legacy /admin route and HomeGate are unchanged
 *
 * NOTE ON EVIDENCE CLASS: everything here is UNIT/MOCK (sandbox) or
 * CONTROL-FLOW/STATIC (source). Browser behaviour (T10, T11, T12) is proven by
 * the invariants that make it true, not by driving a browser.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Comments are prose, not behaviour: assertions about code read code only. */
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^\s:'"`])\/\/[^\n]*/g, '$1');
const importsOf = (src) => (src.match(/^import[\s\S]*?from\s+'[^']+';/gm) || []).join('\n');

const MODULE = 'src/lib/authz/adminAccess.js';
const REGISTRY = 'src/lib/visionWorkspace/registry.js';
const HOST = 'src/components/admin/AdminWorkspaceHost.jsx';
const MENU = 'src/components/galileo/shell/VisionAccountMenu.jsx';
const ADMIN_VIEW = 'src/pages/admin/AdminView.jsx';
const ROUTER = 'src/App.jsx';
const GALILEO = 'src/pages/galileo/GalileoReimagined.jsx';
const WORKSPACE_LAYER = 'src/components/vision/workspace/VisionWorkspace.jsx';
const WORKSPACE_HOOK = 'src/hooks/useVisionWorkspace.js';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ── UNIT — load the REAL decision module into a sandbox ──────────────────────
let api;
try {
  api = vm.runInNewContext(
    `${read(MODULE).replace(/^\s*export\s+/gm, '')}\n;({ ADMIN_ROLES, isAdminRole, resolveAdminRouteAccess });`,
    {}
  );
} catch (err) {
  console.error(`FATAL  could not evaluate ${MODULE} in sandbox — ${err.message}`);
  process.exit(1);
}
const { ADMIN_ROLES, isAdminRole, resolveAdminRouteAccess } = api;

const at = (appRole, over = {}) =>
  resolveAdminRouteAccess({
    isAuthenticated: true,
    authChecked: true,
    isLoadingAuth: false,
    isLoadingProfile: false,
    appRole,
    ...over,
  });

console.log('\n── T1/T2/T3 — who may open the Admin workspace ──');
check('T1   admin          → ALLOW', at('admin') === 'allow', at('admin'));
check('T2   super_admin    → ALLOW', at('super_admin') === 'allow', at('super_admin'));
check('T3   owner          → DENY', at('owner') === 'deny', at('owner'));
check('T3   member         → DENY', at('member') === 'deny', at('member'));
check('T3   team_member    → DENY', at('team_member') === 'deny', at('team_member'));
check('T3   advisor        → DENY', at('advisor') === 'deny', at('advisor'));
check('T3   expert         → DENY', at('expert') === 'deny', at('expert'));
check('T3   expert_advisor → DENY', at('expert_advisor') === 'deny', at('expert_advisor'));
check('T3   user           → DENY', at('user') === 'deny', at('user'));
check('T3   null           → DENY', at(null) === 'deny', at(null));
check('T3   undefined      → DENY', at(undefined) === 'deny', at(undefined));
check('T3   ""             → DENY', at('') === 'deny', at(''));
check(
  'T3   unauthenticated + app_role=admin → DENY (authentication wins)',
  at('admin', { isAuthenticated: false }) === 'deny',
  'a hand-built URL must not authenticate anyone'
);
check(
  'T3   ADMIN_ROLES is still exactly admin + super_admin (no second role list)',
  ADMIN_ROLES.join(',') === 'admin,super_admin',
  ADMIN_ROLES.join(',')
);

console.log('\n── T4 — unresolved profile: WAIT, never early authorization ──');
check('T4   auth loading     → WAIT', at('admin', { isLoadingAuth: true, authChecked: false }) === 'wait');
check('T4   auth not checked → WAIT', at('admin', { authChecked: false }) === 'wait');
check('T4   profile loading  → WAIT', at('admin', { isLoadingProfile: true }) === 'wait');
check('T4   waiting is never allow — even for super_admin', at('super_admin', { isLoadingProfile: true }) === 'wait');
check(
  'T4   waiting is never deny — a legitimate admin is not bounced before the profile resolves',
  at(null, { isLoadingProfile: true }) === 'wait'
);
check(
  'T4   the predicate and the workspace decision agree for every sampled role',
  ['admin', 'super_admin', 'owner', 'member', 'advisor', 'expert', null, undefined].every((r) =>
    isAdminRole(r) ? at(r) === 'allow' : at(r) === 'deny'
  )
);

// ── sources ──────────────────────────────────────────────────────────────────
const registry = read(REGISTRY);
const host = read(HOST);
const hostCode = code(host);
const menu = read(MENU);
const adminView = read(ADMIN_VIEW);
const router = read(ROUTER);
const galileo = read(GALILEO);
const workspaceLayer = read(WORKSPACE_LAYER);
const workspaceHook = read(WORKSPACE_HOOK);

// ── WIRING — P1: registration ────────────────────────────────────────────────
console.log('\n── T5/T7/T8/T9 — P1 registration ──');
const adminEntry = registry.match(/admin:\s*\{[\s\S]*?\n\s*\},/);
check('T5   registry declares an `admin` workspace', !!adminEntry);
check(
  'T5   its component is the thin host (not a second Admin)',
  !!adminEntry && /lazy\(\(\) => import\('@\/components\/admin\/AdminWorkspaceHost'\)\)/.test(adminEntry[0])
);
check(
  'T5   it carries the standard registry shape (id / title / askContext / Component)',
  !!adminEntry &&
    /id:\s*'admin'/.test(adminEntry[0]) &&
    /title:/.test(adminEntry[0]) &&
    /askContext:/.test(adminEntry[0]) &&
    /Component:/.test(adminEntry[0])
);
check(
  'T5   registry still derives WORKSPACE_IDS from its own keys (one source of truth)',
  /export const WORKSPACE_IDS = Object\.keys\(WORKSPACES\);/.test(registry)
);
check(
  'T5   the Admin host is registered exactly once',
  (registry.match(/components\/admin\//g) || []).length === 1,
  String((registry.match(/components\/admin\//g) || []).length)
);

// ── WIRING — T3/T4: the workspace-level authorization gate ───────────────────
console.log('\n── T3/T4 — workspace-level gate (fail closed, before AdminView) ──');
check(
  'T3   host uses the ONE canonical decision',
  hostCode.includes("from '@/lib/authz/adminAccess'") && hostCode.includes('resolveAdminRouteAccess')
);
check(
  'T3   host reads the canonical app_role only',
  hostCode.includes('supabaseProfile?.app_role') && !/user\?\.role|localStorage|searchParams/.test(hostCode)
);
check('T4   wait renders a skeleton', /access === 'wait'\)\s*return <WorkspaceSkeleton/.test(hostCode));
check('T3   deny is fail-closed (allow-list: anything not allow is denied)', /if \(access !== 'allow'\)\s*return <Denied/.test(hostCode));
check(
  'T4   the wait/deny branches are checked BEFORE AdminView renders',
  hostCode.indexOf("access === 'wait'") < hostCode.indexOf('<AdminView') &&
    hostCode.indexOf("access !== 'allow'") < hostCode.indexOf('<AdminView')
);
check('T3   AdminView is rendered exactly once, inside the allow branch', (hostCode.match(/<AdminView/g) || []).length === 1);
check(
  'T3   AdminView is lazy-loaded, so a denied actor never downloads it',
  /const AdminView = lazy\(\(\) => import\('@\/pages\/admin\/AdminView'\)\)/.test(hostCode)
);
check(
  'T3   the denial surface fetches nothing (text + the layer\'s own Back)',
  /function Denied/.test(hostCode) && !/functions\.invoke|base44\./.test(hostCode)
);

// ── WIRING — T5: the EXISTING AdminView is reused, not recreated ─────────────
console.log('\n── T5 — the EXISTING AdminView is reused, not recreated ──');
const TAB_IMPORTS = [
  '@/components/admin/AdminUsers',
  '@/components/admin/AdminUserProfileContext',
  '@/components/admin/AdminWorksheets',
  '@/components/admin/AdminActivityLog',
  '@/components/admin/AdminAnalytics',
  '@/components/admin/AdminFiles',
  '@/components/admin/AdminBranding',
  '@/components/admin/AdminIntegrations',
  '@/pages/admin/StrategyLibraryManager',
  '@/pages/admin/ExpansionEngineTestPanel',
  '@/components/advisor/AdvisorCommandCenter',
  '@/components/admin/QACommandCenter',
  '@/components/admin/ExpertApplicationsManager',
  '@/components/sprint/SprintVerificationQueue',
];
check(
  'T5   all 13 tabs still render their pre-existing components',
  TAB_IMPORTS.every((p) => adminView.includes(`'${p}'`)),
  TAB_IMPORTS.filter((p) => !adminView.includes(`'${p}'`)).join(', ')
);
check(
  'T5   AdminView still declares its 13 tabs',
  (adminView.match(/\{ id: '[a-z_]+',\s+label:/g) || []).length === 13,
  String((adminView.match(/\{ id: '[a-z_]+',\s+label:/g) || []).length)
);
check('T5   AdminView is imported ONLY by the host and the legacy route', (() => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx|js)$/.test(e.name) && read(p).includes('admin/AdminView')) hits.push(p);
    }
  };
  walk('src');
  return hits.length === 2 && hits.some((h) => h.endsWith(HOST)) && hits.some((h) => h.endsWith('App.jsx'));
})());
check(
  'T5   AdminView kept its additive-props contract (defaults preserve the route)',
  /export default function AdminView\(\{ initialSubject = null, onSubjectChange \} = \{\}\)/.test(adminView)
);
check(
  'T5   the host passes ONLY those two additive props',
  /initialSubject=\{/.test(hostCode) && /onSubjectChange=\{/.test(hostCode)
);
check(
  'T5   AdminView still owns its tab state and its subject state',
  /const \[activeTab, setActiveTab\] = useState\('users'\)/.test(adminView) &&
    /const \[selectedUserContext, setSelectedUserContext\] = useState\(initialSubject \|\| null\)/.test(adminView)
);
check(
  'T5   the document viewer is untouched (reused, not replaced)',
  read('src/hooks/useDocumentViewer.js').includes("invoke('supabaseUserData'") &&
    adminView.length > 0 &&
    read('src/components/admin/AdminUserProfileContext.jsx').includes("from '@/components/documents/DocumentViewer'")
);

// ── WIRING — T6/T7/T8/T9 — no legacy chrome, shell chrome intact ─────────────
console.log('\n── T6/T7/T8/T9 — no legacy chrome, shell chrome intact ──');
check('T6   the host never imports AppLayout / Sidebar / TopBar', !/AppLayout|layout\/Sidebar|layout\/TopBar/.test(importsOf(host)));
check(
  'T7/T8/T9 the host imports no chrome — VisionHeader, the Galileo bar and the notification layer stay the shell\'s',
  !/VisionHeader|GlobalGalileoBar|AskGalileoBar|NotificationBell|NotificationBubble/.test(importsOf(host)) &&
    !/VisionHeader|GlobalGalileoBar|NotificationBell/.test(hostCode)
);
const visionHeaderSrc = read('src/components/galileo/home/VisionHeader.jsx');
check(
  'T7/T8/T9 the shell still renders those elements around the ONE workspace layer',
  /VisionHeader/.test(importsOf(galileo)) &&
    /GlobalGalileoBar/.test(importsOf(galileo)) &&
    /NotificationBell/.test(importsOf(visionHeaderSrc)) &&
    /<NotificationBell \/>/.test(visionHeaderSrc) &&
    /<VisionWorkspace/.test(galileo) &&
    /payload=\{workspace\.payload\}/.test(galileo) &&
    /onBack=\{workspace\.back\}/.test(galileo) &&
    /onClose=\{workspace\.close\}/.test(galileo)
);
check(
  'T7   the workspace layer still renders over Vision (no full-page takeover, no second chrome)',
  /layer-workspace/.test(workspaceLayer) && /WorkspaceHeader/.test(workspaceLayer)
);
check(
  'T12  Back/Close stay the layer\'s job (the host calls the layer, it never navigates)',
  /onBack\?\.\(\)/.test(hostCode) && !/useNavigate|window\.location/.test(hostCode)
);
check(
  'T12  the layer still owns trail-based Back and Close',
  /const back = useCallback/.test(workspaceHook) && /const close = useCallback/.test(workspaceHook) && /const open = useCallback/.test(workspaceHook)
);

// ── WIRING — T10/T11: the subject cannot touch activeBusinessId ──────────────
console.log('\n── T10/T11 — administrative subject ≠ active business ──');
const adminSurface = [];
const collect = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) collect(p);
    else if (/\.(jsx|js)$/.test(e.name)) adminSurface.push(p);
  }
};
collect('src/components/admin');
collect('src/pages/admin');
const coupled = adminSurface.filter((p) => /useBusinessContext|setActiveBusiness|active_business_id|activeBusinessId/.test(code(read(p))));
check('T10/T11 no file in the Admin surface touches the business context (host included)', coupled.length === 0, coupled.join(', '));
check(
  'T10/T11 the host imports no BusinessContext and sets no business',
  !/BusinessContext|active_business_id|activeBusinessId|setActiveBusiness|useBusinessContext/.test(hostCode)
);
check(
  'T11  the subject travels in the layer\'s own `id` slot (payload), not in business state',
  /const subjectEmail = payload \|\| null;/.test(hostCode) &&
    /onOpen\?\.\(ADMIN, nextEmail\)/.test(hostCode) &&
    /onReplace\?\.\(ADMIN, nextEmail\)/.test(hostCode)
);
check(
  'T10  the workspace layer writes only its own trail (it never writes the active business)',
  /setTrail/.test(workspaceHook) &&
    !/setActiveBusiness/.test(workspaceHook) &&
    !/active_business_id\s*[:=]/.test(workspaceHook),
  'active_business_id is only READ here, to detect a real business switch'
);

// ── WIRING — T13/T14: existing Admin behaviour, account actions ──────────────
console.log('\n── T13/T14 — existing Admin behaviour and account actions ──');
check(
  'T13  the super_admin tab filter is unchanged',
  (adminView.match(/superAdminOnly: true/g) || []).length === 4 &&
    /const superAdminOnlyIds = \['branding', 'strategy', 'expansion', 'developer'\]/.test(adminView)
);
check('T13  the role-based tab filter is unchanged', /ALL_TABS\.filter\(t => !t\.superAdminOnly \|\| isSuperAdmin\)/.test(adminView));
check('T13  tabs 8–10 / 13 are still blocked for a non-super_admin', /const isTabBlocked = \(tabId\) => superAdminOnlyIds\.includes\(tabId\) && !isSuperAdmin;/.test(adminView));
const tabFiles = TAB_IMPORTS.map((p) => `src/${p.replace('@/', '')}.jsx`).filter((p) => fs.existsSync(path.join(ROOT, p))).concat([ADMIN_VIEW, HOST]);
const escapees = tabFiles.filter((p) => /useNavigate\(|navigate\('/.test(code(read(p))));
check('T13  no Admin tab navigates away from VISION', escapees.length === 0, escapees.join(', '));
check('T13  Strategy Library does not navigate', !/useNavigate|navigate\(/.test(code(read('src/pages/admin/StrategyLibraryManager.jsx'))));
check('T13  Expansion Engine does not navigate', !/useNavigate|navigate\(/.test(code(read('src/pages/admin/ExpansionEngineTestPanel.jsx'))));
check('T14  the menu opens Admin as a workspace', /onOpenWorkspace\('admin'\)/.test(menu));
check('T14  the menu keeps the /admin route as its fallback', /else navigate\('\/admin'\)/.test(menu));
check('T14  the menu still gates the item on canAdmin + the shared predicate', /canAdmin &&/.test(menu) && /isAdminRole/.test(menu));
check('T14  Settings still opens the workspace (unchanged)', /onOpenWorkspace\('settings'\)/.test(menu));
check('T14  Sign Out is still wired', /const handleSignOut/.test(menu) && /logout\(\)/.test(menu));

// ── WIRING — legacy /admin preserved (approved transitional behaviour) ────────
console.log('\n── legacy /admin — preserved, protected, unchanged ──');
check('T15  /admin is still registered', router.includes('<Route path="/admin"'));
check(
  'T15  /admin is still wrapped by RequireAdminRole around the reused AdminView',
  /element=\{<RequireAdminRole><AdminView \/><\/RequireAdminRole>\}/.test(router) ||
    /element=\{<RequireAdminRole> <AdminView \/> <\/RequireAdminRole>\}/.test(router)
);
check(
  'T15  HomeGate was not touched (no auto-route for admin)',
  !/case 'admin':\s*return <Navigate to="\/admin"/.test(router) &&
    /case 'super_admin': return <Navigate to="\/admin" replace \/>;/.test(router)
);
check('T15  App.jsx mounts no Admin workspace (no route/bootstrap change)', !/AdminWorkspaceHost/.test(router));
check('T15  RequireAdminRole itself is untouched (still the canonical gate)', /resolveAdminRouteAccess/.test(read('src/components/authz/RequireAdminRole.jsx')));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(70));
if (failures.length) {
  console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
  failures.forEach((f) => console.log(`   · ${f}`));
  process.exit(1);
}
console.log('RESULT: PASS — all assertions passed (workspace decision table + P1/P2 wiring).');
console.log('No network, database or production record was touched by this script.');