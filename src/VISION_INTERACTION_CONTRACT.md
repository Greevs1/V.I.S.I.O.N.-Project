# Vision Interaction Contract

Every reachable interactive control on the authenticated Vision surface, what it
must do, and what it needs. All Home routing lives in `src/hooks/useVisionActions.js`.
Business context for every row below is the canonical `active_business_id`.

Access legend: **—** none · **G** Galileo implementation (member/advisor; free sees access path) · **T** team (connected / included / access path)

| Control | Surface | Action | Expected result | Context carried | Access |
|---|---|---|---|---|---|
| Investigate / move CTA | Next Best Move | `handleMoveAction` | opportunity → Opportunity Focus · sprint/blocker → Sprint workspace · signal → domain focus · evidence gap → Data Room · scenario → What If · expert → Expert · question → Galileo | move id / domain | — |
| Why this? | Next Best Move | `home.handleWhyThis` | reasoning expands in place | move | — |
| Show me something else | Next Best Move | `home.handleShowAlternative` | next real alternative | move list | — |
| Review | Visit Summary | `openPlaybookAll` | Playbook | — | — |
| Now item CTA | Home | investigate → Playbook; others render as text | Playbook | — | — |
| Ask (submit) / prompt chip | Ask Galileo bar | `handleAsk` | answer panel | question | — |
| What If chip | Ask Galileo bar | `handleCommand('whatif')` | What If | — | — |
| **See what this could look like** | Answer panel | `runNextStep` (IMPLEMENTATION) | Implementation preview from the real Sprint generator | question, answer, next step | — (preview is never gated) |
| Secondary destination (e.g. Open your valuation) | Answer panel | `runSecondaryStep` | the category's real workspace/domain | — | — |
| With Galileo / With your team | Answer panel, What If, Opportunity | `ImplementationChoice` | guide session / expert sheet; locked paths hidden until after preview | full context package | G / T |
| Pulse tile (×6) | Business Pulse | `home.handleDomainClick` | domain focus | domain | — |
| View details | Business Pulse | workspace `dashboard` | Dashboard workspace | — | — |
| Sprint row | Active Work | `openSprint` | Sprint workspace | — | — |
| Opportunities row | Active Work | `openPlaybookAll` | Playbook | — | — |
| Activity row | Recent Activity | `openActivity` | document → Galileo document overlay (exact document) · valuation → Valuation · sprint → Sprint · opportunity → Opportunity Focus (Playbook if gone) | object id | — |
| Related opportunity | Domain focus | `openOpportunityById` | Opportunity Focus | opportunity id | — |
| Domain command chips | Domain focus | `handleCommand` | every action key has a handler (connect, playbook stages, valuation, sprint, expert, galileo, what if) | — | — |
| Row click | Playbook — opportunity | `handlePlaybookItem` | Opportunity Focus | opportunity | — |
| Row click | Playbook — sprint | `handlePlaybookItem` | Sprint workspace | — | — |
| Row click | Playbook — saved scenario | `handlePlaybookItem` | What If re-run with saved inputs | scenario key, question, inputs | — |
| Row click | Playbook — saved strategy / local saved | `handlePlaybookItem` | Galileo continues it | title, summary | — |
| Empty-state CTAs | Playbook | ask / What If / Data Room | each opens its real surface | — | — |
| See what this could look like | Opportunity Focus | `opportunity.seePlan` | Implementation preview | opportunity record | — |
| Explore with Galileo / question chips | Opportunity Focus | `askInContext` | Galileo answers about THIS opportunity | opportunity record | — |
| What if … | Opportunity Focus | `opportunity.whatIf` | only when a supported lever maps | lever + prompt | — |
| Build my 90-Day Plan | Implementation preview | `previewGalileo` | `selectPath` + `generateSprint(planned_tasks)` → Sprint workspace | previewed plan | G |
| Continue my plan | Implementation preview | `previewGalileo` | existing Sprint workspace (never replaced silently) | — | G |
| Unlock Galileo guidance / Explore expert support | any implementation choice | navigate `/strategy-call` | existing access path, no checkout | — | locked |
| Continue with your team / Get started | any implementation choice | expert sheet | real advisor named if one exists | context package | T |
| See the implementation plan | What If result | `scenarioActions.seePlan` | Implementation preview | scenario, comparison rows | — |
| Adjust assumptions | What If result | `whatIf.adjust` | same scenario re-run | lever inputs | — |
| Ask Galileo about this | What If result | `scenarioActions.ask` | Galileo answers with scenario context | scenario | — |
| Save to Playbook | What If result | `savedPlaybookData.savePlaybookItem` | saved_playbooks row, `hypothetical: true`, shown in Exploring | scenario | — |
| Try a scenario Vision can model / Ask Galileo instead | What If unsupported | `reset` / `askInContext` | catalog chips / Galileo | question | — |
| Ask Galileo the specifics | Guide session | `askInContext` | returns Home and answers (previously asked off-screen) | step + question | — |
| Saved item | Saved sheet | `openSavedItem` | Galileo continues it | title, summary | — |
| Add a financial document | Connections | `openUpload()` | **Galileo document overlay** on the existing uploader (never the standalone page) | — | — |
| Accounting integration | Connections | none (labelled "coming soon") | not clickable | — | — |
| Dock: Chat / Playbook / Documents / Connections / Expert | Dock | — | each opens its view; Documents opens the overlay library | — | — |
| Destinations | Header | workspace layer | Dashboard, Sprint, **Documents**, Assessments, Valuation | — | — |
| Workspace close / Back | Workspace | `useVisionWorkspace.close/back` | returns to the exact Vision view it opened over | — | — |

## 90-Day Sprint — expert-role pill (`resolveExpertAccess`)

WHO decides the door: **only** `resolveExpertAccess` (`src/lib/galileo/expertAccess.js`).
It reuses the app's existing Expert gate — `useMembership().isPaid`, the same test
`ExpertNetwork.jsx` already applies (`gated = !isPaid && (find | mine)` → `PremiumWorkspaceOverlay`) —
plus the existing internal-role authorization. Expert access **fails closed**: anything
unproven is LOCKED, and an unresolved profile shows "checking" rather than sales copy.
An `expert_advisor_access` / `assigned_advisor_id` / `client_saved_experts` relationship is
NOT entitlement; it only chooses which entitled door is shown.

| Source | Control | Action | Expected result | Context carried | Access |
|---|---|---|---|---|---|
| 90-Day Sprint task | Expert role pill | `SprintExpertPanel` (ENTITLED) | **Expert Task Brief** — task · objective · why Galileo recommended it · relevant canonical intelligence · desired outcome · your team → then the real Expert ecosystem (workspace transition) | business, sprint, task, recommended role, Galileo reasoning, relevant intelligence, advisor | Expert |
| 90-Day Sprint task | Expert role pill | `SprintExpertPanel` (NOT entitled) | **Expert Support Preview** — why the expertise matters · how that role would help · preparation checklist · Ask Galileo → then `/strategy-call`. No ExpertNetwork, no directory, no profiles, no contact details | business, sprint, task, recommended role, Galileo reasoning | — |
| 90-Day Sprint task | What should I prepare? | derived checklist + Ask Galileo | ✓ only facts Vision can verify in the canonical contract; everything else ○ Needed | canonical contract | — |
| 90-Day Sprint task | Ask Galileo about this task | `useAskGalileo` → `askGalileo` | answer in place; gated answers render exactly as the backend returned them | task + role context | G |
| 90-Day Sprint task | Back to 90-Day Sprint / Escape / × | close the panel | returns to the SAME sprint with the task context intact | — | — |
| 90-Day Sprint task | Find an Expert / Continue with your team | workspace `expert-network` (+ requested role payload) | directory opens over the Sprint; Back returns to the Sprint. The existing specialty filter applies only for a real taxonomy value; otherwise the requested expertise is shown as context and the full directory renders beneath | requested role | Expert |
| Expert Network (workspace) | requested expertise banner | — | states where the expertise came from, only for entitled owners | requested role | Expert |

## Global Rule #1 — Documents live inside the Galileo experience

Documents are infrastructure. One overlay shell (`GalileoDocumentOverlay`, mounted
as the `data-room` workspace, so every existing deep link still resolves) renders
the EXISTING surfaces — the Data Room page for library/review/viewer, the real
uploader for uploads — and owns no document behaviour of its own. The workspace
layer owns the return: closing always lands back on the exact Vision context the
overlay opened over.

| Control | Surface | Action | Expected result | Context carried | Access |
|---|---|---|---|---|---|
| **DOCUMENT UPLOAD CTA** — Upload financials · Add financial data · Add document · Provide financials · Add supporting document | Home Connections, Playbook empty state, What If missing input, Next Best Move (evidence gap), Valuation, Dashboard data requirement, Data Room header/empty state | `openUpload(needs)` → `open('data-room', null, { mode:'upload', needs })` | the overlay opens ON the existing uploader and states why Vision asked; the owner is never sent to a standalone upload page | business, need (plain words) | — |
| **DOCUMENT REFERENCE** — filename · metric source · evidence row · activity row · readiness gap | Recent Activity, Galileo badge, Recent Documents, assessment source, review source | `useOpenDocument(documentId)` (`@/lib/visionWorkspace/openDocument`) | the overlay opens the EXACT document in the existing viewer; still fail-closed against the active business's own document list | document id | — |
| **DOCUMENT LIBRARY** — "Show me my documents" · Documents dock item · Documents destination · View all | Ask bar (intent intercept), Dock, Destinations, Recent Documents | `openDocuments()` | the overlay opens on the existing Data Room library (filters, folders, readiness, processing state) | — | — |
| **DOCUMENT REVIEW** — "Review what I found" | Overlay result banner | overlay → `?tab=review` | the EXISTING review panel inside the overlay: accept / correct / reject / open source | business, extraction summary | — |
| **CLOSE DOCUMENT OVERLAY** | Overlay header × / ← Vision / Escape | `useVisionWorkspace.close` / `back` | returns to the EXACT originating Vision context (What If keeps its scenario, Sprint its task, Playbook its stage) | — | — |

## Global Rule #2 — Galileo translates business language

The professional term stays. A controlled glossary (`src/lib/galileo/glossary.js`)
decides WHICH words may carry an affordance and holds their canonical meaning; a
term outside it renders as plain text. Context, analogy and "what this means for
my business" come from the ONE Galileo — never from a second assistant.

| Control | Surface | Action | Expected result | Context carried | Access |
|---|---|---|---|---|---|
| **INDUSTRY TERM** — `EBITDA ⓘ` | Assessments, Valuation, Sprint task titles, Expert brief, What If rows, document review | `ExplainWithGalileo` / `ExplainableText` | one-sentence canonical meaning in plain English; the same term is not re-taught twice in a session | term | — |
| **EXPLAIN FOR MY BUSINESS** | the same affordance | `useExplainGalileo()` → live workspace Galileo → Home ask bar → `?ask=` hand-off | Galileo explains the term against THIS business's own supported figures, and says plainly when a figure is not on file | term, surface, related value, business | G |
| **Show me my documents** | Ask bar | `handleAsk` intent intercept | opens the document overlay library instead of answering in prose | — | — |
| **Jargon inside an answer** | Galileo answers | `askGalileo` LANGUAGE rule | the term is kept and glossed in one plain sentence on first use; an education question is answered meaning → analogy → this business | conversation | — |