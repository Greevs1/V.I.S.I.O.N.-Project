# VISION UX FOUNDATION — DOCUMENT OVERLAYS + PLAIN-LANGUAGE INTELLIGENCE

**NOT PUBLISHED. Phase 6C NOT STARTED.** No storage, extraction, review/promotion,
BIS, Data Room backend, document viewer, Galileo backend, Sprint, Playbook, Expert
or business-switching logic was redesigned. Everything below is presentation and
orchestration over what already existed.

---

## 1. Existing document components reused

| Capability | Component reused | Where |
|---|---|---|
| Library, filters, folders, drag-to-move, readiness, processing state, review tab, viewer, delete/retry | `src/pages/DataRoom.jsx` | overlay library view |
| Upload, queue, progress, save-progress, missing-document prompts | `src/pages/DocumentUpload.jsx` | overlay upload view |
| Field review (accept / correct / reject / clarification, period, source link) | `src/components/admin/ExtractedFieldsReviewQueue.jsx` | overlay → Data Room Review tab |
| Document viewer | `src/components/DocumentViewer.jsx` + `useDocumentViewer` | unchanged, inside the Data Room page |
| Post-promotion confirmation | `src/components/dataroom/LearnConfirmation.jsx` | unchanged, inside the review panel |

Nothing was reimplemented: the overlay imports these files as they are.

## 2. GalileoDocumentOverlay architecture

`src/components/galileo/documents/GalileoDocumentOverlay.jsx`, mounted as the
`data-room` registry entry (id kept deliberately — it is the document contract's own
deep-link shape and the key the Data Room reads).

- **A shell, not a system.** It renders the existing Data Room page or the existing
  uploader depending on the URL, and adds only the Galileo header (contextual title,
  Vision's own request, suggested document types) and the real-findings banner.
- **URL-owned view**, so Back, refresh and deep links work:
  `?workspace=data-room` (library) · `&mode=upload` (uploader) · `&id=<doc>` (exact
  document) · `&tab=review` (review panel) · `&needs=<words>` (the request).
- **Return context is the existing workspace contract** (`useVisionWorkspace`): closing
  pops to the surface underneath; the trail drives Back; `VisionWorkspace` already
  unmounts the content on a business switch.
- **The new post-upload state** ("I found N pieces, M need your confirmation") is the
  existing server-computed review summary — real counts, polling stopped as soon as
  there is something to review. The CTA switches the overlay to the existing Review tab.
- Workspace opener extended (`open(id, payload, extra)`) so callers can name a sub-view;
  a `null` value CLEARS the param, so a stale upload intent can never leak into a later open.

## 3. Upload CTAs redirected to the overlay

`useOpenDocuments()` (`@/lib/visionWorkspace/openDocument`) is the one contract: on
Vision it opens the overlay (upload mode), anywhere else it keeps the existing
standalone uploader so nothing that works today stops working.

| Call site | Before | Now |
|---|---|---|
| Home Connections "Add a financial document" | `workspace data-room` (library) | overlay **upload mode** |
| Playbook empty state "Add financials" | `workspace data-room` | overlay **upload mode** |
| What If missing input ("leave for the source") | `workspace data-room` | overlay **upload mode** carrying the scenario's own field as the need |
| Next Best Move → evidence gap | `workspace data-room` | overlay **upload mode** |
| Business Valuation (4 sites: link handler, 2 request cards, upload CTA) | `navigate('/upload')` | overlay upload mode |
| Dashboard data-requirement overlay | `navigate('/upload')` | overlay upload mode |
| Data Room header / needs banner / empty state (3 sites) | `navigate('/upload')` | overlay upload mode (stays inside the overlay) |

`EnterpriseDiscoveryWorkflow` (the unauthenticated Journey) deliberately keeps
`/upload`: the overlay lives in the authenticated Vision shell.

## 4. Document links redirected to the exact viewer overlay

- `useOpenDocument(documentId)` unchanged in behaviour (still fail-closed), now
  presenting through the overlay. Every existing caller benefits at once: Recent
  Activity rows, `GalileoBadge` metric sources, assessment sources, review sources.
- `RecentDocuments` was the one real gap: rows linked the raw file URL in a new tab and
  "View all" linked `/data-room`. Both now go through the contract — exact document in
  the overlay viewer, library for "View all".
- `documentDeepLink()` still returns `/data-room?document=<id>` for surfaces outside
  Vision: direct technical access is untouched.

## 5. Owner-facing Data Room destination

**Kept, relabelled, and now it opens the overlay.** Destinations shows
**Documents — "Upload, review & open evidence"**, which opens the Galileo overlay
(document workspace), not a separate file-management application.

Why not removed: the overlay renders the *whole* existing Data Room page, so every owner
capability is reachable through it (library, folders, readiness, review, viewer, requests,
classification). Removing the entry point would have hidden a working surface with nothing
gained — the "separate department" feeling came from the destination being a different
experience, and that is what changed. Direct route access, admin/internal access and the
backend are all untouched. If you still want the entry gone from Destinations, it is a
one-line removal with no functional loss — say so and I will take it out.

## 6. Review flow inside the overlay

Upload → real processing states (the uploader's own queue) → the findings banner with
server-computed counts → **Review what I found** → the overlay's Review tab → the existing
review panel (accept / correct / reject / open source document) → **LearnConfirmation**
("Vision updated — I learned N new things") → closing the overlay returns to the
originating Vision context. Nothing about promotion, BIS or invalidation changed.

## 7. Return-context behaviour

The overlay never redirects to Home. Closing calls `useVisionWorkspace.close()`, which
removes only `workspace`/`id` from the URL and leaves every other param intact — so a What
If scenario, a Playbook stage, a Sprint task context or a domain focus is exactly as it was.
Back (`←`) steps through the workspace trail when the overlay was opened *from* another
workspace. Mobile: at the small breakpoint the workspace surface is full-screen with the
same "← Vision" / × controls (`VisionWorkspace` class change, applies to all workspaces).

## 8. Jargon audit — method and count

Method: case-insensitive keyword sweep across `src/components` + `src/pages`, counting
FILES containing each term (a first pass, not a per-render census).

Files containing each term: EBITDA 74 · enterprise value 45 · add-backs/add-backs 16 ·
transferability 15 · valuation multiple 8 · normalized earnings 9 · owner dependency 8 ·
leverage 8 · COGS 4 · succession 3 · net margin 3 · working capital 2 · gross margin 2 ·
customer concentration 2 · TTM 2 · trailing twelve months 1 · recurring revenue 1 ·
quality of earnings 1 · free cash flow 1 · capex 1.

**Honest caveat:** short acronyms over-count — case-insensitively, `ARR` also matches
"arrow"/"carry" (134 hits are almost all that), `CAC` matches "cache", `SDE`/`LTV` are
likewise substring-prone. DSCR, churn, revenue concentration, backlog, retainage, WIP,
payer mix and utilization returned **zero** in components/pages — they exist in the engines
and schemas, not yet in rendered owner surfaces. The audit therefore confirms the list is
real but does NOT support a precise rendered-instance count; a per-surface pass is listed
as remaining work.

## 9. Terms given explanation affordances

**Explicitly placed (highest-value surfaces first):**
- `EBITDA` — Value Gap (Estimated Annual EBITDA), Recast EBITDA Engine (Initial EBITDA)
- `Enterprise value` — Valuation landing (Estimated Enterprise Value)

**Placed by the deterministic detector** (the term is found in text Vision did not write):
- `ExplainableText` on **Sprint task titles** — covers cohort analysis, unit economics,
  pricing power, working capital, AR/AP, COGS, SDE, multiples…
- `ExplainableText` on the **Expert brief fact labels** — covers "Recast EBITDA",
  "Reported EBITDA"
- `ExplainableText` on **What If result metric rows** — the engine's own labels
- **Document review field labels** via `termForDocumentField()` — accounts receivable,
  accounts payable, COGS, working capital, EBITDA, owner compensation, net/gross margin,
  debt service, leverage, capex

**Not yet placed (real, deliberately deferred):** Business Pulse tile labels, Opportunity
Focus, Playbook row terminology, implementation preview, the valuation build/insights
workspaces, and the remaining Recast/Valuation labels. The mechanism is general; these are
one-line placements each. The audit's over-counted acronyms were NOT given affordances,
because a substring match is not evidence the term is rendered.

## 10. ExplainWithGalileo architecture

`src/components/galileo/explain/ExplainWithGalileo.jsx` — ONE affordance component
(`TERM ⓘ`, popover: click/tap, works on mobile):

- **Level 1** — the canonical one-sentence meaning (and an analogy where the glossary has
  one). Skipped on later encounters in the same session.
- **Level 2** — "What this means for your business": shown with the surface's own supported
  figure when the caller passes one, plus **Explain this for my business** →
  `useExplainGalileo()` → the live Galileo.
- **Level 3** — **Go deeper with Galileo** → `deeperExplanationQuestion()`.

`ExplainableText` is the free-text variant: it wraps only glossary terms found in a string
and caps how many it decorates (never Wikipedia). `detectTerms()` is deterministic
word-boundary matching — it cannot invent a term.

## 11. Canonical vs Galileo-generated explanations

| Part | Owner | Why |
|---|---|---|
| Which words get an affordance | `glossary.js` (controlled list + aliases) | a term outside it renders as plain text |
| The definition of a standard term | `glossary.js` (`plain`, `analogy`) — deterministic, one meaning per term | EBITDA has one meaning; it cannot be quietly redefined (Part 32) |
| Simplification, analogy, "for MY business", deeper teaching | **Galileo** (`askGalileo`, one assistant) | depends on the business's own numbers |
| This business's own figure | the calling surface passes it (`businessValue`) | if the surface does not hold it, nothing is guessed (Part 19) |

## 12. Contextual business explanation behaviour

Three ways in, one assistant: a live workspace Galileo registers first (last registered
wins, so the answer is scoped to where the owner stands), otherwise the Home ask bar, and
if neither is mounted the question travels as `?ask=` and is consumed by the Home ask bar
on mount (then cleared from the URL). The question carries the term, the surface, the
related value and the business — so Galileo knows exactly what was clicked.

## 13. Industry-specific terminology behaviour

The glossary tags industry terms (`saas`, `construction`, `professional_services`,
`healthcare`) but the detector does **not** branch on a selected industry — it explains only
terms that are actually present in rendered text. No industry metric is invented because an
industry exists. Industry-tailored phrasing is left to Galileo, which already knows the
business.

## 14. Galileo-answer simplification behaviour

`askGalileo`'s system prompt gained one LANGUAGE section: keep the correct term; gloss it
once in the same breath on first use in the conversation; never three paragraphs; answer
"what does that mean / I don't understand / why does that matter" as plain meaning →
analogy → this business; one meaning per standard term; use this business's verified
figures and say plainly when a figure is not on file. No prompt architecture, data priority,
labelling or recommendation logic was touched.

## 15. Document terminology behaviour

Extracted field labels are explained in the review card (the figure under review sits in
the same card, and the source-document link is unchanged), so understanding and proof stay
together. The original document is never modified — this is Vision's interpretation layer only.

## 16. Sprint / Expert terminology behaviour

Sprint task titles and expert brief fact labels run through `ExplainableText`, so an
instruction like "perform cohort analysis" or a fact like "Recast EBITDA" teaches the term
in place, before the owner decides to do it themselves or bring in an expert. No task text,
brief content or entitlement logic changed.

## 17. Business isolation

Unchanged and, where relevant, strengthened by reuse:

- The overlay renders the Data Room, which resolves documents against the ACTIVE business
  on the server. A document id belongs to a request, never a grant: an id from business B
  is not in business A's list and fails closed (no viewer, request cleared).
- `VisionWorkspace` already keys its content on `active_business_id`, so switching business
  unmounts the overlay rather than leaving A's document on screen.
- Upload intents carry only words (a need), never document identity.
- The glossary and explanation layer hold no business data at all; a business-specific
  figure is only ever passed in by the surface that already displays it.

## 18. Interaction contract updates

`src/VISION_INTERACTION_CONTRACT.md` — two new sections (Global Rule #1 and Global Rule #2)
with the six required rows: document upload CTA → overlay → existing uploader; document
reference → overlay → exact viewer document; document review → overlay → existing review
panel; industry term → plain-language explanation; explain for my business → contextual
Galileo; close document overlay → originating context. Three stale rows were corrected
(activity row, Connections upload, Destinations, dock).

## 19. Files changed

**Created (6):** `src/lib/galileo/glossary.js` · `src/lib/galileo/explainGalileo.js` ·
`src/lib/galileo/uploadIntent.js` · `src/components/galileo/explain/ExplainWithGalileo.jsx` ·
`src/components/galileo/explain/ExplainableText.jsx` ·
`src/components/galileo/documents/GalileoDocumentOverlay.jsx` · this report.

**Edited (22):** registry.js · openDocument.js · useVisionWorkspace.js · useVisionActions.js ·
homeCommandBar.js · nextStepResolver.js · GalileoNavMenu.jsx · GalileoHome.jsx ·
WhatIfSurface.jsx · WhatIfResult.jsx · VisionWorkspace.jsx · RecentDocuments.jsx ·
DataRequirementOverlay.jsx · DataRoom.jsx · BusinessValuation.jsx · ValueGapAssessmentCore.jsx ·
RecastEbitdaAssessmentCore.jsx · EnterpriseValuePanel.jsx · SprintTaskItem.jsx ·
ExpertTaskBrief.jsx · ExtractedFieldsReviewQueue.jsx · askGalileo/entry.ts ·
VISION_INTERACTION_CONTRACT.md.

**Untouched on purpose:** extraction, promotion writers, BIS read layer, document viewer,
Data Room backend actions, `business_facts`, routes (`/data-room`, `/upload` still resolve),
admin/internal document surfaces, business switching.

## 20. Build / lint

Recorded in the hand-off message for this pass (build + eslint on every changed file). No
publishing was performed.

## 21. Manual tests remaining (owner to run — I cannot drive the app)

A. Home → "Add a financial document" → overlay opens on the uploader (not a page).
B. What If → missing input → "Upload" → overlay upload with the need stated → close → the
   SAME scenario is still on screen.
C. Galileo answer document source → overlay → the exact document.
D. Assessment (Tax Gap / Value Gap) source link → exact document overlay.
E. Data Room Review reachable through the overlay ("Review what I found" → Review tab).
F. Business isolation: a document belonging to business B must not open under business A.
G. `EBITDA ⓘ` on Value Gap → plain-language meaning appears.
H. "Explain this for my business" → Galileo answers with the business's own figures.
I. Customer concentration (Sprint task or review field) → meaning, and a business-specific
   line only when a figure is actually known.
J. Sprint task jargon → affordance in the task title.
K. Expert brief jargon → affordance on the fact label.
L. Document accounting term (AR/AP/COGS) → affordance in the review card, source unchanged.
M. Closing the overlay returns to the exact originating context (What If / Sprint / Playbook).
N. "Show me my documents" in the ask bar → opens the overlay library.
O. Small screen → overlay is full-screen with a clear Back/Close.
P. Full per-surface jargon pass on the not-yet-placed surfaces in §9.