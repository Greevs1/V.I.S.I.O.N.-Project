# SPRINT EXPERT ACCESS — FINAL QA REPAIR REPORT

Scope: 90-Day Sprint expert-role pills → Expert entitlement → contextual handoff.
Presentation, entitlement and orchestration ONLY. The Sprint engine was not modified.
Not published. Phase 6C not begun.

---

## 1. Exact authoritative Expert entitlement discovered

The Expert ecosystem is gated by ONE existing rule, already in the codebase:

```
ExpertNetwork.jsx
  const { isPaid } = useMembership();
  const gated = !isPaid && (activeTab === 'find' || activeTab === 'mine');
  <PremiumWorkspaceOverlay isPaid={!gated} feature="Expert Network" …>
```

`useMembership()` (src/lib/useMembership.js) resolves `isPaid` as:

- `role` ∈ {`super_admin`, `advisor`, `admin`, `expert`} → tier `'advisor'` (full access);
- else `profiles.membership_tier` / `subscription_tier` ∈ {`member`, `pro`, `premium`} → `'member'`;
- else `profiles.subscription_status` ∈ {`active`, `trialing`} → `'member'`;
- else `'free'`.

There is **no** separate expert SKU, no `expert_network` feature flag, and no
product/package table for expert services. `ExpertRecommendations` and the workspace
surfaces gate on the same `isPaid`.

**Answer: "This owner has Expert access" ⇔ `useMembership().isPaid === true`
(active membership), or an internal role under the existing authorization model.**

## 2. Does the current member tier include Expert access?

Yes. In this application the paid membership tier **is** the Expert entitlement —
that is what `ExpertNetwork` already enforces. Expert access is not a second
purchase, so nothing new was invented and no second membership system was created.

## 3. Does an advisor relationship itself imply paid access?

**No**, and it is not treated as one.

- `expert_advisor_access` is an admin-created relationship/authorization record
  (`expertAdvisorAccess` action `grant`), read owner-side by `getMyAdvisor`.
- `business_entities.assigned_advisor_id` is an assignment on the business.
- `client_saved_experts` is a saved list.

Any of these can be historical, an internal assignment, or a lead association. None
is a purchase signal. A relationship with `isPaid === false` resolves to **LOCKED**:
no ecosystem, no directory, no profile, no contact detail.

## 4. Fail-closed behavior

- Profile still loading → `pending: true`, state LOCKED, surface shows
  "Checking your expert access." No sales copy, no ecosystem.
- Membership unresolved/failed → `isPaid` false → LOCKED.
- Advisor lookup failed → treated as **no relationship** (never as entitlement).
- Contract (intelligence) unavailable → no facts rendered, no ✓ in the checklist.
- Any code path that cannot prove access renders the value preview only.

## 5. Expert access resolver changes

New: `src/lib/galileo/expertAccess.js`
`resolveExpertAccess({ requestedRole, role, membership, advisor, pending })` →
`{ accessState, hasExpertAccess, relationship, requestedRole, pending }`, with
`ExpertAccessState = { CONNECTED_PAID, INCLUDED_PAID, INTERNAL_OVERRIDE, LOCKED }`
and `INTERNAL_ROLES = [super_admin, advisor, admin, expert, expert_advisor]`.

It **reuses** `useMembership()` and `useAdvisorRelationship()`; it consults nothing
else. The Sprint pill and the panel contain no entitlement logic of their own.

## 6. Paid Expert pill behavior

Entitled owner → `SprintExpertPanel` in brief mode (`EXPERT TASK BRIEF`):
task · objective · why Galileo recommended it (+ sprint confidence) · what Vision
knows · desired outcome · your team, then the preparation checklist and Ask Galileo,
then the real Expert ecosystem. No sales messaging anywhere in that path.

## 7. Non-Expert pill behavior

Not entitled → the same panel in preview mode (`EXPERT SUPPORT`): task · why this
matters · how that role would help · preparation checklist · Ask Galileo, then the
"Want hands-on help?" block with **Explore Expert Support →**. No ExpertNetwork, no
directory, no profiles, no contact details, no expert assignment.

## 8. Expert Support Preview

`src/components/sprint/expert/ExpertSupportPreview.jsx`. Every line is grounded in the
task row: Galileo's own `expert_reason`, the task text, the owner's real subtasks, the
stated outcome. Where the task has no subtasks, Vision says so rather than inventing
expertise requirements.

## 9. Expert Task Brief

`src/components/sprint/expert/ExpertTaskBrief.jsx`, rendered from the handoff package
(see 10). Team block distinguishes a real advisor from "expert support is included in
your plan".

## 10. Existing advisor behavior

`useAdvisorRelationship(businessId)` (server-resolved, session-derived) is the only
relationship source. Entitled + connected → `CONNECTED_PAID`, the real name and role
shown, CTA "Continue with your team". Entitled + not connected → `INCLUDED_PAID`,
"Expert support is included in your plan", CTA "Find an Expert".

In-memory handoff (`buildExpertHandoff`) contains only fields that exist:
business_id, source, sprint_id, sprint_task_id, task{title, description, due_date,
priority, ease, impact, status, estimated_time, expected_outcome},
recommended_expert_role, galileo_reasoning, expert_priority, sprint_objective,
sprint_expected_outcome, opportunity_id (from the sprint path row), galileo_confidence,
verification_status, business_name, advisor{profile_id, name, role}.
Sprint tasks carry no opportunity/strategy id, so none is claimed. No entity created.

## 11. Requested-role mismatch behavior

The advisor block always shows the advisor's own role; the recommended expertise is
shown separately as "Recommended expertise for this task". A best-effort comparison
(`sameExpertise`) only decides the CTA label: matching → "Continue with your team",
differing → "Find {requestedRole} expertise" with the line "This task needs X. Jane is
your Y." Vision never claims the advisor is the requested role.

## 12. ExpertNetwork filtering capability

ExpertNetwork **does** have a specialty filter (`e.specialties?.includes(s)`), and it is
now driven from the single shared vocabulary `src/lib/expertSpecialties.js` — the list
that previously lived inside `FindAnExpert`, so there is no second taxonomy.

Reliability is qualified: Sprint roles are AI-generated and specific to task + industry
("Fractional CFO", "Corporate Attorney"), so an exact taxonomy match is the exception,
not the rule. When the role IS a taxonomy value the filter is pre-applied. When it is
not, Vision does **not** fake a filter: the requested expertise is displayed as context
and the full directory renders beneath it.

## 13. What Should I Prepare behavior

Available to entitled **and** non-entitled owners. `buildPrepChecklist(contract)` is a
derived view over the canonical intelligence contract: documents, revenue, EBITDA,
valuation baseline, tax, operations. A ✓ appears only when Vision can verify the fact;
everything else is ○ Needed with what to do about it. No separate checklist engine; the
per-task answer comes from Ask Galileo ("What should I prepare?").

## 14. Galileo entitlement behavior

`ExpertAskGalileo` uses the existing `useAskGalileo` → `askGalileo` backend function with
`active_business_id`. No new gating was added: a gated answer renders exactly as the
backend returned it (same convention as `WorkspaceAskGalileo`).

## 15. /strategy-call handoff

`Explore Expert Support →` navigates to `/strategy-call` with display-only context:
`source=sprint_expert_recommendation`, `role`, `task`, `sprint_task_id`,
`business_id`. Documented in code as non-authoritative — it grants nothing, and
entitlement remains server-side. `StrategyCall` renders that context above the headline.
No checkout was invented.

## 16. Back-to-Sprint behavior

The panel is mounted by the Sprint, so closing it (Back to 90-Day Sprint / Escape / × /
backdrop) returns to the **same** Sprint with the task context intact — never Home. The
first Escape closes the expert surface (the panel carries `role="dialog" data-state="open"`
so the Vision workspace behind it yields Escape), the second closes the workspace.
Entering the ecosystem uses the workspace layer, so Back steps back to the Sprint.

## 17. Business isolation

The panel compares `task.business_id` against the canonical `active_business_id` and
closes itself when they diverge; the intelligence contract and advisor lookups are keyed
by business, so A's task, role, brief, advisor and facts cannot render under B.
A → B → A continuity of the four PASSing journeys was not touched.

## 18. Interaction Contract changes

Two contracts added to `src/VISION_INTERACTION_CONTRACT.md` (entitled and non-entitled
pill rows) plus rows for prepare / ask / back-to-sprint / ecosystem entry and the
requested-expertise banner. Both rows state that `resolveExpertAccess` is the only
access decision and that Expert access fails closed.

## 19. Files changed

New:
`src/lib/expertSpecialties.js` · `src/lib/galileo/expertAccess.js` ·
`src/lib/galileo/expertTaskBrief.js` ·
`src/components/sprint/expert/SprintExpertPanel.jsx` ·
`src/components/sprint/expert/ExpertTaskBrief.jsx` ·
`src/components/sprint/expert/ExpertSupportPreview.jsx` ·
`src/components/sprint/expert/ExpertPrepChecklist.jsx` ·
`src/components/sprint/expert/ExpertAskGalileo.jsx`

Edited (presentation/wiring only):
`src/components/sprint/SprintTaskItem.jsx` (pill: aria-label, hover, focus, Enter/Space,
`onExpertHelp`) · `src/components/sprint/SprintView.jsx` (panel state + render, additive
`onOpen` prop) · `src/components/sprint/SprintCommandCenter.jsx` (forwards `onOpen`) ·
`src/components/expert-network/FindAnExpert.jsx` (shared taxonomy, `initialSpecialty`) ·
`src/pages/ExpertNetwork.jsx` (`payload`/`initialTab`, requested-expertise banner) ·
`src/pages/StrategyCall.jsx` (contextual display) · `src/VISION_INTERACTION_CONTRACT.md`

Not touched: sprint generation, persistence, task completion/editing, Assign, Remind,
Note, Attach, subtasks, sprint calculations, sprint backend authorization,
`base44/functions/ninetyDaySprint`, and the four PASSing Vision journeys.

## 20. Build / lint result

`npx vite build` → **exit 0**, no unresolved imports.
`npx eslint` on all new files and the expert path → clean. Pre-existing unused-import
warnings in files this work did not author (`SprintTaskItem`, `ExpertNetwork`,
`SavedPlaybook`, `SprintCommandCenter`) were left untouched.

## 21. Manual tests remaining

Browser execution still required (not runnable here): 1 paid → brief → ecosystem ·
2 non-expert → preview with no ExpertNetwork exposure · 3 non-expert → CTA → /strategy-call
with context · 4 paid → no upgrade messaging anywhere · 5 paid + connected advisor → real
advisor named · 6 paid + no advisor → "included in your plan" → ecosystem · 7 advisor
specialty ≠ requested role → distinguished correctly · 8 "What should I prepare?" →
contextual answer + honest ○ items · 9 Ask Galileo → respects gating · 10 Back to Sprint ·
11 A → B isolation with the panel open · 12 internal role → still allowed.
No destructive Sprint backend tests were run.

Also worth confirming in the browser: the pill's hover/focus tooltip and Enter/Space
activation, and that a task whose role is not a taxonomy value lands on the full
directory with only the requested-expertise banner (no narrowed filter).