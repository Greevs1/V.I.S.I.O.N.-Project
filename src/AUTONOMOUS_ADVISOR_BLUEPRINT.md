# Autonomous Advisor Blueprint — Phase 14.1

**Date:** 2026-08-07
**Status:** Blueprint Only — No Implementation
**Mission:** The advisor should review work instead of creating work.

---

## 0. Governing Principle

This phase does NOT create new modules.
It does NOT redesign the UI.
It does NOT create another AI workflow.
It does NOT replace advisors.

It connects all previously certified systems together so that:
- Every piece of information is entered ONCE.
- Every downstream system updates AUTOMATICALLY.
- Galileo becomes the orchestration layer between all existing systems.
- Never duplicate calculations, storage, or extraction.
- Reuse every certified engine already built.

---

## PART 1 — THE AUTONOMOUS ADVISOR PIPELINE

### 1.1 Complete Flow Map

```
Document Upload
    ↓
Extraction (runDocumentExtraction)
    ↓
Confidence (confidenceEngine)
    ↓
Verification Queue (verificationQueueService)
    ↓
Assessment Population (getMetricAutoPopulate + assessmentPrefillMap)
    ↓
Business Intelligence (biePersistence + BIE engine)
    ↓
Valuation (valuationCalculationEngine)
    ↓
Build Value (buildValueEngine + intelligenceEngine)
    ↓
Growth Plan (growthPlanEngine)
    ↓
Reports (deliverablesEngine)
    ↓
Executive Brief (executiveNarrativeEngine)
    ↓
Meeting Preparation (generateAdvisorCommandCenter)
    ↓
Advisor Review (verificationQueueService + fieldGovernanceService)
    ↓
Publication (valuationService.publishValuation)
```

### 1.2 Stage-by-Stage Audit

#### Stage 1: Document Upload

| Dimension | Current State |
|-----------|--------------|
| **Input** | File (PDF, image, spreadsheet) from owner or advisor |
| **Output** | `documents` row + `document_analysis` row (status: queued) |
| **Dependencies** | Supabase Storage, `uploadDocumentToSupabase`, `createDocumentAnalysis` |
| **Existing Service** | `uploadDocumentToSupabase`, `uploadDocumentDirect`, `googleDriveImport`, `adminUploadDocument` |
| **Missing Connection** | Upload does not auto-trigger extraction. Advisor must manually click "Extract." |
| **Automation Opportunity** | **AUTO-EXTRACT ON UPLOAD** — `createDocumentAnalysis` should enqueue `runDocumentExtraction` automatically. No manual trigger. |

#### Stage 2: Extraction

| Dimension | Current State |
|-----------|--------------|
| **Input** | `document_analysis.id` (status: queued) |
| **Output** | `extracted_fields` rows (field_name, field_value, normalized_value, confidence_score, review_status: pending_review) |
| **Dependencies** | `runDocumentExtraction` (currently uses MOCK_EXTRACTIONS — needs real LLM extraction) |
| **Existing Service** | `runDocumentExtraction`, `EXTRACTION_SCHEMAS` (6 document types: P&L, balance sheet, business tax, personal tax, debt schedule, payroll) |
| **Missing Connection** | Extraction completes → no auto-trigger to confidence recalculation or assessment prefill. |
| **Automation Opportunity** | **AUTO-PROPAGATE ON EXTRACTION** — When extraction completes, auto-trigger: (a) `confidenceEngine` recalculation, (b) `getMetricAutoPopulate` cache invalidation, (c) `intelligenceEngine` rebuild for affected business. |

#### Stage 3: Confidence

| Dimension | Current State |
|-----------|--------------|
| **Input** | profile_id, business_id, metrics list |
| **Output** | Per-metric confidence scores (0-100), confidence tiers, evidence arrays, missing evidence, overall confidence |
| **Dependencies** | `confidenceEngine` (reads assessments, documents, extracted_fields, value_creation_events) |
| **Existing Service** | `confidenceEngine` — fully deterministic, 5-tier system (assessment_only → verified_financial_analysis) |
| **Missing Connection** | Confidence is calculated on-demand, not persisted. No staleness trigger when source data changes. |
| **Automation Opportunity** | **AUTO-RECALCULATE CONFIDENCE** — When any source data changes (new document, new extraction, new assessment, new verification), auto-recalculate confidence for affected metrics. Persist to `valuation_calculations` (confidence type). |

#### Stage 4: Verification Queue

| Dimension | Current State |
|-----------|--------------|
| **Input** | valuation_id |
| **Output** | Unified queue: conflicts, low-confidence fields, missing critical fields, proposed add-backs, advisor judgments, client confirmations, publication blockers |
| **Dependencies** | `verificationQueueService` (reuses `intelligenceEngine`, `verificationQueueEngine`, `stalenessMap`) |
| **Existing Service** | `verificationQueueService` — 11 actions, full write-through to `valuation_answers` / `valuation_adjustments`, staleness propagation |
| **Missing Connection** | Queue is pulled on-demand. No push notification when new items appear. |
| **Automation Opportunity** | **AUTO-POPULATE QUEUE** — When `intelligenceEngine` detects a new conflict or low-confidence field, auto-add to queue + notify assigned advisor. The advisor reviews instead of discovering. |

#### Stage 5: Assessment Population

| Dimension | Current State |
|-----------|--------------|
| **Input** | profile_id, business_id |
| **Output** | Pre-filled assessment fields (revenue, EBITDA, AGI, monthly take-home, net profit) with source attribution |
| **Dependencies** | `getMetricAutoPopulate` (4-priority chain: extracted_fields → profile_financials → business_assessments → dashboard_metrics), `assessmentPrefillMap` (26+ field mappings across 6 assessments) |
| **Existing Service** | `getMetricAutoPopulate`, `assessmentPrefillMap`, `useAssessmentPrefill` hook |
| **Missing Connection** | Prefill is suggestion-only. No "AI Suggested" state marker. No auto-routing to Verify when confidence is low. |
| **Automation Opportunity** | **AUTO-POPULATE WITH STATE** — Prefill values carry a state: `verified` (advisor-approved), `suggested` (high confidence AI), `needs_review` (low confidence AI), `missing`. The advisor reviews states, not data entry. |

#### Stage 6: Business Intelligence (BIE/BIS)

| Dimension | Current State |
|-----------|--------------|
| **Input** | Assessment results, document extractions, sprint outcomes |
| **Output** | BIS snapshots, BIE journal entries, canonical recommendations, IQ score, business impact score |
| **Dependencies** | `biePersistence` (snapshots + journal), `src/lib/bie/engine.js`, `src/lib/bie/health.js` |
| **Existing Service** | `biePersistence` (saveSnapshot, saveJournalEntry, getSnapshots, getJournal), `generateNextBestActions`, `generateOpportunities` |
| **Missing Connection** | BIS rebuild is triggered manually or on assessment save. No auto-rebuild when extraction is approved. |
| **Automation Opportunity** | **AUTO-REBUILD BIS** — When an extracted field is approved (review_status → accepted), auto-trigger BIS rebuild + BIE journal entry. The intelligence always reflects the latest approved data. |

#### Stage 7: Valuation

| Dimension | Current State |
|-----------|--------------|
| **Input** | valuation_id, valuation_answers, valuation_adjustments, valuation_financials |
| **Output** | Calculated Enterprise Value, Equity Value, methodology results, confidence scores |
| **Dependencies** | `valuationCalculationEngine` (25+ actions: normalized earnings, multiple, DCF, cap earnings, asset, reconciliation, equity bridge, confidence, scenarios, value drivers, advisor conclusion) |
| **Existing Service** | `valuationCalculationEngine`, `valuationService` (17 actions), `stalenessMap` (dependency propagation) |
| **Missing Connection** | Calculations are triggered manually. Staleness is marked but not auto-recalculated. |
| **Automation Opportunity** | **AUTO-RECALCULATE ON STALENESS** — When `stalenessMap` marks a calculation stale, auto-trigger recalculation if all inputs are verified. If inputs are unverified, route to Verification Queue instead. |

#### Stage 8: Build Value

| Dimension | Current State |
|-----------|--------------|
| **Input** | valuation_id, intelligence (candidates, conflicts, documents, assessments) |
| **Output** | 6-dimension scorecards (financial, growth, commercial, operational, leadership, risk), value drivers, detractors, fastest wins, constraints |
| **Dependencies** | `buildValueEngine`, `intelligenceEngine`, `insightsEngine` |
| **Existing Service** | `buildValueEngine` (dimension scoring), `insightsEngine` (executive insights), `BuildValueWorkspace` UI |
| **Missing Connection** | Build Value is recalculated on-demand. No auto-update when intelligence changes. |
| **Automation Opportunity** | **AUTO-UPDATE BUILD VALUE** — When `intelligenceEngine` rebuilds (new approved field), auto-refresh Build Value dimensions. The scorecard always reflects the latest intelligence. |

#### Stage 9: Growth Plan

| Dimension | Current State |
|-----------|--------------|
| **Input** | valuation_id, value drivers, detractors, build value dimensions |
| **Output** | Candidate initiatives (name, problem, relevance, impacts, cost, ROI, timeline, difficulty, confidence, dependencies, KPI, baseline, target, verification, readiness) |
| **Dependencies** | `growthPlanEngine`, `insightsEngine` |
| **Existing Service** | `growthPlanEngine` (candidate generation, chain of custody, progress), `GrowthPlanWorkspace` UI |
| **Missing Connection** | Initiatives are generated from valuation findings but don't auto-update when valuation changes. |
| **Automation Opportunity** | **AUTO-REFRESH GROWTH PLAN** — When valuation version changes (new publish), auto-regenerate candidate initiatives. Existing approved initiatives are preserved; new candidates are added as "candidate" status. |

#### Stage 10: Reports

| Dimension | Current State |
|-----------|--------------|
| **Input** | valuation_id, versions, readiness, intelligence |
| **Output** | Deliverables grouped by audience (Client, Advisor, Transaction), with status, staleness, sharing, missing sections |
| **Dependencies** | `deliverablesEngine`, `valuationService` (versions, sharing) |
| **Existing Service** | `deliverablesEngine` (buildDeliverables, groupByAudience, computeDeliverablesProgress), `DeliverablesWorkspace` UI |
| **Missing Connection** | Reports become stale when valuation changes but don't auto-flag. |
| **Automation Opportunity** | **AUTO-FLAG STALE REPORTS** — When valuation version changes, auto-mark affected reports stale. (Already partially implemented via `stalenessMap` — extend to deliverables.) |

#### Stage 11: Executive Brief

| Dimension | Current State |
|-----------|--------------|
| **Input** | BIS, impact result, assessment summary |
| **Output** | 8-section narrative per chapter (What you're seeing, Why it matters, What we found, Opportunity, Next move, Potential upside, Evidence strength, Executive insight) |
| **Dependencies** | `executiveNarrativeEngine`, `executiveBriefingCopy`, BIS |
| **Existing Service** | `executiveNarrativeEngine` (deterministic), `ExecutiveBriefing` UI |
| **Missing Connection** | Brief is generated on-demand. No auto-regeneration when BIS changes. |
| **Automation Opportunity** | **AUTO-REGENERATE BRIEF** — When BIS snapshot version increments, auto-regenerate the brief narrative. The brief always reflects the latest intelligence. |

#### Stage 12: Meeting Preparation

| Dimension | Current State |
|-----------|--------------|
| **Input** | advisor_profile_id or admin role |
| **Output** | Per-client summaries (sprint status, metrics, opportunities, document requests, assessments) |
| **Dependencies** | `generateAdvisorCommandCenter` (reads WeeklyDigest, DashboardMetrics, galileo_opportunities, NinetyDaySprint, SprintTask, Assessment, DocumentRequest) |
| **Existing Service** | `generateAdvisorCommandCenter` — fully functional, re-packages stored data |
| **Missing Connection** | Meeting prep is manual. No "prepare tomorrow's meeting" automation. |
| **Automation Opportunity** | **AUTO-PREPARE MEETING** — When a booking is created (UserBooking), auto-generate meeting context from the latest command center data. Advisor walks in prepared. |

#### Stage 13: Advisor Review

| Dimension | Current State |
|-----------|--------------|
| **Input** | Verification queue items, field governance records, change requests |
| **Output** | Approved/rejected/modified values, audit trail, staleness propagation |
| **Dependencies** | `verificationQueueService`, `fieldGovernanceService`, `ValuationFieldGovernance` entity, `ValuationChangeRequest` entity |
| **Existing Service** | Full field-level governance: owner, lock state, source of truth, confidence, AI recommendation status, change history, change requests |
| **Missing Connection** | Review is reactive. No proactive "here's what changed since you last looked" summary. |
| **Automation Opportunity** | **AUTO-SUMMARIZE CHANGES** — When advisor opens a valuation, auto-generate "Since your last review: 3 fields auto-populated, 2 conflicts resolved, 1 calculation recalculated." The advisor reviews the delta, not the whole file. |

#### Stage 14: Publication

| Dimension | Current State |
|-----------|--------------|
| **Input** | valuation_id (status: needs_review → advisor_approved → published) |
| **Output** | Published snapshot, client-safe summary, shared deliverables |
| **Dependencies** | `valuationService.publishValuation` (server-side snapshot construction), `shareValuation`, `revokeClientAccess` |
| **Existing Service** | Full publication workflow with snapshot, versioning, client-safe filtering |
| **Missing Connection** | Publication is manual. No "ready to publish" auto-detection. |
| **Automation Opportunity** | **AUTO-DETECT PUBLISH READINESS** — When all publication blockers are resolved, auto-notify advisor "Ready to publish." One click to publish. |

---

## PART 2 — AUTO POPULATION

### 2.1 Advisor Input Audit

Every field an advisor currently enters manually, audited for auto-population potential.

| Field | Can Galileo Populate? | Can Documents Populate? | Can Assessments Populate? | Can BI Populate? | Can Valuation Populate? | Can Growth Plan Populate? | Action |
|------|----------------------|------------------------|--------------------------|------------------|------------------------|--------------------------|--------|
| **Revenue** | No | ✅ P&L, tax return | ✅ Profit Gap | ✅ BIS | ✅ valuation_answers | No | **Prefill from extracted_fields** → if confidence ≥85, mark `AI Suggested`; if <65, send to Verify |
| **EBITDA** | No | ✅ P&L (derived) | ✅ Value Gap, Recast | ✅ BIS | ✅ valuation_answers | No | **Prefill from derived net_profit** → mark `AI Suggested` |
| **Owner Compensation** | No | ✅ P&L, tax return, payroll | ✅ Recast EBITDA | ✅ BIS | ✅ valuation_adjustments (add-back) | No | **Prefill from extracted_fields** → mark `AI Suggested`, route to Verify for add-back approval |
| **Net Profit** | No | ✅ P&L | ✅ Profit Gap | ✅ BIS | ✅ valuation_answers | No | **Prefill from extracted_fields** → mark `AI Suggested` |
| **Total Assets** | No | ✅ Balance sheet | No | No | ✅ valuation_answers | No | **Prefill from extracted_fields** → mark `AI Suggested` |
| **Total Liabilities** | No | ✅ Balance sheet | No | No | ✅ valuation_answers | No | **Prefill from extracted_fields** → mark `AI Suggested` |
| **Total Debt** | No | ✅ Balance sheet, debt schedule | No | No | ✅ valuation_answers (equity bridge) | No | **Prefill from extracted_fields** → mark `AI Suggested` |
| **AGI** | No | ✅ Personal tax return | ✅ Tax Gap | ✅ BIS | No | No | **Prefill from extracted_fields** → mark `AI Suggested` |
| **Monthly Take-Home** | No | ✅ Derived (net_profit/12) | ✅ Operations Gap | ✅ BIS | No | No | **Prefill from derived** → mark `AI Suggested` |
| **Employee Count** | No | ✅ Payroll report | ✅ Operations Gap | No | No | No | **Prefill from extracted_fields** → mark `AI Suggested` |
| **Industry** | No | No | ✅ All assessments | ✅ BIS | ✅ valuation_answers | No | **Prefill from BIS** → mark `Verified` (advisor confirmed at onboarding) |
| **Enterprise Value** | No | No | No | No | ✅ valuation_calculation | No | **Auto-calculate from valuation engine** → mark `Calculated` |
| **Equity Value** | No | No | No | No | ✅ valuation_calculation (equity bridge) | No | **Auto-calculate from equity bridge** → mark `Calculated` |
| **Risk Score** | No | No | ✅ Operations Gap | ✅ BIS | ✅ Build Value (risk_governance dimension) | No | **Auto-calculate from Build Value** → mark `Calculated` |
| **Growth Initiatives** | ✅ Galileo can draft | No | No | ✅ BIE recommendations | ✅ Value drivers | ✅ Growth Plan engine | **Auto-generate candidates** → mark `AI Suggested`, advisor approves |
| **IQ Score** | No | No | ✅ All assessments | ✅ BIS (composite) | No | No | **Auto-calculate from BIS** → mark `Calculated` |
| **Add-Backs** | ✅ Galileo can propose | ✅ P&L, tax return | ✅ Recast EBITDA | No | ✅ valuation_adjustments | No | **Auto-propose from extraction** → mark `AI Suggested`, route to Verify for approval |
| **Valuation Multiple** | No | No | No | ✅ BIE benchmarks | ✅ valuation_multiple_factors | No | **Prefill from benchmark library** → mark `AI Suggested`, advisor confirms |
| **Discount Rate** | No | No | No | No | ✅ DCF inputs | No | **Prefill from industry benchmark** → mark `AI Suggested` |
| **Confidence Score** | No | No | No | No | ✅ confidenceEngine | No | **Auto-calculate from confidenceEngine** → mark `Calculated` |

### 2.2 Auto-Population Rules

```
FOR every advisor input field:

  1. Can it be populated from an existing certified source?
     → YES: Prefill it.
     → NO: Leave blank (manual entry).

  2. What is the confidence of the prefill?
     → confidence ≥ 85: Mark as "AI Suggested" (auto-accepted, advisor can override)
     → confidence 65-84: Mark as "AI Suggested" (advisor should review)
     → confidence < 65: Send to Verification Queue (do NOT auto-populate)
     → conflicting sources: Send to Verification Queue

  3. Is there an advisor-approved value already?
     → YES: NEVER overwrite. Skip auto-population.
     → NO: Proceed with auto-population.

  4. After auto-population:
     → Log to BIE journal (trigger: auto_populate)
     → Recalculate confidence for affected metrics
     → Propagate staleness to dependent calculations
```

### 2.3 The `decidePrefill` Function (Already Exists)

The `intelligenceEngine.ts` already exports `decidePrefill()` — a pure function that determines whether a field should be:
- Auto-populated (high confidence, no conflict)
- Sent to Verify (low confidence or conflict)
- Left missing (no source)

**This function is the heart of Auto-Population. It already exists. It needs to be wired into the pipeline.**

---

## PART 3 — ADVISOR REVIEW MODE

### 3.1 The Four States

Every AI-generated value has exactly one of four states:

| State | Visual Indicator | Meaning | Advisor Action |
|-------|-----------------|---------|----------------|
| **Verified** | ✅ Green | Advisor has approved this value | None — locked |
| **Suggested** | ✦ Gold | AI populated with high confidence (≥85) | Review → click to verify or override |
| **Needs Review** | ⚠ Amber | AI populated with medium confidence (65-84) or conflict | Must review before publication |
| **Missing** | — Gray | No source available | Must provide manually or request from client |

### 3.2 State Transitions

```
                    ┌─────────────┐
                    │   Missing   │
                    └──────┬──────┘
                           │ (source appears)
                           ▼
                    ┌─────────────┐
                    │ Needs Review│ ←──── low confidence / conflict
                    └──────┬──────┘
                           │ (advisor reviews)
                           ▼
                    ┌─────────────┐
                    │  Suggested  │ ←──── high confidence
                    └──────┬──────┘
                           │ (advisor approves)
                           ▼
                    ┌─────────────┐
                    │  Verified   │ ←──── advisor-approved (locked)
                    └─────────────┘
```

### 3.3 The Advisor's New Role

The advisor no longer enters data. The advisor:

1. **Opens the Verification Queue** — sees only exceptions (conflicts, low-confidence, missing critical)
2. **Reviews each item** — sees the AI suggestion, source, confidence, evidence
3. **Approves, modifies, or rejects** — one click per item
4. **Approves the valuation** — once all blockers resolved
5. **Publishes** — one click

**Time spent: reviewing, not entering.**

---

## PART 4 — ONE SOURCE OF TRUTH

### 4.1 Duplicated Value Audit

| Value | Primary Source | Dependent Systems | Propagation Rule | Current Duplication |
|-------|---------------|-------------------|------------------|-------------------|
| **Revenue** | `extracted_fields` (from P&L/tax) → `valuation_answers` | BIS, assessments, dashboard_metrics, profile_financials | Extraction approved → write to valuation_answers → BIS rebuild → dashboard_metrics update | **DUPLICATED** across 4 tables |
| **EBITDA** | Derived from `net_profit` + add-backs → `valuation_answers` | BIS, Value Gap assessment, Recast EBITDA assessment, dashboard_metrics | Calculation approved → BIS rebuild → assessment prefill | **DUPLICATED** across 4 tables |
| **Owner Compensation** | `extracted_fields` (from P&L/payroll) → `valuation_adjustments` (add-back) | Recast EBITDA, BIS, profile_financials | Extraction approved → write to valuation_adjustments → BIS rebuild | **DUPLICATED** across 3 tables |
| **Debt** | `extracted_fields` (from balance sheet/debt schedule) → `valuation_answers` | Equity bridge, BIS | Extraction approved → write to valuation_answers → equity bridge recalculation | **DUPLICATED** across 2 tables |
| **Enterprise Value** | `valuation_calculations` (reconciliation result) | BIS, dashboard_metrics, reports | Calculation complete → BIS rebuild → report staleness flag | **DUPLICATED** across 3 tables |
| **Equity Value** | `valuation_calculations` (equity bridge) | BIS, reports | Calculation complete → BIS rebuild → report staleness flag | **DUPLICATED** across 2 tables |
| **Risk Score** | `buildValueEngine` (risk_governance dimension) | BIS, Operations Gap assessment | Dimension calculated → BIS rebuild | **DUPLICATED** across 2 tables |
| **Growth Initiatives** | `growthPlanEngine` (candidate initiatives) | Sprint recommendations, BIE | Initiative approved → BIE recommendation → sprint task generation | **DUPLICATED** across 2 systems |
| **IQ Score** | BIS composite (from BIE engine) | Dashboard, dashboard_metrics | BIS rebuild → dashboard_metrics update | **DUPLICATED** across 2 tables |
| **Confidence Score** | `confidenceEngine` | Valuation, BIS, dashboard | Source data change → confidence recalculation → staleness propagation | **DUPLICATED** across 3 tables |

### 4.2 Propagation Rules (To Eliminate Duplication)

**Principle:** Write ONCE to the primary source. All dependent systems READ from the primary source or are updated via propagation.

```
PRIMARY SOURCE (single write)
       │
       ├──→ valuation_answers (advisor-approved values)
       ├──→ valuation_adjustments (add-backs)
       ├──→ valuation_calculations (calculated values)
       └──→ valuation_conclusions (advisor conclusions)
              │
              ▼
       STALENESS MAP (dependency graph)
              │
              ▼
       AFFECTED CALCULATIONS marked stale
              │
              ▼
       AUTO-RECALCULATE (if inputs verified)
       OR
       ROUTE TO VERIFY (if inputs unverified)
              │
              ▼
       BIS REBUILD (journal entry + snapshot)
              │
              ▼
       DASHBOARD METRICS UPDATE (read from BIS)
              │
              ▼
       REPORT STALENESS FLAG
```

**No dependent system stores its own copy. All read from the primary source or receive propagated updates.**

### 4.3 Migration Path (Additive, Not Breaking)

- **Phase A:** Identify all duplicate writes. Add propagation triggers.
- **Phase B:** Migrate dependent systems to READ from primary source.
- **Phase C:** Remove duplicate writes (after verification).

**Never break existing reads. Always add propagation before removing duplication.**

---

## PART 5 — MAGIC MOMENTS

### 5.1 Highest Delight Opportunities

These are NOT new features. They are **orchestration outcomes** — Galileo reporting what the certified engines already did.

| # | Magic Moment | Trigger | Underlying Engine | Advisor Delight |
|---|-------------|---------|-------------------|-----------------|
| MM1 | "I filled 84 valuation fields." | Extraction complete + intelligenceEngine decidePrefill | `runDocumentExtraction` + `intelligenceEngine` | **High** — advisor sees 84 fields they didn't have to enter |
| MM2 | "I found three add-backs." | Extraction complete + add-back rules | `runDocumentExtraction` + `ADD_BACK_RULES` | **High** — immediate dollar value |
| MM3 | "I drafted your executive summary." | Valuation published + narrative engine | `executiveNarrativeEngine` | **High** — saves 30 minutes per report |
| MM4 | "I updated the Growth Plan." | Valuation version change + growth plan engine | `growthPlanEngine` | **Medium** — keeps plan current |
| MM5 | "I recalculated Enterprise Value." | Stale calculation + auto-recalculation | `valuationCalculationEngine` + `stalenessMap` | **High** — always current number |
| MM6 | "I prepared tomorrow's meeting." | Booking created + command center | `generateAdvisorCommandCenter` | **High** — advisor walks in ready |
| MM7 | "I found two missing documents." | Confidence engine + missing evidence | `confidenceEngine` | **Medium** — proactive gap detection |
| MM8 | "I resolved 5 conflicts automatically." | Intelligence engine + conflict resolution | `intelligenceEngine` | **Medium** — only real conflicts surface |
| MM9 | "I updated your confidence score to 87." | Confidence recalculation | `confidenceEngine` | **Medium** — trust signal |
| MM10 | "I published the valuation." | All blockers resolved + auto-publish | `valuationService.publishValuation` | **High** — one-click finish |

### 5.2 Magic Moment Delivery Mechanism

Magic Moments are **notifications** — they use the existing `Notification` entity and `notificationService`.

```
Engine completes action
       │
       ▼
Create Notification (type: galileo_update, category: success)
       │
       ▼
Advisor sees notification in NotificationBell
       │
       ▼
Click → navigate to affected workspace
```

**No new UI. No new panel. Just notifications.**

---

## PART 6 — ADVISOR TIME SAVINGS

### 6.1 Effort Estimation

| Task | Current Manual Time | Automated Time | Advisor Review Time | Estimated Savings |
|------|--------------------|----------------|--------------------|--------------------|
| Upload & extract 5 documents | 15 min (manual review) | 2 min (auto-extract) | 5 min (review fields) | **8 min saved** |
| Enter 84 valuation fields | 90 min (manual entry) | 5 min (auto-populate) | 15 min (review states) | **70 min saved** |
| Identify add-backs | 20 min (manual scan) | 1 min (auto-detect) | 5 min (approve/reject) | **14 min saved** |
| Resolve conflicts | 15 min (find + decide) | 1 min (auto-surface) | 5 min (review) | **9 min saved** |
| Calculate Enterprise Value | 10 min (manual calc) | 1 min (auto-calc) | 2 min (review) | **7 min saved** |
| Calculate Equity Value | 10 min (manual calc) | 1 min (auto-calc) | 2 min (review) | **7 min saved** |
| Build Growth Plan | 45 min (manual draft) | 5 min (auto-generate) | 10 min (review/modify) | **30 min saved** |
| Draft Executive Summary | 30 min (manual write) | 2 min (auto-generate) | 5 min (review/edit) | **23 min saved** |
| Prepare meeting context | 20 min (gather data) | 1 min (auto-generate) | 3 min (review) | **16 min saved** |
| Publish valuation | 5 min (manual checks) | 1 min (auto-detect ready) | 1 min (click publish) | **3 min saved** |
| **TOTAL per valuation** | **~260 min** | **~20 min** | **~53 min** | **~187 min saved (72%)** |

### 6.2 Surfacing Time Savings

Time savings are surfaced internally (advisor-facing, not client-facing):

- **Per valuation:** "This valuation took 53 minutes of advisor time. Estimated manual time: 260 minutes. You saved 3 hours."
- **Per week:** "This week you saved 12 hours through autonomous advisor automation."
- **Per month:** "This month you saved 48 hours — equivalent to 6 business days."

**Mechanism:** Log to BIE journal (trigger: autonomous_advisor_savings). Surface in `AdvisorCommandCenter`.

---

## PART 7 — INTELLIGENCE CONFIDENCE

### 7.1 Every AI-Populated Field Displays

| Attribute | Source | Already Available? |
|-----------|--------|-------------------|
| **Source** | `intelligenceEngine.candidate.source_name` | ✅ Yes |
| **Confidence** | `intelligenceEngine.candidate.confidence_score` (0-100) | ✅ Yes |
| **Evidence** | `intelligenceEngine.candidate.alternative_values` + `confidenceEngine.evidence` | ✅ Yes |
| **Reason** | `intelligenceEngine.candidate.recommended_action` | ✅ Yes |
| **Verification State** | `intelligenceEngine.candidate.verification_status` | ✅ Yes |
| **Advisor Override** | `ValuationFieldGovernance.current_owner_id` + `last_modified_by_id` | ✅ Yes |

### 7.2 No Hidden AI

**Rule:** Every AI-populated value must be traceable to its source, confidence, evidence, reason, verification state, and advisor override.

**Mechanism:** The existing `EvidenceDrawer` (Phase 13.3G) already displays all six attributes. Every AI-populated field links to the EvidenceDrawer via the `FieldEvidenceContext.openEvidence()` function.

**No new UI needed. The EvidenceDrawer is the single source of truth for field provenance.**

### 7.3 Confidence Display Patterns

| Confidence | Display | Color |
|-----------|---------|-------|
| Verified (advisor-approved) | ✅ Verified | Green |
| High (≥85) | ✦ AI Suggested | Gold |
| Medium (65-84) | ⚠ Needs Review | Amber |
| Low (<65) | ⚠ Needs Review | Amber |
| Missing | — Missing | Gray |
| Conflicting | ⚠ Conflict | Red |

---

## PART 8 — IMPLEMENTATION ROADMAP

### 8.1 Prioritization Criteria

Each automation is scored on:

| Criterion | Weight |
|-----------|--------|
| Advisor hours saved | 30% |
| Business owner delight | 20% |
| Reuse score (uses existing engines) | 20% |
| Architectural fit (additive, non-breaking) | 15% |
| Implementation complexity (low = better) | 10% |
| Business impact (valuation quality, speed) | 5% |

### 8.2 Scored Automations

| # | Automation | Advisor Hours Saved | Owner Delight | Reuse Score | Arch Fit | Complexity | Business Impact | **Total Score** | Priority |
|---|-----------|--------------------|---------------|-------------|----------|------------|-----------------|----------------|----------|
| A1 | **Auto-extract on upload** | Medium | High | High (reuses runDocumentExtraction) | High (additive trigger) | Low | High | **8.5** | P0 |
| A2 | **Auto-populate valuation fields** | High (70 min/valuation) | High | High (reuses intelligenceEngine.decidePrefill) | High (additive) | Medium | High | **8.7** | P0 |
| A3 | **Auto-route low-confidence to Verify** | Medium | Medium | High (reuses verificationQueueService) | High (additive) | Low | High | **8.0** | P0 |
| A4 | **Auto-recalculate on staleness** | Medium | Medium | High (reuses stalenessMap + valuationCalculationEngine) | High (additive) | Medium | High | **7.8** | P0 |
| A5 | **Auto-rebuild BIS on approval** | Medium | Medium | High (reuses biePersistence) | High (additive) | Low | High | **7.8** | P0 |
| A6 | **Magic Moment notifications** | Low | High | High (reuses notificationService) | High (additive) | Low | Medium | **7.0** | P1 |
| A7 | **Auto-generate Growth Plan candidates** | Medium (30 min) | Medium | High (reuses growthPlanEngine) | High (additive) | Medium | Medium | **7.3** | P1 |
| A8 | **Auto-detect publish readiness** | Low | Medium | High (reuses verificationQueueService blockers) | High (additive) | Low | Medium | **6.8** | P1 |
| A9 | **Auto-prepare meeting context** | Medium (16 min) | High | High (reuses generateAdvisorCommandCenter) | High (additive) | Medium | Medium | **7.5** | P1 |
| A10 | **Auto-summarize changes on open** | Medium | High | Medium (new summary logic) | High (additive) | Medium | Medium | **6.5** | P2 |
| A11 | **Auto-flag stale reports** | Low | Medium | High (reuses stalenessMap) | High (additive) | Low | Medium | **6.3** | P2 |
| A12 | **Track & surface time savings** | Low | Low | Medium (new journal logging) | High (additive) | Low | Low | **5.5** | P2 |
| A13 | **Eliminate duplicate storage** | Low | Low | Medium (migration) | Medium (breaking) | High | Medium | **5.0** | P3 |

### 8.3 Implementation Order

```
P0 (Quick Wins — Highest ROI, Lowest Effort)
  ├── A1: Auto-extract on upload
  ├── A2: Auto-populate valuation fields
  ├── A3: Auto-route low-confidence to Verify
  ├── A4: Auto-recalculate on staleness
  └── A5: Auto-rebuild BIS on approval

P1 (High ROI — Medium Effort)
  ├── A6: Magic Moment notifications
  ├── A7: Auto-generate Growth Plan candidates
  ├── A8: Auto-detect publish readiness
  └── A9: Auto-prepare meeting context

P2 (Strategic — Medium Effort)
  ├── A10: Auto-summarize changes on open
  ├── A11: Auto-flag stale reports
  └── A12: Track & surface time savings

P3 (Long-Term — Higher Effort, Breaking)
  └── A13: Eliminate duplicate storage
```

### 8.4 Dependency Graph

```
A1 (Auto-extract) ──→ A2 (Auto-populate) ──→ A3 (Auto-route to Verify)
                                              │
                                              ▼
                                        A4 (Auto-recalculate)
                                              │
                                              ▼
                                        A5 (Auto-rebuild BIS)
                                              │
                                              ▼
                                        A6 (Magic Moments) ──→ A9 (Meeting Prep)
                                              │
                                              ▼
                                        A7 (Growth Plan) ──→ A8 (Publish Readiness)
                                              │
                                              ▼
                                        A10 (Change Summary) ──→ A11 (Stale Reports)
                                              │
                                              ▼
                                        A12 (Time Tracking)
                                              │
                                              ▼
                                        A13 (Dedup Migration)
```

---

## PART 9 — REPORT SUMMARY

### 9.1 Current Workflow (Manual, Disconnected)

```
Advisor uploads document (manual)
    ↓ (manual trigger)
Extraction runs
    ↓ (no auto-propagation)
Advisor manually reviews extracted fields
    ↓ (manual entry)
Advisor enters valuation fields (90 min)
    ↓ (manual trigger)
Confidence calculated (on-demand)
    ↓ (no auto-propagation)
Advisor manually finds conflicts
    ↓ (manual resolution)
Advisor manually calculates Enterprise Value
    ↓ (manual trigger)
Advisor manually builds Growth Plan (45 min)
    ↓ (manual draft)
Advisor manually writes Executive Summary (30 min)
    ↓ (manual gather)
Advisor manually prepares meeting (20 min)
    ↓ (manual check)
Advisor manually checks publish readiness
    ↓ (manual publish)
Publication

TOTAL: ~260 min of advisor time per valuation
```

### 9.2 Future Workflow (Autonomous, Connected)

```
Advisor OR owner uploads document
    ↓ (AUTO — A1)
Extraction runs automatically
    ↓ (AUTO — A2)
84 valuation fields auto-populated (5 min)
    ↓ (AUTO — A3)
Low-confidence fields auto-routed to Verify
    ↓ (AUTO — A4)
Calculations auto-recalculate when inputs verified
    ↓ (AUTO — A5)
BIS auto-rebuilds with journal entry
    ↓ (AUTO — A6)
Magic Moment: "I filled 84 fields, found 3 add-backs"
    ↓ (advisor reviews states, not data — 15 min)
Advisor approves/modifies/rejects in Verification Queue
    ↓ (AUTO — A7)
Growth Plan candidates auto-generated
    ↓ (AUTO — A8)
Publish readiness auto-detected
    ↓ (advisor clicks publish — 1 min)
Publication
    ↓ (AUTO — A9)
Meeting context auto-prepared for next booking
    ↓ (AUTO — A10)
Change summary auto-generated for next open
    ↓ (AUTO — A12)
Time savings logged: "You saved 3 hours"

TOTAL: ~53 min of advisor time per valuation (72% reduction)
```

### 9.3 Automation Map

| Stage | Automation | Existing Engine Reused | New Code Needed |
|-------|-----------|----------------------|-----------------|
| Upload → Extract | Auto-extract on upload | `runDocumentExtraction` | Trigger wiring only |
| Extract → Confidence | Auto-recalculate confidence | `confidenceEngine` | Trigger wiring only |
| Extract → Valuation | Auto-populate fields | `intelligenceEngine.decidePrefill` | Trigger + state marking |
| Valuation → Verify | Auto-route low-confidence | `verificationQueueService` | Trigger wiring only |
| Verify → Calculate | Auto-recalculate on staleness | `stalenessMap` + `valuationCalculationEngine` | Trigger wiring only |
| Calculate → BIS | Auto-rebuild BIS | `biePersistence` | Trigger wiring only |
| BIS → Brief | Auto-regenerate brief | `executiveNarrativeEngine` | Trigger wiring only |
| BIS → Growth Plan | Auto-generate candidates | `growthPlanEngine` | Trigger wiring only |
| Growth Plan → Reports | Auto-flag stale reports | `deliverablesEngine` + `stalenessMap` | Trigger wiring only |
| Reports → Meeting | Auto-prepare meeting | `generateAdvisorCommandCenter` | Trigger wiring only |
| All → Notifications | Magic Moments | `notificationService` | Notification creation only |

**Key insight: 90% of the work is trigger wiring. The engines already exist.**

### 9.4 Reuse Opportunities

| Existing Engine | Reused For | Avoids Building |
|----------------|-----------|-----------------|
| `runDocumentExtraction` | Auto-extraction | New extraction service |
| `intelligenceEngine.decidePrefill` | Auto-population decisions | New prefill logic |
| `confidenceEngine` | Confidence scoring | New confidence system |
| `verificationQueueService` | Exception surfacing | New queue system |
| `stalenessMap` | Dependency propagation | New dependency graph |
| `valuationCalculationEngine` | Auto-recalculation | New calculation engine |
| `biePersistence` | BIS snapshots + journal | New persistence layer |
| `executiveNarrativeEngine` | Brief generation | New narrative engine |
| `growthPlanEngine` | Initiative generation | New growth plan engine |
| `deliverablesEngine` | Report staleness | New deliverables system |
| `generateAdvisorCommandCenter` | Meeting prep | New meeting prep |
| `notificationService` | Magic Moments | New notification system |
| `fieldGovernanceService` | Field provenance | New governance layer |
| `EvidenceDrawer` | Confidence display | New provenance UI |

**Reuse score: 14/14 engines reused. 0 new engines.**

### 9.5 Implementation Order (Final)

```
PHASE 14.1A — Trigger Wiring (P0, 1-2 weeks)
  A1: Auto-extract on upload
  A2: Auto-populate valuation fields (wire decidePrefill)
  A3: Auto-route low-confidence to Verify
  A4: Auto-recalculate on staleness
  A5: Auto-rebuild BIS on approval

PHASE 14.1B — Delight Layer (P1, 1 week)
  A6: Magic Moment notifications
  A7: Auto-generate Growth Plan candidates
  A8: Auto-detect publish readiness
  A9: Auto-prepare meeting context

PHASE 14.1C — Polish Layer (P2, 1 week)
  A10: Auto-summarize changes on open
  A11: Auto-flag stale reports
  A12: Track & surface time savings

PHASE 14.1D — Dedup Migration (P3, 2-3 weeks)
  A13: Eliminate duplicate storage (additive migration)
```

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Complete pipeline mapped | ✅ |
| Every stage audited (Input, Output, Dependencies, Existing Service, Missing Connection, Automation Opportunity) | ✅ |
| Auto-population audit complete | ✅ |
| Four advisor review states defined | ✅ |
| One source of truth audit complete | ✅ |
| Magic moments identified | ✅ |
| Time savings estimated | ✅ |
| Intelligence confidence attributes defined | ✅ |
| Implementation roadmap prioritized | ✅ |
| No automations implemented | ✅ |
| No UI redesigned | ✅ |
| No new modules created | ✅ |
| No new AI workflows created | ✅ |
| All existing engines reused | ✅ |
| Report created | ✅ |

---

## READY FOR AUTONOMOUS ADVISOR REVIEW