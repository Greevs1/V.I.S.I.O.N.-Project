#!/usr/bin/env node
/**
 * adminRouteAccess.test.cjs — the /admin route gate and its shared role decision.
 *
 * Run:  node scripts/adminRouteAccess.test.cjs
 *
 * OFFLINE AND NON-DESTRUCTIVE. No network, no database, no Base44 call, no
 * browser. It creates, modifies and deletes nothing in production.
 *
 *   UNIT — the REAL source of src/lib/authz/adminAccess.js is executed in a
 *     node:vm sandbox (the `export` keyword is stripped, which is why the module
 *     keeps its decisions as plain exported functions) and the full decision
 *     table is exercised.
 *
 *   WIRING — static assertions on the shipped sources proving that the gate is
 *     actually mounted ahead of AdminView, that a denied actor cannot reach
 *     AdminView at all, and that the menu reads the same predicate.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MODULE = 'src/lib/authz/adminAccess.js';
const GATE = 'src/components/authz/RequireAdminRole.jsx';
const MENU = 'src/components/galileo/shell/VisionAccountMenu.jsx';
const ROUTER = 'src/App.jsx';

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Load the REAL decision module into a sandbox.
// ─────────────────────────────────────────────────────────────────────────────
const moduleSource = fs.readFileSync(path.join(ROOT, MODULE), 'utf8');

let api;
try {
  const runtime = moduleSource.replace(/^\s*export\s+/gm, '');
  api = vm.runInNewContext(
    `${runtime}\n;({ ADMIN_ROLES, isAdminRole, resolveAdminRouteAccess });`,
    {}
  );
} catch (err) {
  console.error(`FATAL  could not evaluate ${MODULE} in sandbox — ${err.message}`);
  process.exit(1);
}

const { ADMIN_ROLES, isAdminRole, resolveAdminRouteAccess } = api;

// ─────────────────────────────────────────────────────────────────────────────
// The decision table.
// ─────────────────────────────────────────────────────────────────────────────
const resolved = (appRole, over = {}) =>
  resolveAdminRouteAccess({
    isAuthenticated: true,
    authChecked: true,
    isLoadingAuth: false,
    isLoadingProfile: false,
    appRole,
    ...over,
  });

console.log('\n── UNIT — canonical roles ──');

check('ADMIN_ROLES is exactly admin + super_admin', ADMIN_ROLES.join(',') === 'admin,super_admin', ADMIN_ROLES.join(','));

check('app_role = admin        → ALLOW', resolved('admin') === 'allow', resolved('admin'));
check('app_role = super_admin  → ALLOW', resolved('super_admin') === 'allow', resolved('super_admin'));
check('app_role = owner        → DENY', resolved('owner') === 'deny', resolved('owner'));
check('app_role = member       → DENY', resolved('member') === 'deny', resolved('member'));
check('app_role = team_member  → DENY', resolved('team_member') === 'deny', resolved('team_member'));
check('app_role = advisor      → DENY', resolved('advisor') === 'deny', resolved('advisor'));
check('app_role = expert       → DENY', resolved('expert') === 'deny', resolved('expert'));
check('app_role = expert_advisor → DENY', resolved('expert_advisor') === 'deny', resolved('expert_advisor'));
check('app_role = user         → DENY', resolved('user') === 'deny', resolved('user'));
check('app_role = null         → DENY', resolved(null) === 'deny', resolved(null));
check('app_role = undefined    → DENY', resolved(undefined) === 'deny', resolved(undefined));
check('app_role = ""           → DENY', resolved('') === 'deny', resolved(''));

console.log('\n── UNIT — fail closed ──');

check(
  'profile missing (null), auth resolved → DENY',
  resolveAdminRouteAccess({ isAuthenticated: true, authChecked: true, isLoadingAuth: false, isLoadingProfile: false, appRole: null }) === 'deny'
);
check(
  'unauthenticated, auth resolved → DENY',
  resolveAdminRouteAccess({ isAuthenticated: false, authChecked: true, isLoadingAuth: false, isLoadingProfile: false, appRole: 'admin' }) === 'deny',
  'an unauthenticated caller must never be allowed'
);
check(
  'unauthenticated + admin app_role → DENY (authentication wins)',
  resolveAdminRouteAccess({ isAuthenticated: false, authChecked: true, isLoadingAuth: false, isLoadingProfile: false, appRole: 'super_admin' }) === 'deny'
);

console.log('\n── UNIT — never authorize while unresolved ──');

check('auth still loading → WAIT', resolveAdminRouteAccess({ isAuthenticated: true, authChecked: false, isLoadingAuth: true, isLoadingProfile: false, appRole: 'admin' }) === 'wait');
check('profile still loading → WAIT', resolveAdminRouteAccess({ isAuthenticated: true, authChecked: true, isLoadingAuth: false, isLoadingProfile: true, appRole: 'admin' }) === 'wait');
check('auth not yet checked → WAIT', resolveAdminRouteAccess({ isAuthenticated: true, authChecked: false, isLoadingAuth: false, isLoadingProfile: false, appRole: 'admin' }) === 'wait');
check(
  'waiting is never "allow" — even for a super_admin',
  resolveAdminRouteAccess({ isAuthenticated: true, authChecked: true, isLoadingAuth: false, isLoadingProfile: true, appRole: 'super_admin' }) === 'wait',
  'unresolved must not authorize'
);
check(
  'waiting is never "deny" — a legitimate admin is not bounced before the profile resolves',
  resolveAdminRouteAccess({ isAuthenticated: true, authChecked: true, isLoadingAuth: false, isLoadingProfile: true, appRole: null }) === 'wait'
);

console.log('\n── UNIT — the predicate matches the route decision ──');
check(
  'isAdminRole and resolveAdminRouteAccess agree for every sampled role',
  ['admin', 'super_admin', 'owner', 'member', 'advisor', 'expert', null, undefined].every(
    (r) => (isAdminRole(r) ? resolved(r) === 'allow' : resolved(r) === 'deny')
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// WIRING — static assertions on the shipped sources.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── WIRING — route gate ──');
const router = fs.readFileSync(path.join(ROOT, ROUTER), 'utf8');
const gate = fs.readFileSync(path.join(ROOT, GATE), 'utf8');
const menu = fs.readFileSync(path.join(ROOT, MENU), 'utf8');

const adminRoute = router.match(/<Route path="\/admin" element=\{[\s\S]*?\} \/>/);
check('CF   /admin route exists', !!adminRoute);
check(
  'CF   /admin is wrapped by RequireAdminRole',
  !!adminRoute && adminRoute[0].includes('<RequireAdminRole>') && adminRoute[0].includes('<AdminView />')
);
check(
  'CF   AdminView sits INSIDE the gate (gated element, not a sibling)',
  !!adminRoute && /<RequireAdminRole>\s*<AdminView \/>\s*<\/RequireAdminRole>/.test(adminRoute[0])
);
check('CF   gate is imported', /import RequireAdminRole from '@\/components\/authz\/RequireAdminRole'/.test(router));
check(
  'CF   /dev/supabase-status shares the admin gate (sole entry point is the admin menu)',
  /<Route path="\/dev\/supabase-status" element=\{<RequireAdminRole>/.test(router)
);
check(
  'CF   /team is NOT admin-gated (owner / team_member surface)',
  /<Route path="\/team" element=\{<MyTeam \/>\} \/>/.test(router)
);
check(
  'CF   /expert-advisors is NOT admin-gated (advisor / expert_advisor surface)',
  /<Route path="\/expert-advisors" element=\{<ExpertAdvisorsView \/>\} \/>/.test(router)
);
check(
  'CF   /admin/business-valuations keeps its OWN super_admin rule (unchanged)',
  !/path="\/admin\/business-valuations" element=\{<RequireAdminRole>/.test(router)
);

console.log('\n── WIRING — denial cannot render AdminView ──');
check('CF   denied → Navigate with replace (no history trap)', /access === 'deny'\)\s*return <Navigate to="\/" replace \/>/.test(gate));
check('CF   denial path is checked BEFORE children render', gate.indexOf("access === 'deny'") < gate.indexOf('return children'));
check('CF   AdminView is never imported by the gate (it cannot mount it)', !gate.includes('AdminView'));
check('CF   wait renders a loading state, not children', /access === 'wait'\)\s*return <WaitingForProfile \/>/.test(gate));
check('CF   gate reads the canonical app_role only', gate.includes('supabaseProfile?.app_role') && !/user\?\.role|localStorage|searchParams/.test(gate));
check('CF   gate uses the shared decision module', gate.includes("from '@/lib/authz/adminAccess'"));

console.log('\n── WIRING — menu and route share ONE predicate ──');
check('CF   menu uses isAdminRole from the shared module', menu.includes("isAdminRole") && menu.includes("from '@/lib/authz/adminAccess'"));
check(
  'CF   menu no longer keeps its own admin role list',
  !/const ADMIN_ROLES\s*=/.test(menu) && !/=== 'super_admin'/.test(menu)
);
check('CF   menu still gates the Admin entry on that predicate', /canAdmin\s*&&/.test(menu));
check('CF   menu reads the canonical app_role', menu.includes('supabaseProfile?.app_role'));

console.log('\n── WIRING — HomeGate deliberately unchanged (approved decision) ──');
// APPROVED DECISION: VISION is the default operating experience. Admin is an
// elevated workspace reached via Profile → Admin, so canonical `admin` users are
// intentionally NOT sent to /admin at login. The pre-existing super_admin
// behavior is left exactly as it was — adopted deliberately, not drift.
check(
  'CF   HomeGate still lands only super_admin in Admin and does NOT auto-route admin',
  /case 'super_admin': return <Navigate to="\/admin" replace \/>;/.test(router) && !/case 'admin':\s*return <Navigate to="\/admin"/.test(router)
);

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n' + '─'.repeat(70));
  if (failures.length) {
    console.log(`RESULT: FAIL — ${failures.length} assertion(s) failed`);
    failures.forEach((f) => console.log(`   · ${f}`));
    process.exit(1);
  }
  console.log('RESULT: PASS — all assertions passed (unit decision table + route wiring).');
  console.log('No network, database or production record was touched by this script.');
})();