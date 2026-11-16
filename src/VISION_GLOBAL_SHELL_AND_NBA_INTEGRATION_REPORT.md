# VISION — GLOBAL GALILEO BAR · GLOBAL NOTIFICATION LAYER · NEXT BEST MOVE ASSIGNMENT INTEGRATION

Status: **implemented and verified against real data. NOT published. Phase 6C not begun.**
The Document Assignment + Galileo architecture delivered in the previous pass was not
reopened: no contract, table, function or authorization rule changed in this pass.

---

## 1. Global Galileo shell implementation

ONE bar, at the bottom of the Vision viewport, on every owner-facing Vision surface:

* `src/components/galileo/shell/GlobalGalileoBar.jsx` (new) — the bar. Same `useAskGalileo`
  → same `askGalileo` function → same canonical intelligence → same answer components
  (including `GalileoAssignmentAnswer`, the same one the Data Room uses).
* It **portals to `<body>`** into the `.layer-assistant` layer, so no ancestor transform,
  overflow or stacking context can trap it (the Vision shell is scaled + dimmed while a
  workspace is open, which would otherwise trap a `fixed` child).
* Mounted once, in `GalileoReimagined`, and handed to `GalileoShell` as the `galileoBar`
  slot; the shell reserves `--vision-assistant-space` at the bottom of its scroll region.
* `WorkspaceAskGalileo` was **removed** — superseded by this single bar (it was the same
  hook and the same answer surface, mounted per workspace). One bar, one assistant.
* Not mounted for the guest Magic Loop, which already has its own conversation composer.

## 2. Owner-facing surfaces audited

Routes and workspaces were read from `src/App.jsx`, the Vision workspace registry and the
Home surface, not from the request's list alone.

| Surface | Where it lives | Bar present |
| --- | --- | --- |
| Galileo Home | `/galileo` (in place) | ✓ shell |
| Domain focus, What If, Guide, Opportunity, Your plan, Playbook, Connections, Saved, Expert | `/galileo` in-place views | ✓ shell |
| Dashboard / Business Pulse | `dashboard` workspace | ✓ |
| 90-Day Sprint (+ task context) | `sprint` workspace | ✓ |
| Data Room, uploader, review queue, document viewer | `data-room` workspace + sub-levels | ✓ |
| Business Valuation | `valuation` workspace | ✓ |
| Assessments | `assessments` workspace | ✓ |
| Expert Network, Settings | `expert-network`, `settings` workspaces | ✓ |
| Magic Loop (guest discovery) | `/galileo` unauthenticated | its own composer (unchanged) |
| Legacy `AppLayout` routes (`/dashboard`, `/data-room`, `/assessments/*`, `/advisory/*`) | legacy shell | unchanged — they keep their existing legacy Galileo panel |

## 3. Context propagation

Carried on the existing channels only — `active_business_id` (canonical Business Context
Engine, read at call time so a switch cannot send A's scope), `workspace_key`, `current_route`
and `focused_record_type` / `focused_record_id`, which `askGalileo` already accepts.

* The bar names the SURFACE the owner is in: the open workspace's registry id, or the Home
  surface (`vision_home`, `vision_whatif`, `vision_playbook`, …).
* The exact OBJECT is read from the URL (`?workspace=data-room&id=<document_id>`) — the only
  place that authoritatively knows which document is open — and is validated against the
  active business by `askGalileo`.
* If the UI does not know an id, **no id is sent**. No id is inferred from words, and no
  opportunity/scenario/sprint id is invented: `askGalileo` supports document, assignment and
  valuation focus, so only those are ever passed.
* Live check: `askGalileo` with `workspace_key: 'vision_whatif'` + `current_route` returned
  **200 with a real BIE answer** (source `bie`) — the surface context is accepted and normal
  answers are unaffected.

## 4. Context precedence

Authoritative UI context beats linguistic guessing, as established in the assignment work:
the focused document is honoured first (validated against this business's own list), and only
if there is no authoritative object does resolution fall back to records. The bar never
re-derives what the UI already knows.

## 5. Stale-context clearing

`useAskGalileo` now discards the answer and the error when **any** of these change: the active
business, the surface, or the focused object. So Document A → close → Document B → "Explain
this" means Document B, and Business A → Business B cannot leave A's answer on screen. The bar
also re-derives its focus from the URL on every render, so closing the viewer drops the id.

## 6. Answer presentation

Nothing is forced (§10): the answer appears **above the bar, in place** — question, answer,
next step, assignment records and the assignment confirmation step. The workspace, the
document and the scroll position stay exactly where they were. The panel is capped
(`max-h-[34vh]`, scrollable) so it never takes the surface over. "Continue with Galileo"
expands into the full conversation through the EXISTING Explain-with-Galileo bridge, carrying
the question, and steps its own answer aside so it does not appear twice.

## 7. Galileo action behaviour

Unchanged and fully live from the bar: `GalileoAssignmentAnswer` renders real records with
**[Open Document]** (through the one document contract, by id), **[Mark complete]**, the
clarification options, the confirmation card and its result. Actions are not reduced to
text Q&A.

## 8. Mobile behaviour

The bar is one compact row (~44px) plus the answer panel above it; it reserves
`--vision-assistant-space` (58px) + `env(safe-area-inset-bottom)` at the bottom of every host
scroll region, so content, buttons, table rows and mobile controls are never covered — at the
shell/workspace level, with **no per-page padding**. The answer panel is capped at 34vh
(it cannot consume half the viewport) and the bar never exceeds one row.

## 9. Notification portal / overlay implementation

`NotificationBubble` now renders through `createPortal(document.body)` at
`.layer-arrival`. It was previously `absolute` inside the bell's container, which lives in the
header inside the shell — so any workspace overlay, drawer, panel or the document viewer
painted over it. Nothing about the bubble changed except where it is mounted: same component,
same 6-second timing, same hover/focus pause, same queue, same single `onClick`.

## 10. Stacking architecture

One named contract, in `src/index.css`; components name the layer they ARE instead of carrying
a magic number. Every outlier was converted, so no `z-[60] / z-[70] / z-[9999] / z-[99999] /
z-[100000]` remains:

```
layer-workspace   40   the Vision workspace overlay
layer-dialog      50   dialogs, sheets, drawers, dropdown menus
layer-panel       60   full-surface panels (settings, drive picker, sprint/booking/calendar)
layer-viewer      70   the document viewer
layer-assistant   75   the persistent global Ask Galileo bar
layer-arrival     80   the incoming-notification bubble
layer-critical    90   explicit confirmation / security dialogs
layer-toast      100   toasts
layer-inspector  110   developer diagnostics
```

Two deliberate consequences, both documented in the CSS:
* the assistant sits **above the document viewer** (Galileo must be reachable with a document
  open) and **below** the arrival bubble and critical confirmations;
* toasts now sit above the viewer (before: below it), which only improves the case where an
  error is raised while a document is open.
Popover/Select/Tooltip/Command menus keep `z-50`, i.e. the dialog tier by value.

## 11. Bell anchoring

The bubble stays tied to 🔔 by measurement, not by guesswork: `NotificationBell` measures its
own button (`getBoundingClientRect`) and passes `{top, right}`; the bubble renders `fixed` at
that anchor, clamped to a 12px right margin, and re-measures on resize. The header is fixed, so
nothing else moves it.

## 12. Confirmation-modal behaviour

`AssignDocumentSheet` (the explicit confirmation of the assignment flow) now renders in
`.layer-critical` through a portal to the document root. Without that it inherited the
workspace's stacking context (the panel has a transform and a backdrop filter) and would have
been painted **under** the assistant bar and the arrival bubble. Its layout is unchanged (it
was already `fixed inset-0`) and no logic changed. `ui/alert-dialog` is likewise assigned to
`.layer-critical` as the designated layer for security/confirmation dialogs.

## 13. Existing notification behaviour preserved

Nothing in the arrival mechanism was touched: 15-second polling, the per-mount arrival tracker,
seen-id behaviour, the `created_date` guard (no replay of old unread notices, no replay on
refresh/remount), the chime, the 6-second visible time, hover/focus pause, one-at-a-time queue,
read/unread semantics, the destination resolver, cross-business switching, and assignment
notification creation. This pass changed the presentation layer only.

---

## 14. Next Best Move architecture audited (before changing it)

`src/lib/galileo/nextBestMoveResolver.js` is the Vision Home selection engine, driven by
`useGalileoHome` (BIS contract + business-scoped sprint/opportunities/assignments) and rendered
by `NextBestMove.jsx`. A separate advisor-side engine exists (`generateNextBestActions` →
`next_best_actions`, surfaced in the sprint/dashboard components); it was **not** touched.

## 15. Existing candidate sources

ACTIVE before this pass: sprint blockers (urgency 95), recent changes / newly analyzed
documents (80), opportunities available/active (55), goal-aligned duplicates of those (50 + 15).
Documented INACTIVE in the engine and left that way: financial changes, expert responses,
evidence gaps, signal deterioration, pending scenarios, unresolved Galileo questions.

## 16. Existing scoring model

`score = urgency` + goal-alignment bonus (15, goal-aligned type only) + impact bonus
(`min(20, log10(impact + 1) * 4)`) + maturity bias (blockers +20 when implementing,
deterioration +15 in exit prep, Galileo questions +15 early). Sorted descending; primary +
up to 3 alternatives; "Why this?" reads the reason map. Business scope comes from the
contracts that supply the data, not from this file.

## 17. Assignment candidate integration

One new source: `documentAssignments` (from the `documentAssignments` contract's `listMine`
action, loaded by `useGalileoHome` alongside the other scoped entities) → `documentAssignments`
in the resolver context → `MoveType.DOCUMENT_ASSIGNMENT` candidates. The click action
(`actionValue.type === 'document_assignment'`) is routed in `useVisionActions.handleMoveAction`
to `onOpenWorkspace('data-room', documentId)` — the existing document contract, by id.

## 18. Eligibility rules

Applied in the resolver: `status === 'open'` AND `assignment_type` in (`review`,
`action_required`). Mine-ness and business scope are enforced upstream by the contract
(`listMine` filters `assignee_profile_id = the authenticated actor` within the resolved
business) — the client never widens that list.

## 19. FYI exclusion

FYI is never a candidate: it carries no completion state and is informational. Live evidence
below shows the contract hands the resolver only open review/action-required rows.

## 20. Completion / removal behaviour

Completed and removed assignments are excluded by the status filter, and closing the workspace
re-reads what Home is working from (`home.reloadWork()` on the workspace closing), so a
completed or removed assignment immediately ceases to be eligible — no stale NOW. Reopening
(`status = open`) makes it eligible again, automatically.

## 21. Exact-document NBM action

The candidate carries both `id` (assignment) and `documentId`; the action opens
`?workspace=data-room&id=<document_id>`, i.e. the exact document in the existing viewer —
never the Data Room at large. `MoveContextObject` shows the real document behind the request
when Vision already holds it.

## 22. Business isolation

`listMine` is scoped to the canonical active business resolved on the server; the hook clears
assignment state before every refetch and refetches on business change. Verified live: for the
business holding assignments, every returned row belonged to that business and to the actor;
for a second business, only that business's row came back.

## 23. Files changed

New: `src/components/galileo/shell/GlobalGalileoBar.jsx`,
`src/VISION_GLOBAL_SHELL_AND_NBA_INTEGRATION_REPORT.md` (this file).

Edited: `src/index.css` (layering contract + reserved space var), `src/components/galileo/shell/GalileoShell.jsx`,
`src/components/vision/workspace/VisionWorkspace.jsx`, `src/pages/galileo/GalileoReimagined.jsx`,
`src/hooks/useAskGalileo.js`, `src/components/notifications/NotificationBell.jsx`,
`src/components/notifications/NotificationBubble.jsx`, `src/lib/galileo/explainGalileo.js` (comment),
`src/lib/galileo/nextBestMoveResolver.js`, `src/components/galileo/home/NextBestMove.jsx`,
`src/components/galileo/home/MoveContextObject.jsx`, `src/hooks/useGalileoHome.js`,
`src/hooks/useVisionActions.js`, `src/components/dataroom/AssignDocumentSheet.jsx`,
`src/components/documents/DocumentViewer.jsx`, `src/components/documents/GoogleDrivePicker.jsx`,
`src/pages/Settings.jsx`, `src/components/sprint/ReplacePathModal.jsx`,
`src/components/sprint/BookingModal.jsx`, `src/components/calendar/ConnectCalendarModal.jsx`,
`src/components/dashboard/ContractRuntimeInspector.jsx`,
`src/components/dashboard/RuntimeDiagnosticPanel.jsx`, `src/components/ui/{dialog,sheet,drawer,dropdown-menu,alert-dialog,toast}.jsx`.

Deleted: `src/components/vision/workspace/WorkspaceAskGalileo.jsx` (superseded).

## 24. Backend changes

**None.** `askGalileo` and `documentAssignments` were not modified in this pass.

## 25. Database changes

**None.**

## 26. Build result

`npx vite build` → **exit 0**, no unresolved imports. Built CSS contains all nine layer classes
and `--vision-assistant-space`; the bundle contains the bar and the arrival layer.

## 27. Lint result

Clean on every file authored or substantively edited in this pass — including the two
NotificationBell issues that were already failing before this pass (dead `AlertCircle` import
and an unused `iconColor`), which were removed while that file was open. Two **pre-existing**
unused-import errors remain in files where this pass changed only a className
(`ReplacePathModal` — unused `useState`; `Settings` — unused `Plus`). They are not new, not
build-affecting, and were left alone rather than refactoring untouched code.

## 28. Runtime tests performed

1. **Resolver eligibility matrix** (the real module, evaluated with real-shaped records):
   open review → eligible; open action required → eligible; FYI → excluded; completed →
   excluded; removed → excluded.
2. **It does not automatically win**: with a sprint blocker and a newly analyzed document in
   the same context, the primary was the blocker and the assignment ranked **3rd**; with an
   opportunity carrying a modeled $120k impact, the primary was the opportunity (75) and the
   assignment (58) ranked **2nd**.
3. **No manufactured signals**: `impact: null`, `urgency: 58`, no deadline, provenance
   `CONNECTED_DATA`; no goal, maturity or financial boost applied.
4. **Exact-document action**: `actionValue.documentId` carried the assigned document's id.
5. **Live contract data** (business `42f42075…`): 4 rows in the database, `listMine` returned
   the 3 open ones and excluded the removed one; every returned row was this business and this
   actor. A second business returned only its own single row. For business `b3e5ceb3…`: 1/1.
6. **Real rows → real card**: "Review Reevs.Garrick.Integrator.pdf" / "Garrick Reevs asked you
   to review this." / [Review Document] with `documentId 952f940d…`; the other two live
   assignments appeared as alternatives ("Review Screenshot …", "Action needed on
   phase_b1_pipeline_test.pdf").
7. **Shell context accepted**: `askGalileo` with a Home surface key returned 200 and a real
   answer.
8. **Built artefacts**: layer classes + reserved-space var present in the compiled CSS; bar and
   arrival layer present in the compiled JS.
9. No writes by this pass: every call was a read (`listMine`, `listForBusiness`, `askGalileo`).
   The live data did change during this pass — a new assignment at 22:11 and one removed at
   22:14 — from the owner's own browser testing, not from any code path here.

## 29. Browser tests performed

None by me — I cannot drive a browser. The Testing Agent should be used for Parts 5 and 6.

## 30. Manual checks remaining

Part 5: bar present on Home, Data Room, an open document, an assigned document, the Sprint, a
focused task, What If, Valuation and an Opportunity; asking does not navigate away; the answer
appears in place with its actions; Document A → B and Business A → B leave no stale context;
mobile usability without covering content.
Part 6: the arrival bubble visible above the Data Room, the viewer, the Sprint, What If, the
Valuation, and a drawer; not improperly obscuring an explicit confirmation; still anchored to
the bell; sound, fade and hover-pause unchanged; click still resolves through the same
resolver; no replay of old unread notices or on refresh.
Suggested Testing Agent goals: *"Open a document in the Data Room and ask Galileo 'what does
this mean?' from the bottom bar without leaving the document"* and *"Trigger a document
assignment notification while the Data Room is open and confirm the bubble appears above it"*.

## 31. Deferred, and why

* **Ordinary dialogs and full-surface panels sit below the assistant bar** (the contract's
  deliberate order: the assistant stays with the owner; the explicit confirmation does not).
  If a panel ever needs to own the screen completely it goes in `.layer-critical`.
* **Popover/Select/Tooltip/Command primitives keep `z-50`** rather than being renamed to
  `.layer-dialog` — numerically identical, so the contract holds; naming them is cosmetic and
  would have touched a dozen files for no behavioural gain.
* **The assignment candidate's urgency (58) is a deliberate calibration constant**, not
  fabricated data: this system holds no due date for a document request, so none is claimed.
  If a real deadline field is ever added to `document_assignments`, that becomes a real signal
  and the number should be re-derived from it.
* **No sound preference** for arrivals: `NotificationPreferences` has none, so the default
  subtle chime ships unchanged; adding a preference is its own change to that settings surface.

**Not published. Phase 6C not begun.**