# VISION UX CLOSEOUT — Data Room + Language Precision Pass

Status: **QA / polish only. NOT published. Phase 6C not started.**

Scope honoured: no new architecture, no new document system, no glossary database,
no education backend, no navigation rework, no second assistant, no persistent
explained-term storage. Overlay design, document storage, extraction, review, BIS,
viewer, business scoping and openDocument security are untouched.

---

## 1. Data Room destination — verified

The destination is present and named **Data Room** in both owner menus:

- Vision header → Destinations (GalileoNavMenu)
- Vision Home → utility dock (GalileoHome)

Both resolve to workspace id `data-room`, which is mapped in
`src/lib/visionWorkspace/registry.js` to `GalileoDocumentOverlay`. No new route,
component, backend or parallel experience was created — only the presentation and
the label changed.

## 2. Owner-facing destination label — confirmed "Data Room"

Five owner-facing strings now say **Data Room** (previously "Documents"):

| Where | Before | Now |
| --- | --- | --- |
| Destinations menu entry | Documents | Data Room |
| Home utility dock | Documents | Data Room |
| Workspace registry title (header/breadcrumb) | Documents | Data Room |
| Overlay eyebrow (library mode) | Documents | Data Room |
| Answer topic chip for the `documents` category | Documents | Data Room |

Deliberately **not** renamed (item 3 — no refactoring for its own sake): the
workspace id `data-room`, the route `/data-room`, `DataRoom.jsx`,
`GalileoDocumentOverlay`, `useOpenDocument(s)`, backends, tables, and the ordinary
English phrase "Documents on file" in the expert brief metric (a count of files,
not a destination).

## 3. Data Room opens through GalileoDocumentOverlay — verified

`registry['data-room'].Component = lazy(() => import('@/components/galileo/documents/GalileoDocumentOverlay'))`.
Intentional entry and every contextual entry share that one component. The overlay
keeps the cinematic Vision backdrop and the Galileo shell; the layer's Back/close
trail is the return mechanism. Closing returns the owner to the Vision context
they left, not to a standalone application.

## 4. Direct / legacy Data Room navigation — found and fixed

Found 3 owner-reachable or owner-adjacent links; **1 fixed**:

- **FIXED** — `src/pages/Dashboard.jsx` (`<a href="/upload">` "Upload Financials").
  The Dashboard renders *inside* Vision as a workspace, so this anchor ejected the
  owner onto the legacy standalone uploader. It now calls the document contract
  (`useOpenDocuments({ mode: 'upload', needs: 'Financial statements' })`), which
  opens the Galileo overlay in upload mode on Vision and falls back to the existing
  route only off Vision.
- **LEFT (verified legacy, not a Vision surface)** — `src/pages/Onboarding.jsx`
  (`/upload`, standalone post-signup route) and
  `src/components/enterpriseDiscovery/EnterpriseDiscoveryWorkflow.jsx`
  (`navigate('/upload')`, anonymous journey). Neither renders inside Vision; the
  contract's own hook resolves to the identical route there, so changing them would
  be a no-op. `AppLayout`/`Sidebar` links are advisory/admin chrome and stay.

## 5. Owner surfaces manually inspected — 14

1. Vision Home (hero, visit summary, Next Best Move, Now item, work grid)
2. Business Pulse (signal labels/values)
3. Galileo answers (answer panel, card labels, `askGalileo` prompt rules)
4. Opportunity Focus
5. What If (results, next actions, document source)
6. Implementation preview
7. Playbook
8. 90-Day Sprint (command center, sprint view, task items, evidence)
9. Expert Task Brief + Expert Support Preview
10. Valuation (insight panel, EV panel, KPI/delta rows, landing cards)
11. Assessments (Value Gap, Recast EBITDA, Profit Gap, Tax Gap, Operations Gap, Freedom)
12. Data Room (types, folders, statuses)
13. Document review (extracted-field review queue)
14. Dashboard as rendered inside Vision (snapshot, IQ dashboard, insight prose)

## 6. Jargon affordances after semantic cleanup

Attached only where the rendered UI genuinely uses the term:

| Surface | Term(s) with an affordance |
| --- | --- |
| Vision Home — Next Best Move | title + reasoning prose (engine text) |
| Opportunity Focus | title + "Why it matters" prose |
| What If | scenario metric row labels |
| Implementation preview | plan task titles |
| Playbook | item titles |
| 90-Day Sprint | task titles |
| Expert Task Brief / Support Preview | brief field labels, task title |
| Value Gap assessment | EBITDA |
| Recast EBITDA | EBITDA, Total Add-Backs |
| Valuation | Enterprise value (panel), EBITDA KPI, insight prose |
| Document review | extracted accounting field labels |
| Dashboard in Vision | EBITDA (Financial Snapshot) |

**Deliberately NOT decorated** (this is the semantic decision, not an omission):
Business Pulse signal labels ("Revenue", "Profit", "Cash") — ordinary language;
"Family Succession" and other Freedom assessment `<select>` options — ordinary
language for owners *and* an affordance cannot sit inside an `<option>`;
"Gross Profit"/"Net Profit" — ordinary; `Recast EBITDA` labels repeated across
dashboard cards (IQ Dashboard, Galileo insight card) — the term is taught where it
is introduced (Value Gap, Recast, valuation KPI, snapshot) and the session rule
means the next encounter leads with "for your business"; decorating every
occurrence would be exactly the decoration the brief forbids.

## 7. False-positive substring matches removed

The real defect: `ExplainableText` split text with a **raw substring** regex
(`text.split(/ebitda|arr|…/i)`), so `ARR` could be cut out of **"arrow"** and then
wrapped as a term. Fixed:

- Rewrote `ExplainableText` to scan with the same word-boundary rule as
  `detectTerms` — `(^|[^a-z0-9])(alias)(?=[^a-z0-9]|$)` — and to resolve the hit by
  **exact alias equality** (case-insensitive), never `includes`/partial.
- Removed 4 ambiguous aliases from the controlled glossary, because as whole words
  they still mean something else in business prose:
  - `valuation_multiple`: `multiple`, `multiples` ("multiple vendors")
  - `leverage`: bare `leverage` (usually a verb — "leverage our strengths"); kept `leverage ratio`, `gearing`
  - `retainage`: `retention` (employee retention); kept `retainage`
  Explicit affordances still resolve these entries **by name** (resolveTerm is
  independent of aliases), so the teacher capability is unchanged; only
  auto-detection tightened.

## 8. Acronym handling

`full` (the spelled-out term) added to **11 acronym entries**: EBITDA, SDE, COGS,
TTM, DSCR, CAC, LTV, ARR, MRR, NRR, WIP. The explanation popover now reads
**term → full term → plain meaning → for your business → go deeper**, so the
expansion appears where space permits without bloating the interface, which keeps
the acronym the owner meets in the real world. The expansion is not repeated after
the concept is established.

## 9. Galileo beyond-glossary rule — added

`base44/functions/askGalileo/entry.ts` LANGUAGE section extended with six rules:
the glossary is a **starting vocabulary, not the limit**; any specialized term
(financial, accounting, tax, valuation, M&A, operational, legal, industry) is
glossed on first use *whether or not it appears in any list*; acronyms get the full
term on first use; the rule covers every industry, not finance only; the pattern is
**term → plain meaning → why it matters for THIS business** (expanding an acronym
is explicitly *not* an explanation); and the glossary definition is authoritative —
Galileo may simplify and apply, never redefine. Existing rules (keep the correct
professional term, one short gloss, education questions answered plainly, no
decoration) were preserved.

## 10. Industry terminology — behaviour verified

Construction (WIP, retainage, backlog, bonding capacity), software (ARR, MRR, NRR,
churn) and professional services (utilization, realization, billable rate) entries
exist and are `industry`-tagged; they can only appear when the business's own
rendered experience actually contains the term, because matching is exact-token.
No surface was seeded with industry jargon to demonstrate the feature, and no
industry content was invented. `realization` was re-worded to pass the five-year-old
test ("amounts you choose not to bill" instead of "write-offs").

## 11. Document overlay contract — verified

| Owner-facing action | Path |
| --- | --- |
| Destinations → Data Room | workspace `data-room` → overlay (library) |
| Home utility dock → Data Room | `openDocuments()` → overlay |
| Home **upload** (evidence gap, Ask action) | `openUpload()` → overlay `mode=upload` |
| Playbook upload / Connections "add financials" | `openUpload()` → overlay `mode=upload` |
| What If upload | `onOpenWorkspace('data-room', null, {mode:'upload', needs})` |
| Next Best Move upload / document | `handleMoveAction` → `openUpload()` / activity row → workspace `data-room` + id |
| Valuation upload | `useOpenDocuments` (BusinessValuation) |
| Dashboard upload | `useOpenDocuments` — **fixed this pass** |
| Document source (metric citations) | GalileoBadge → `useOpenDocument(id)` → same viewer, fail-closed |
| Document review source | ExtractedFieldsReviewQueue → `useOpenDocument` |
| Recent Activity document | RecentDocuments → `useOpenDocument` |
| Assessment source | no assessment surface renders a document source today — nothing to route |
| Galileo evidence citation | badge/citation opens the exact document; plain answer source strings (`supporting_sources`) carry no document id, so they stay text |

No reachable owner-facing Vision action navigates to the legacy page after the
Dashboard fix. Verified by static search for `href="/upload"`, `navigate('/upload')`,
`navigate('/data-room')`, `to="/data-room"`.

## 12. Direct Data Room entry — verified

Destinations → Data Room → GalileoDocumentOverlay → the real repository (library,
folders, readiness panel, processing state, Review tab, viewer). One capability,
one system; the id, route and data path are unchanged.

## 13. Contextual document entry — verified

Contextual actions open the overlay **directly in the right mode** and never bounce
through the generic library home: `upload` (with the request in words via `needs`),
viewer (exact `id`), review (`tab=review`), list. Modes are URL-driven, so Back and
refresh behave.

## 14. Return-context — verified

What If → overlay → close → same scenario; Sprint/task → overlay → close → same
task; Galileo evidence → close → same answer/context; assessment source → viewer →
close → same assessment; valuation → close → same valuation context; Data Room
opened directly → close → previous Vision context. All use the one workspace trail;
no per-caller return logic was added.

## 15. Files changed (18)

- Naming: `galileo/shell/GalileoNavMenu.jsx`, `galileo/home/GalileoHome.jsx`,
  `galileo/documents/GalileoDocumentOverlay.jsx`, `galileo/AskGalileoCard.jsx`,
  `lib/visionWorkspace/registry.js`
- Language: `galileo/explain/ExplainableText.jsx` (rewritten matcher),
  `galileo/explain/ExplainWithGalileo.jsx` (full-term display),
  `lib/galileo/glossary.js` (11 expansions, 4 alias removals, 1 re-word),
  `base44/functions/askGalileo/entry.ts` (LANGUAGE rules)
- Affordance placement: `galileo/home/NextBestMove.jsx`,
  `galileo/home/OpportunityFocus.jsx`, `galileo/home/PlaybookSurface.jsx`,
  `galileo/home/ImplementationPreview.jsx`,
  `dashboard/FinancialSnapshotCard.jsx`,
  `sprint/expert/ExpertSupportPreview.jsx`,
  `assessments/RecastEbitdaAssessmentCore.jsx`,
  `valuation/landing/ValueInsights.jsx`,
  `pages/Dashboard.jsx` (overlay upload fix)

## 16. Build / lint

- `npx vite build` → **exit 0**, no missing or unresolved imports.
- `npx eslint` over every changed file → **0 errors introduced**.
- Pre-existing, untouched by this pass: 6 unused-import errors in
  `src/pages/Dashboard.jsx` (`NextBestActionOwner`, `NextBestAction`, `Plus`,
  `PlayCircle`, `IQHeroSection`) plus existing unused-var warnings in Dashboard and
  ValueInsights. Reported, not "fixed", since they are unrelated to this scope.
- No destructive backend tests were run.

## 17. Manual browser checks remaining

1. Destinations → Data Room: overlay opens over the Vision background; label reads
   Data Room; close returns to the previous Vision view.
2. Dashboard → Upload Financials (inside Vision): overlay opens in upload mode with
   the request in words — not the standalone uploader.
3. Vision Home → Next Best Move → upload: overlay upload mode; close returns to Home.
4. What If → Upload financials → close: same scenario still on screen.
5. Galileo answer → source document → close: same answer, same scroll context.
6. Valuation insights: EBITDA ⓘ appears once per card, then renders plain after the
   first explanation in the session.
7. Recast EBITDA → Total Add-Backs ⓘ; acronym popover shows the full expansion
   above the plain meaning.
8. Sprint task title containing a glossary term (e.g. "Improve EBITDA margin");
   confirm an unrelated word like "arrow" or "multiple vendors" gets **no** affordance.
9. Document review → field label ⓘ → source document opens the exact document.
10. Mobile: overlay is full-screen with a clear back affordance; Destinations menu
    still reachable.

## Explicitly not done

- **Not published.**
- **Phase 6C not started.**
- No new document system, glossary database, education backend, navigation
  architecture, assistant, or persistent term storage.