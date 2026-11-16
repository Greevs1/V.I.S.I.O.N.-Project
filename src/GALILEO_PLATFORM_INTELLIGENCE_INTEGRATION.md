# Galileo Platform Intelligence Integration Blueprint — Phase 13.4D.1

**Date:** 2026-08-07
**Status:** Integration Blueprint (No implementation. No UI redesign. No new interfaces.)
**Certification:** READY FOR GALILEO PLATFORM INTEGRATION REVIEW

---

## 0. Governing Principle

This blueprint does not propose a single new screen, dashboard, report, or AI panel.

It proposes that Galileo become the **intelligence layer** that enriches every existing experience — by appearing at Decision Moments, not everywhere.

> Search before you build. Reuse before you replace. Extend before you duplicate. Enrich before you redesign.

---

## PHASE 1 — Platform Intelligence Inventory

Every user-facing experience, its current data sources, current intelligence, and current Galileo integration.

### 1.1 Dashboard (`src/pages/Dashboard.jsx`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | The member's operating system — intelligence profile, gaps, next action, sprint bridge, briefing replay. |
| **Data Sources** | BIS (Business Intelligence State), BIE (Business Intelligence Engine), assessment summaries, sprint recommendations, dashboard metrics. |
| **Actions** | Replay briefing, start sprint, navigate to assessments, open Galileo panel. |
| **Current Intelligence** | `IQDashboard` (gap cards with severity), `NextBestAction` (supabase-driven recommendations), `GalileoCardInsight` (deterministic card-level "why"), `WhyButton` (deterministic metric explanations), `ExecutiveBriefing` (narrative engine), `MemberWelcomeBriefing` (feature tour). |
| **Current Recommendations** | `NextBestAction` card (accept/dismiss), `WhatsNext`, `SprintBridge`. |
| **Current Explanations** | `WhyButton` (metric provenance), `GalileoCardInsight` (card-level insight popovers). |
| **Current Galileo Integration** | `GalileoPanel` (slide-out chat), `PersistentGalileo` (journey companion), `GalileoCardInsight` (card sparkles), `WhyButton` (Galileo-branded popover). |
| **Potential Galileo Enhancement** | Explain score movement between snapshots; explain trend direction; explain why a specific next action was ranked #1; compare current vs. potential state in natural language. |

### 1.2 Executive Briefing (`src/components/dashboard/ExecutiveBriefing.jsx`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Cinematic, chapter-by-chapter walkthrough of the member's business intelligence. |
| **Data Sources** | `executiveNarrativeEngine`, `executiveBriefingCopy`, BIS, `businessIntelligenceState`. |
| **Actions** | Navigate chapters, replay, continue to dashboard, meet advisor. |
| **Current Intelligence** | Fully deterministic narrative from `buildExecutiveNarrative(bis, impactResult)`. 8-section structure per chapter (What you're seeing, Why it matters, What we found, Opportunity, Next move, Potential upside, Evidence strength, Executive insight). |
| **Current Recommendations** | "Highest-Leverage Next Move" per chapter. |
| **Current Explanations** | Full provenance via `EVIDENCE_LABEL` / `EVIDENCE_COLOR`. |
| **Current Galileo Integration** | `GalileoPanel` sub-component inside `ExecutiveBriefing` renders the 8 sections with Galileo branding. |
| **Potential Galileo Enhancement** | Answer follow-up questions about a specific chapter ("why is my profit gap this size?"); compare to industry benchmark in natural language; explain what would change the score. |

### 1.3 Business Valuation — ValuationExperienceShell (`src/components/valuation/experience/ValuationExperienceShell.jsx`)

Six-workspace institutional journey: Discover → Validate → Build Value → Valuation → Growth Plan → Deliverables (+ Advanced).

#### 1.3a Discover / IntelligenceWorkspace

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Gather and organize everything known about the business. |
| **Data Sources** | `valuationIntelligenceService` (candidates, conflicts, documents, assessments, add-backs, missing info). |
| **Current Intelligence** | `IntelligenceSummary` (completion %, conflicts, missing), `RecommendedAction`, `BusinessSnapshot`, `DocumentIntelligence`, `AssessmentIntelligence`, `AddBackCandidates`, `MissingInformation`. |
| **Current Galileo Integration** | `AskGalileoCard` available in valuation context (conversation_mode: valuation_advisor). |
| **Potential Galileo Enhancement** | Explain why a field is low-confidence; explain a conflict in natural language; recommend which missing field to gather first; explain what a document extraction means. |

#### 1.3b Validate / VerifyWorkspace

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Resolve conflicts, approve information, clear publication blockers. |
| **Data Sources** | `verificationQueueService` (queue items, conflicts, add-backs, client requests). |
| **Current Intelligence** | `QueueSummary`, `QueueCard` with priority/impact/confidence, `ConflictResolutionModal`, `AddBackReviewModal`, `ClientRequestModal`. |
| **Current Galileo Integration** | None directly in the queue. |
| **Potential Galileo Enhancement** | Prioritize which conflict to resolve first by valuation impact; explain a conflict's root cause; recommend which source to trust; explain why an add-back was proposed. |

#### 1.3c Build Value / BuildValueWorkspace

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Understand strengths, weaknesses, risks, capabilities influencing value. |
| **Data Sources** | `buildValueEngine` (6 dimensions), `insightsEngine` (executive insights), value drivers. |
| **Current Intelligence** | `BusinessQualitySummary`, `DimensionScorecard` (per-dimension: score, confidence, strength, risk, missing evidence, EBITDA/multiple relevance), `ExecutiveInsights` (top drivers, detractors, fastest wins, constraints, version deltas). |
| **Current Galileo Integration** | `AskGalileoCard` in valuation context. `DimensionScorecard` has "recommended next step" per dimension. |
| **Potential Galileo Enhancement** | Explain why a dimension scored the way it did; explain what evidence would raise the score; compare dimensions; explain the relationship between a detractor and EBITDA/multiple. |

#### 1.3d Valuation / ValuationWorkspace

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Determine indicated Enterprise Value and Equity Value. |
| **Data Sources** | `valuationCalculationService` (calc summary, methods, reconciliation, confidence), `valuationState` (conclusion, publish status). |
| **Current Intelligence** | 10-stage workspace (maintainable earnings, historical weighting, methods, reconciliation, EV, equity, confidence, conclusion, publication readiness). `ValuationActionBar`, `ValuationJourneyNav`, `WeightingSection`. |
| **Current Galileo Integration** | `AskGalileoCard` with valuation_id scoping. |
| **Potential Galileo Enhancement** | Explain Enterprise Value in natural language; explain methodology selection; explain confidence score; compare versions; explain what changed between versions and why. |

#### 1.3e Growth Plan / GrowthPlanWorkspace

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Prioritize initiatives to improve EBITDA, multiple, transferability, EV. |
| **Data Sources** | `growthPlanEngine` (candidate initiatives, chain of custody, progress), `insightsEngine`. |
| **Current Intelligence** | `InitiativeCard` (full provenance: problem, relevance, impacts, cost, ROI, timeline, difficulty, confidence, dependencies, KPI, baseline, target, verification, readiness), `AdvisorPrioritizationPreview`, `ClientGrowthPlanPreview`, `ChainOfCustodyDrawer`. |
| **Current Galileo Integration** | `AskGalileoCard` in valuation context. |
| **Potential Galileo Enhancement** | Explain initiative sequencing; explain ROI calculation; identify dependencies; recommend priority order; explain why an initiative is "fast win" vs. "strategic". |

#### 1.3f Deliverables / DeliverablesWorkspace

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Prepare, review, publish, share valuation outputs by audience. |
| **Data Sources** | `deliverablesEngine` (deliverable metadata, audience grouping, progress), `valuationService` (versions, sharing). |
| **Current Intelligence** | `DeliverableCard` (status, staleness, sharing, missing sections), `ReportPreviewDrawer`, audience grouping (Client, Advisor, Transaction). |
| **Current Galileo Integration** | None directly. |
| **Potential Galileo Enhancement** | Generate executive summaries for reports; answer questions about a report; explain a chart; explain why a section is missing; recommend which deliverable to share first. |

#### 1.3g Advanced / AdvancedWorkspaceContent

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Full specialist access to all 26 detailed valuation tools. |
| **Data Sources** | All valuation engines (normalized earnings, multiple, DCF, cap earnings, asset, reconciliation, equity bridge, confidence, scenarios, value drivers, EV timeline, advisor review, conclusion, client summary, version history). |
| **Current Intelligence** | Each tool has its own panel with deterministic outputs. |
| **Current Galileo Integration** | `AskGalileoCard` available. |
| **Potential Galileo Enhancement** | Explain any calculation input; explain methodology choice; explain reconciliation weighting; explain confidence factors. |

### 1.4 Field Evidence System (`src/components/valuation/governance/`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Progressive discovery of field provenance via clickable metrics. |
| **Data Sources** | `FieldEvidenceContext` (openEvidence), `EvidenceDrawer` (governance, documents, AI extraction, audit log, change requests, calculations), `EvidenceMetric`, `FieldLockBadge`. |
| **Current Intelligence** | Full chain-of-custody per field: owner, lock, source of truth, confidence, AI recommendation status, change history, conflicts, change requests. |
| **Current Galileo Integration** | Evidence drawer is deterministic (no LLM). `metricEvidenceRegistry` maps metrics to definitions. |
| **Potential Galileo Enhancement** | Explain why a field's confidence is low; explain the conflict between two sources; recommend which source to trust; explain what evidence would raise confidence. |

### 1.5 Assessments (`src/pages/assessments/`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Profit Gap, Value Gap, Recast EBITDA, Tax Gap, Operations Gap, Freedom, Cost of Inaction, Strategic Roadmap. |
| **Data Sources** | `AssessmentContext`, `assessmentCalculations`, `assessmentValidation`, `assessmentPrefillMap`, `assessmentCompletionService`. |
| **Current Intelligence** | Each assessment calculates results, severity, benchmark comparison. `CostOfInaction` shows 10-year impact. `StrategicRoadmap` sequences actions. |
| **Current Galileo Integration** | `PersistentGalileo` provides context guidance per assessment. `GalileoPanel` available. |
| **Potential Galileo Enhancement** | Explain score in natural language; benchmark against industry; explain business impact of closing the gap; recommend which assessment to complete next. |

### 1.6 90-Day Sprints (`src/components/sprint/`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Turn intelligence into measurable progress via focused execution. |
| **Data Sources** | `sprintRecommendations` (BIE-driven), `ninetyDaySprint` backend, `SprintTask`, `SprintTaskNote`, `SprintTaskDocument`, `SprintReminder`, `CalendarSyncEvent`. |
| **Current Intelligence** | `SprintView` (paths, tasks, weeks/months), `NextBestAction` (sprint), `PathSelection`, `OpportunityVault`, `SavedPlaybook`, `SprintVerificationQueue`, `SprintVerificationBadge`, `SprintVerificationControls`, `StrategicTimeline`. |
| **Current Galileo Integration** | `ExplainWhyModal` explains why a path was recommended. `AskGalileoCard` available. |
| **Potential Galileo Enhancement** | Explain why a task is sequenced first; explain the connection between a task and a gap; recommend which task to do next; explain verification status. |

### 1.7 Documents / Data Room (`src/pages/DataRoom.jsx`, `src/components/documents/`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Upload, organize, classify, and extract intelligence from financial documents. |
| **Data Sources** | `Document` entity, `DocumentFolder`, `DocumentClassification`, `ClassificationMemory`, `runDocumentExtraction`, `uploadDocumentToSupabase`, `googleDriveImport`. |
| **Current Intelligence** | `DataRoomTabs`, `SystemFolderPanel`, `DocumentReadinessPanel`, `ClassificationReviewQueue`, `DocumentClassificationOverride`, `DocumentViewer`, `GoogleDrivePicker`, `GoogleDriveImport`. |
| **Current Galileo Integration** | None directly in the data room. |
| **Potential Galileo Enhancement** | Explain extracted values; highlight inconsistencies across documents; recommend which documents to upload; explain classification confidence. |

### 1.8 Reports / Deliverables (covered in 1.3f)

### 1.9 Notifications (`src/components/notifications/NotificationBell.jsx`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Surface action-required, reminders, achievements, system updates. |
| **Data Sources** | `Notification` entity, `notificationService`, `NotificationPreferences`. |
| **Current Intelligence** | Priority dots, category colors, time-ago, action URLs, mark-read. |
| **Current Galileo Integration** | `galileo_update` notification type exists. |
| **Potential Galileo Enhancement** | Explain why a notification matters; recommend which notification to act on first; summarize unread notifications. |

### 1.10 Business Intelligence (BIE/BIS)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Canonical recommendation engine, intelligence state, snapshots, health. |
| **Data Sources** | `src/lib/bie/` (engine, health, journal, snapshots, graph, galileoSummaries, metricTypes), `biePersistence`. |
| **Current Intelligence** | Canonical recommendations, targeted improvements, gap details, IQ score, business impact score, freedom projections. |
| **Current Galileo Integration** | `askGalileo` backend consumes canonical recommendations. `generateGalileoInsights` produces deterministic insights. |
| **Potential Galileo Enhancement** | Explain recommendation ranking; explain why a recommendation is canonical vs. hypothesis; explain the BIE confidence in a recommendation. |

### 1.11 Advisory Hub (`src/pages/advisory/CommandCenter.jsx`)

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | Advisor's real-time view of client intelligence, sprint progress, gaps. |
| **Data Sources** | `generateAdvisorCommandCenter`, `AdvisorCommandCenter`, `AdvisorVerificationPanel`, `NextBestActionsAdvisor`. |
| **Current Intelligence** | Client list, sprint status, gap summaries, verification queue. |
| **Current Galileo Integration** | `AskGalileoCard` with targetBusinessId. |
| **Potential Galileo Enhancement** | Summarize a client's status; recommend which client needs attention; explain a client's score movement; prepare meeting context. |

### 1.12 Calculators / Simulators

| Dimension | Current State |
|-----------|--------------|
| **Purpose** | MA Simulator, Exit Readiness, Dynamic Scenario Builder, Path to Freedom. |
| **Data Sources** | `MASimulator`, `ExitReadiness`, `DynamicScenarioBuilder`, `PathToFreedom`, `FreedomAccelerationCard`, `VisionROIScore`. |
| **Current Intelligence** | Deterministic calculations with adjustable levers. |
| **Current Galileo Integration** | `GalileoCardInsight` on scenario builder. |
| **Potential Galileo Enhancement** | Explain the impact of a lever change; recommend which lever to adjust; compare scenarios in natural language. |

### 1.13 Drawers / Cards / Tables / Charts / Panels / Dialogs

| Dimension | Current State |
|-----------|--------------|
| **Drawers** | `EvidenceDrawer`, `ValuationDetailsDrawer`, `ReportPreviewDrawer`, `ChainOfCustodyDrawer`, `JourneyTranscriptDrawer`, `DetailDrawer`. |
| **Cards** | `GapCard`, `BriefingCard`, `FocusStageCard`, `InitiativeCard`, `DeliverableCard`, `QueueCard`, `ValueDriverCard`, `ValueDetractorCard`, `GalileoCardInsight`, `GalileoGuidanceCard`, `GalileoAdvisorCard`. |
| **Tables** | `SprintView` task tables, `AdminUsers`, `ExpertApplicationsManager`. |
| **Charts** | `HistoricalChart`, `EnterpriseValueTimeline`, `ValueCreationTimeline`, `BusinessTimeline`, `recharts` components. |
| **Panels** | `GalileoPanel`, `AskGalileoCard`, `IntelligencePanel`, `ExplainabilityPanel`, `GalileoPageGuide`, `GalileoHelpBubble`. |
| **Dialogs** | `ConflictResolutionModal`, `AddBackReviewModal`, `ClientRequestModal`, `InitiativeFormModal`, `BookingModal`, `ExplainWhyModal`, `FeatureAccessModal`, `MembershipUpgradeBanner`. |
| **Current Galileo Integration** | Varies — some have `GalileoCardInsight`, most do not. |
| **Potential Galileo Enhancement** | Each drawer/card/chart can have a contextual "explain this" entry point at its Decision Moment. |

---

## PHASE 2 — Galileo Decision Moment Map

A Decision Moment occurs when a user naturally asks: *What does this mean? Why did this happen? Is this good or bad? What should I do next? Which option is better? Am I ready? What am I missing? What is the business impact?*

### 2.1 Dashboard Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| D1 | IQ Score card | "What does my score mean?" | Understand readiness | Is 62 good? | **Explain** | High (deterministic) |
| D2 | Gap card (any) | "Is this gap bad?" | Understand severity | Is 'Significant' urgent? | **Explain** | High |
| D3 | Gap card | "What's the business impact?" | Prioritize | Which gap first? | **Recommend** | High (BIE-ranked) |
| D4 | NextBestAction | "Why this action?" | Accept/dismiss | Is this the right move? | **Explain** | High (BIE reason) |
| D5 | Score movement | "Why did my score change?" | Understand trend | What caused the delta? | **Explain** | Medium (needs delta data) |
| D6 | Sprint bridge | "Should I start a sprint?" | Commit to execution | Am I ready? | **Recommend** | High |

### 2.2 Executive Briefing Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| B1 | Chapter finding | "Why is this the finding?" | Understand | What data drove this? | **Explain** | High (engine observation) |
| B2 | Potential upside | "Is this realistic?" | Trust | Can I actually achieve this? | **Explain** | Medium (projection) |
| B3 | Evidence strength | "How confident should I be?" | Trust | Is the data reliable? | **Explain** | High (confidence label) |
| B4 | Next move | "Should I do this?" | Act | Is this the right next step? | **Recommend** | High |
| B5 | Outro choices | "Which path?" | Choose | Dashboard, sprint, or advisor? | **Stay Silent** (user chooses) | — |

### 2.3 Valuation — Discover Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| V1 | Low-confidence field | "Why low confidence?" | Investigate | Is this data reliable? | **Explain** | High (provenance) |
| V2 | Conflict | "Which source is right?" | Resolve | Trust A or B? | **Recommend** | Medium (advisor confirms) |
| V3 | Missing field | "What should I gather?" | Prioritize | Which document first? | **Recommend** | High (impact-ranked) |
| V4 | Add-back candidate | "Is this a valid add-back?" | Approve/reject | Will a buyer accept this? | **Explain** | Medium |
| V5 | Completion % | "Am I ready to value?" | Proceed | Is 78% enough? | **Recommend** | High (threshold-based) |

### 2.4 Valuation — Validate Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| Q1 | Queue item | "Which to resolve first?" | Prioritize | Impact ranking | **Recommend** | High (valuation impact) |
| Q2 | Conflict detail | "What caused this?" | Understand | Root cause | **Explain** | Medium |
| Q3 | Publication blocker | "What's blocking me?" | Unblock | What must change? | **Explain** | High (blocker list) |
| Q4 | Client request | "What should I ask the client?" | Draft request | Which missing info? | **Recommend** | High |

### 2.5 Valuation — Build Value Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| BV1 | Dimension score | "Why this score?" | Understand | What drove it? | **Explain** | High (evidence-based) |
| BV2 | Missing evidence | "What would raise this?" | Act | What to gather? | **Recommend** | High |
| BV3 | Detractor | "How does this hurt value?" | Understand | EBITDA/multiple impact | **Explain** | High (relevance labels) |
| BV4 | Fastest win | "Which is fastest?" | Prioritize | ROI ranking | **Recommend** | High |
| BV5 | Dimension comparison | "Which is weakest?" | Compare | Relative standing | **Compare** | High |

### 2.6 Valuation — Valuation Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| VA1 | Enterprise Value | "What's my business worth?" | Understand | Is this number right? | **Explain** | High (methodology) |
| VA2 | Methodology | "Why this method?" | Understand | Why DCF vs. multiple? | **Explain** | High |
| VA3 | Confidence score | "How confident is this?" | Trust | Is the valuation reliable? | **Explain** | High (confidence engine) |
| VA4 | Version delta | "What changed?" | Understand | Delta explanation | **Explain** | High (delta engine) |
| VA5 | Publication readiness | "Am I ready to publish?" | Publish | Blockers remaining? | **Recommend** | High (readiness check) |

### 2.7 Valuation — Growth Plan Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| GP1 | Initiative | "Why this initiative?" | Understand | What's the thesis? | **Explain** | High (chain of custody) |
| GP2 | Initiative ROI | "Is the ROI realistic?" | Trust | Will this pay off? | **Explain** | Medium |
| GP3 | Sequencing | "Which first?" | Prioritize | Dependencies? | **Recommend** | High (dependency graph) |
| GP4 | Client visibility | "Should the client see this?" | Share | Is it client-safe? | **Recommend** | High (client-safe filter) |
| GP5 | Send to sprint | "Ready to execute?" | Commit | Is it ready? | **Recommend** | High (readiness check) |

### 2.8 Valuation — Deliverables Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| DL1 | Stale report | "Why is it stale?" | Understand | What changed? | **Explain** | High (staleness map) |
| DL2 | Missing section | "What's missing?" | Act | What to complete? | **Recommend** | High |
| DL3 | Share decision | "Should I share this?" | Share | Is it client-safe? | **Recommend** | High |
| DL4 | Report preview | "What does this chart mean?" | Understand | Chart explanation | **Explain** | Medium |

### 2.9 Sprint Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| SP1 | Path selection | "Which path?" | Choose | Cash flow vs. EV vs. tax? | **Recommend** | High (BIE-ranked) |
| SP2 | Task ordering | "Why this task first?" | Understand | Sequencing logic | **Explain** | High |
| SP3 | Task completion | "Did I do this right?" | Verify | Verification status | **Explain** | High |
| SP4 | Blocked task | "Why am I blocked?" | Unblock | What's the blocker? | **Explain** | High |
| SP5 | Sprint progress | "Am I on track?" | Assess | Progress vs. timeline | **Explain** | High |

### 2.10 Document Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| DOC1 | Extracted value | "Is this extraction right?" | Verify | AI confidence | **Explain** | Medium |
| DOC2 | Classification | "Is this the right folder?" | Confirm | Classification confidence | **Explain** | High (memory) |
| DOC3 | Missing document | "What should I upload?" | Act | Which document? | **Recommend** | High (readiness) |
| DOC4 | Inconsistency | "Why do these disagree?" | Investigate | Conflict root cause | **Explain** | Medium |

### 2.11 Assessment Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| AS1 | Score result | "What does this mean?" | Understand | Score interpretation | **Explain** | High |
| AS2 | Benchmark | "How do I compare?" | Understand | Industry standing | **Explain** | High (benchmarks) |
| AS3 | Business impact | "What's the dollar impact?" | Prioritize | Gap value | **Explain** | High |
| AS4 | Next assessment | "Which should I take?" | Choose | Priority order | **Recommend** | High |

### 2.12 Advisory Hub Decision Moments

| # | Location | User Goal | Decision | Uncertainty | Galileo Action | Confidence |
|---|----------|-----------|----------|------------|----------------|------------|
| AH1 | Client list | "Who needs attention?" | Prioritize | Risk ranking | **Recommend** | Medium |
| AH2 | Client status | "What's their status?" | Understand | Summary | **Summarize** | High |
| AH3 | Meeting prep | "What should we discuss?" | Prepare | Agenda | **Recommend** | High |

---

## PHASE 3 — Duplication Review

### 3.1 Identified Duplications

| # | Concept | Locations | Recommendation |
|---|---------|-----------|----------------|
| 1 | **"Why?" explanation** | `WhyButton` (dashboard metrics), `GalileoCardInsight` (dashboard cards), `ExplainWhyModal` (sprint paths), `EvidenceDrawer` (valuation fields) | **Consolidate** into a single `GalileoExplanation` pattern with context-specific content sources. All four already use deterministic data — unify the invocation pattern, not the content. |
| 2 | **Recommendation card** | `NextBestAction` (dashboard), `NextBestAction` (sprint), `RecommendedAction` (intelligence), `RecommendedAction` (growth plan next action) | **Consolidate** into a single `GalileoRecommendation` card pattern. All pull from BIE canonical recommendations — unify the rendering, not the source. |
| 3 | **Galileo chat interface** | `GalileoPanel` (slide-out), `AskGalileoCard` (embedded) | **Consolidate** — `AskGalileoCard` is the newer, scoped version (valuation context, conversation persistence). `GalileoPanel` is the older, unscoped version. Migrate all `GalileoPanel` usage to `AskGalileoCard` with context. Do NOT create a third. |
| 4 | **Executive summary / briefing** | `ExecutiveBriefing` (cinematic), `MemberWelcomeBriefing` (feature tour), `ExecutiveInsights` (valuation), `IntelligenceSummary` (discover) | **No consolidation needed** — each serves a distinct purpose (briefing = narrative walkthrough, welcome = onboarding, insights = valuation analysis, summary = intelligence overview). But Galileo enrichment should be consistent across all four. |
| 5 | **Insight popover** | `GalileoCardInsight` (dashboard), `GalileoGuidanceCard` (journey), `GalileoHelpBubble` (general), `GalileoPageGuide` (page-level) | **Consolidate** into two patterns: (a) card-level insight popover (existing `GalileoCardInsight`), (b) page-level guide (existing `GalileoPageGuide`). Remove `GalileoHelpBubble` and `GalileoGuidanceCard` by migrating their content into the unified patterns. |
| 6 | **Notification vs. recommendation** | `NotificationBell` (system events), `NextBestAction` (BIE recommendations) | **No consolidation** — these are distinct. Notifications are event-driven; recommendations are intelligence-driven. But Galileo can enrich both (explain a notification, explain a recommendation). |

### 3.2 Duplication Risk Assessment

**Low risk.** The platform already has strong separation of concerns. The main duplication is in the *invocation pattern* for Galileo explanations (4 different "why" buttons), not in the underlying data. Consolidating the pattern — not the data — is the recommended approach.

---

## PHASE 4 — Intelligence Enrichment Map

How Galileo enhances each existing module. **Never rebuild. Always extend.**

### 4.1 Dashboard

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Explain score movement | EIE `assessSituation` detects `recentChanges` → Galileo explains delta | `whyExplanations.js`, BIS journal |
| Explain trend direction | EIE reads BIS historical snapshots → Galileo narrates trend | `bie/snapshots.js`, `HistoricalChart` |
| Recommend next action | EIE `generateRecommendations` → surfaces in existing `NextBestAction` card | `NextBestAction` component, BIE recommendations |
| Explain why #1 is #1 | EIE `selectCapability` + `whySelected` → enriches `NextBestAction` reason field | `NextBestAction.reason` |

### 4.2 Business Valuation

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Explain Enterprise Value | EIE selects `explain.enterprise_value` capability → answer flows through `AskGalileoCard` | `AskGalileoCard`, `valuationCalculationService` |
| Explain confidence | EIE selects `explain.confidence` → confidence engine data | `ConfidenceScoring`, `confidenceEngine` |
| Explain methodology | EIE selects `explain.methodology` → methodology registry | `methodologyRegistry.ts` |
| Explain changes | EIE selects `compare.versions` → delta engine | `deltaEngine.ts`, `VersionIntelligencePanel` |
| Explain evidence | EIE selects `explain.evidence` → evidence drawer data | `EvidenceDrawer`, `metricEvidenceRegistry` |

### 4.3 Growth Plan

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Explain initiative sequencing | EIE selects `explain.initiative_sequencing` → dependency graph | `growthPlanEngine`, `ChainOfCustodyDrawer` |
| Explain ROI | EIE selects `explain.roi` → initiative cost/impact | `InitiativeCard` data |
| Identify dependencies | EIE selects `explain.dependencies` → initiative dependencies | `InitiativeCard.dependencies` |
| Recommend priorities | EIE `generateRecommendations` → enriches `AdvisorPrioritizationPreview` | `AdvisorPrioritizationPreview` |

### 4.4 Verification Queue

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Prioritize conflicts | EIE `determinePriorities` → queue already sorts by priority | `VerifyWorkspace` sort logic |
| Recommend evidence | EIE selects `recommend.evidence` → missing evidence list | `MissingInformation` |
| Explain conflicts | EIE selects `explain.conflict` → conflict data | `ConflictResolutionModal` |

### 4.5 Documents

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Explain extracted values | EIE selects `explain.extraction` → document intelligence | `DocumentIntelligence` |
| Highlight inconsistencies | EIE `assessSituation` detects conflicts → surfaces in existing conflict UI | `ClassificationReviewQueue` |
| Recommend uploads | EIE selects `recommend.upload` → document readiness | `DocumentReadinessPanel` |

### 4.6 Assessments

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Explain scores | EIE selects `explain.score` → assessment results | `GalileoCardInsight` pattern |
| Benchmark results | EIE selects `explain.benchmark` → benchmark library | `lib/benchmarks` |
| Business impact | EIE selects `explain.impact` → gap dollar values | `CostOfInaction`, gap data |

### 4.7 Reports / Deliverables

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Generate executive summaries | EIE selects `summarize.report` → report preview | `ReportPreviewDrawer` |
| Answer report questions | EIE selects `explain.report` → report content | `ReportPreviewDrawer` |
| Explain charts | EIE selects `explain.chart` → chart data | `recharts` components |

### 4.8 Executive Brief

| Enhancement | Mechanism | Reuses |
|-------------|----------|--------|
| Enhance existing priorities | EIE `determinePriorities` → enriches briefing priorities | `ExecutiveBriefing` steps |
| Enhance reasoning | EIE `assessConfidence` → enriches evidence strength | `EVIDENCE_LABEL` |
| Enhance follow-up | EIE `planFollowUp` → enriches "next move" | `BriefingCard` next step |

---

## PHASE 5 — Platform Readiness Score

| Module | Intelligence Level | Galileo Readiness | Priority |
|--------|-------------------|-------------------|----------|
| Dashboard — IQ cards | **Already Intelligent** (GalileoCardInsight + WhyButton) | Ready for EIE enrichment | P1 |
| Dashboard — NextBestAction | **Already Intelligent** (BIE-driven) | Ready for EIE explanation | P1 |
| Executive Briefing | **Already Intelligent** (narrative engine) | Ready for EIE follow-up Q&A | P2 |
| Valuation — Discover | **Partially Intelligent** (recommended action, no Galileo explanation per field) | Ready for Galileo | P0 |
| Valuation — Validate | **Partially Intelligent** (priority sort, no Galileo explanation) | Ready for Galileo | P0 |
| Valuation — Build Value | **Partially Intelligent** (dimension scorecards, no Galileo explanation per dimension) | Ready for Galileo | P0 |
| Valuation — Valuation | **Partially Intelligent** (AskGalileoCard scoped, no EV explanation) | Ready for Galileo | P0 |
| Valuation — Growth Plan | **Partially Intelligent** (initiative cards, no Galileo sequencing explanation) | Ready for Galileo | P1 |
| Valuation — Deliverables | **Ready for Galileo** (no intelligence layer) | Ready for Galileo | P2 |
| Field Evidence System | **Already Intelligent** (full provenance, deterministic) | Ready for EIE enrichment | P1 |
| Assessments | **Partially Intelligent** (scores, no Galileo explanation) | Ready for Galileo | P1 |
| 90-Day Sprints | **Partially Intelligent** (ExplainWhyModal exists, limited) | Ready for Galileo | P1 |
| Documents / Data Room | **Ready for Galileo** (no intelligence layer) | Ready for Galileo | P2 |
| Notifications | **Partially Intelligent** (priority dots, no Galileo explanation) | Future Opportunity | P3 |
| BIE / BIS | **Already Intelligent** (canonical engine) | Already integrated with askGalileo | — |
| Advisory Hub | **Partially Intelligent** (client list, no Galileo summary) | Ready for Galileo | P2 |
| Calculators / Simulators | **Partially Intelligent** (GalileoCardInsight on scenario) | Ready for Galileo | P2 |

---

## PHASE 6 — Implementation Roadmap

### 6.1 Quick Wins (P0 — Immediate, High ROI, Low Effort)

These enrich existing experiences with minimal new code by routing EIE decisions through the existing `AskGalileoCard`:

1. **Valuation — Discover: Explain low-confidence fields** — Add a Galileo entry point on low-confidence field rows that opens `AskGalileoCard` pre-seeded with "Why is this field low confidence?"
2. **Valuation — Validate: Explain conflicts** — Add a Galileo entry point on conflict cards that opens `AskGalileoCard` pre-seeded with "Explain this conflict."
3. **Valuation — Build Value: Explain dimension scores** — Add a Galileo entry point on each `DimensionScorecard` that opens `AskGalileoCard` pre-seeded with "Why did this dimension score this way?"
4. **Valuation — Valuation: Explain Enterprise Value** — Add a Galileo entry point on the EV conclusion that opens `AskGalileoCard` pre-seeded with "Explain my Enterprise Value."

**Mechanism:** All four reuse the existing `AskGalileoCard` with `valuationId` + `workspaceKey` + a pre-seeded question. No new component. No new backend. The `askGalileo` function already handles valuation context.

### 6.2 High ROI (P1 — Near-Term, Medium Effort)

5. **Dashboard: Explain score movement** — Enrich the existing `DashboardHero` "last updated" indicator with a Galileo entry point that explains what changed since the last BIS snapshot.
6. **Dashboard: Explain why #1 is #1** — Enrich `NextBestAction.reason` with EIE's `whySelected` reasoning.
7. **Valuation — Growth Plan: Explain initiative sequencing** — Add a Galileo entry point on `InitiativeCard` that explains why it's sequenced where it is.
8. **Assessments: Explain score + benchmark** — Add `GalileoCardInsight` pattern (already exists on dashboard) to assessment result pages.
9. **90-Day Sprints: Explain task ordering** — Enrich `SprintTaskItem` with a Galileo entry point that explains why a task is sequenced first.
10. **Field Evidence: Explain low confidence** — Enrich `EvidenceDrawer` with a Galileo entry point that explains why a field's confidence is low and what evidence would raise it.

### 6.3 Strategic (P2 — Medium-Term, Higher Effort)

11. **Valuation — Deliverables: Report Q&A** — Add `AskGalileoCard` inside `ReportPreviewDrawer` so advisors can ask questions about a report.
12. **Advisory Hub: Client summary** — Enrich `AdvisorCommandCenter` with a Galileo-generated client status summary.
13. **Documents: Explain extraction** — Add a Galileo entry point on extracted field values in `DocumentIntelligence`.
14. **Executive Briefing: Follow-up Q&A** — Add `AskGalileoCard` inside the briefing flow so members can ask follow-up questions about a chapter.

### 6.4 Long-Term (P3 — Future)

15. **Notifications: Explain why it matters** — Enrich `NotificationBell` items with a Galileo explanation of why a notification matters.
16. **Calculators: Explain lever impact** — Enrich `DynamicScenarioBuilder` with Galileo explanation of lever changes.
17. **Consolidation: Unify "why" patterns** — Consolidate `WhyButton`, `GalileoCardInsight`, `ExplainWhyModal`, and `EvidenceDrawer` explanations into a single `GalileoExplanation` invocation pattern (different content sources, same UX).

### 6.5 Recommended Implementation Order

```
P0 (Quick Wins)     → Valuation Discover/Validate/Build Value/Valuation explanation entry points
                     (reuses AskGalileoCard, no new components)

P1 (High ROI)       → Dashboard score movement, NextBestAction reasoning,
                     Growth Plan sequencing, Assessment insights,
                     Sprint task ordering, Evidence confidence

P2 (Strategic)      → Deliverables Q&A, Advisory summaries,
                     Document extraction, Briefing follow-up

P3 (Long-Term)      → Notification enrichment, Calculator enrichment,
                     Pattern consolidation
```

---

## PHASE 7 — Architectural Recommendations

### 7.1 Single Intelligence Layer

Galileo remains the **only** AI interface. No separate chatbots, no separate AI panels, no separate recommendation systems. Every enrichment flows through:

```
User question / Decision Moment
       │
       ▼
EIE (Executive Intelligence Engine) — decides what to do
       │
       ▼
askGalileo backend — assembles context, calls LLM
       │
       ▼
AskGalileoCard (existing) — renders response
```

### 7.2 Reuse Over Creation

| Existing Component | Reuse For |
|---------------------|-----------|
| `AskGalileoCard` | ALL conversational Galileo interactions (replace `GalileoPanel` usage over time) |
| `GalileoCardInsight` | Card-level "why this matters" popovers |
| `WhyButton` | Metric-level "what / how / provenance / relevance" popovers |
| `EvidenceDrawer` | Field-level provenance (already comprehensive) |
| `NextBestAction` | BIE-driven recommendations (already the canonical source) |
| `ExecutiveBriefing` | Narrative walkthrough (already the canonical briefing) |

### 7.3 Decision Moment Entry Points

Galileo should appear as a **subtle entry point** at each Decision Moment — not as a persistent panel. The pattern:

- A small ✦ icon (existing `GalileoCardInsight` pattern) on cards/metrics/charts
- Clicking opens either:
  - A deterministic popover (for known explanations — reuse `GalileoCardInsight` / `WhyButton`)
  - The existing `AskGalileoCard` with a pre-seeded question (for complex questions requiring context)

**No new chat panels. No new AI interfaces.**

### 7.4 EIE as the Decision Router

The Executive Intelligence Engine (Phase 13.4C.1) is the decision layer. When a user clicks a Galileo entry point:

1. The entry point calls `AskGalileoCard` with context (valuationId, workspaceKey, sectionKey, pre-seeded question)
2. `askGalileo` backend assembles context and calls the LLM
3. The LLM response is grounded in canonical BIE data, valuation intelligence, and field evidence
4. The response renders in the existing `AskGalileoCard` message bubble

**The EIE does not need to be invoked for every entry point** — it is the decision layer for *autonomous* intelligence (Galileo Home, proactive recommendations). For *user-initiated* questions, the existing `askGalileo` flow is sufficient. The EIE becomes relevant when the platform decides to surface intelligence proactively (future phase).

### 7.5 Calm, Premium, Intentional

- Galileo entry points are **small and subtle** (existing ✦ icon pattern)
- Galileo **never auto-opens** — the user must click
- Galileo **never interrupts** — it observes and explains, it doesn't demand attention
- Galileo responses are **grounded in evidence** — every claim cites its source
- Galileo **admits uncertainty** — "I don't see [X] data yet" is a valid response

### 7.6 Golden Rule Enforcement

Before any Galileo interaction is implemented, it must pass ALL six checks:

1. ✅ Does this help the user make a better decision?
2. ✅ Does this reuse an existing experience?
3. ✅ Does this reduce complexity?
4. ✅ Would an experienced advisor naturally provide this guidance here?
5. ✅ Can the recommendation be explained with evidence?
6. ✅ Will the interface remain calm, elegant and premium?

If ANY answer is NO → do not implement. Refine.

---

## PHASE 8 — Stop Condition

| Requirement | Status |
|-------------|--------|
| Platform inventory complete | ✅ |
| Decision Moment Map complete | ✅ |
| Duplication review complete | ✅ |
| Intelligence enrichment map complete | ✅ |
| Readiness scores complete | ✅ |
| Implementation roadmap complete | ✅ |
| Architectural recommendations complete | ✅ |
| No implementations performed | ✅ |
| No UI redesigned | ✅ |
| No workflows modified | ✅ |
| No Galileo Home built | ✅ |
| No proactive AI built | ✅ |
| No new interfaces created | ✅ |
| No duplicate systems created | ✅ |

---

READY FOR GALILEO PLATFORM INTEGRATION REVIEW