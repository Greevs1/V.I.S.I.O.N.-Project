# V.I.S.I.O.N. Engine Registry™

**The Certified Engine Inventory for the V.I.S.I.O.N. Platform™**

**Date:** 2026-08-10
**Status:** FROZEN
**Authority:** Companion to the V.I.S.I.O.N. Constitution

---

## Purpose

This registry inventories every certified engine in V.I.S.I.O.N. For each engine, it declares the owner, responsibilities, interfaces, consumers, inputs, outputs, replaceability, kernel status, and experimental status.

No engine may operate outside this registry. No new engine may be created for a concept an existing engine already owns (Article III — No Duplicate Intelligence).

---

## Engine Registry

### 1. Canonical Fact Resolver

| Field | Value |
|-------|-------|
| **Owner** | Canonical Layer |
| **Responsibilities** | Resolve canonical fact values via 8-level source hierarchy; detect conflicts; calculate confidence |
| **Interfaces** | `resolveFact(businessId, factKey, options)`, `resolveFacts(businessId, factKeys[])` |
| **Consumers** | All consumers (Dashboard, Galileo, Executive Brief, Valuation, Growth Plan, Reports, Sprint) |
| **Inputs** | Supabase raw sources (extracted_fields, assessment answers, valuation_answers, profile_financials) |
| **Outputs** | Canonical fact values with source, confidence, verification status, lineage |
| **Replaceable?** | ❌ No — Kernel foundation |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 2. Business Intelligence Engine (BIE)

| Field | Value |
|-------|-------|
| **Owner** | BIE |
| **Responsibilities** | Build composite intelligence metrics (IQ Score, Business Impact Score); produce BusinessIntelligenceMetric objects; maintain intelligence graph; write snapshots and journal |
| **Interfaces** | `buildBusinessIntelligenceEngine(inputs, opts)`, `IntelligenceGraph.getDescendants/getAncestors` |
| **Consumers** | Dashboard, Executive Brief, Galileo, Sprint, BIE Persistence |
| **Inputs** | assessmentSummary, dashboardMetrics, latestSnapshot, canonicalFacts, assessmentsData, roadmapItems, guestSession |
| **Outputs** | BusinessIntelligenceMetric[], BIS projection, sprint-ready recommendations, changed metric IDs, snapshots, journal entries |
| **Replaceable?** | ❌ No — Kernel foundation |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 3. BIE Persistence

| Field | Value |
|-------|-------|
| **Owner** | BIE |
| **Responsibilities** | Persist BIE snapshots and journal entries; hydrate from backend |
| **Interfaces** | `saveSnapshot`, `appendJournalEntry`, `hydrateFromBackend` |
| **Consumers** | BIE, Dashboard, Executive Brief |
| **Inputs** | BIE output (snapshots, journal entries) |
| **Outputs** | Persisted snapshots, journal records |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 4. Valuation Calculation Engine

| Field | Value |
|-------|-------|
| **Owner** | Valuation |
| **Responsibilities** | Calculate enterprise value, equity value via multiple, DCF, cap earnings, asset approaches; reconcile methodologies; produce valuation versions |
| **Interfaces** | `calculate(inputs)`, stalenessMap integration |
| **Consumers** | Dashboard, BIS, Reports, Growth Plan, Executive Brief, Delta Engine |
| **Inputs** | normalized_ebitda, valuation_multiple, dcf_inputs, cap_earnings_inputs, asset_inputs, reconciliation_weights |
| **Outputs** | enterprise_value, equity_value, valuation_calculations, valuation_versions |
| **Replaceable?** | ❌ No — Kernel foundation |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 5. Confidence Engine

| Field | Value |
|-------|-------|
| **Owner** | Valuation |
| **Responsibilities** | Calculate confidence scores (5 categories: data, calculation, methodology, advisor, overall) for valuation outputs |
| **Interfaces** | `calculateConfidence(input)` |
| **Consumers** | Valuation, BIS, Dashboard, Reports |
| **Inputs** | Source data quality, extraction confidence, advisor approval status, methodology completeness |
| **Outputs** | Confidence scores (0-100 per category + overall) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 6. Intelligence Engine

| Field | Value |
|-------|-------|
| **Owner** | Valuation |
| **Responsibilities** | Build candidates from multiple sources; detect conflicts; decide prefill values; resolve source priority |
| **Interfaces** | `buildCandidate`, `detectConflicts`, `decidePrefill` |
| **Consumers** | Valuation, Verification Queue, Build Value, Evidence Drawer |
| **Inputs** | extracted_fields, assessment answers, valuation_answers, advisor overrides |
| **Outputs** | Candidates with source, confidence, conflict status, recommended value |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 7. Build Value Engine

| Field | Value |
|-------|-------|
| **Owner** | Valuation |
| **Responsibilities** | Calculate 6 business quality dimensions (financial, growth, commercial, operational, leadership transferability, risk governance) |
| **Interfaces** | `buildDimensionScores(intelligence)` |
| **Consumers** | Build Value Workspace, BIS, Dashboard |
| **Inputs** | Intelligence candidates, valuation answers, assessment results |
| **Outputs** | 6 dimension scores (0-100) with drivers, detractors, constraints |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 8. Growth Plan Engine

| Field | Value |
|-------|-------|
| **Owner** | Valuation |
| **Responsibilities** | Generate growth initiatives from enterprise value, normalized EBITDA, value drivers, and detractors |
| **Interfaces** | `generateInitiatives(inputs)` |
| **Consumers** | Growth Plan Workspace, Sprint, BIE |
| **Inputs** | enterprise_value, normalized_ebitda, value_drivers, detractors, build_value_dimensions |
| **Outputs** | Growth initiatives (candidate, approved, rejected) with estimated impact |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 9. Assessment Engine (Calculations)

| Field | Value |
|-------|-------|
| **Owner** | Assessment |
| **Responsibilities** | Calculate gap amounts and scores for all assessment types (profit, value, tax, operations, freedom, recast) |
| **Interfaces** | `calculateAssessment(type, answers, benchmarks)` |
| **Consumers** | BIE, Dashboard, Sprint, NBA Engine |
| **Inputs** | Assessment answers, benchmark library, industry data |
| **Outputs** | Gap amounts, scores, results objects |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 10. NBA (Next Best Action) Engine

| Field | Value |
|-------|-------|
| **Owner** | Execution |
| **Responsibilities** | Determine the next best action based on gaps, completion, and sprint state |
| **Interfaces** | `getNextBestAction(inputs)` |
| **Consumers** | Dashboard, Sprint View |
| **Inputs** | Gap amounts, assessment completion, sprint tasks, BIE recommendations |
| **Outputs** | Next best action with reasoning, priority, estimated impact |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 11. Sprint Aggregation

| Field | Value |
|-------|-------|
| **Owner** | Execution |
| **Responsibilities** | Aggregate sprint task completion into sprint progress |
| **Interfaces** | `aggregateSprintProgress(sprintId)` |
| **Consumers** | Sprint View, BIS, Dashboard |
| **Inputs** | SprintTask records |
| **Outputs** | Sprint progress percentage, completed task count, status |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 12. Executive Narrative Engine

| Field | Value |
|-------|-------|
| **Owner** | Frontend |
| **Responsibilities** | Generate the Executive Brief narrative from BIS — the single source of executive briefing content |
| **Interfaces** | `buildBrief(bis)` |
| **Consumers** | Executive Brief |
| **Inputs** | BIS (Business Intelligence State), BIE output |
| **Outputs** | Executive brief narrative (chapters, observations, mindset bridge) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 13. Galileo Context Builder

| Field | Value |
|-------|-------|
| **Owner** | Galileo |
| **Responsibilities** | Build scoped conversation context from canonical facts, BIS, profile, and business data |
| **Interfaces** | `buildGalileoContext(input)` |
| **Consumers** | Galileo (askGalileo) |
| **Inputs** | current_route, page_context, question, active_business_id, valuation context |
| **Outputs** | Galileo context (canonical_facts, bis, canonical_recommendations, strategic_hypotheses, conflict state) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 14. Galileo (askGalileo)

| Field | Value |
|-------|-------|
| **Owner** | Galileo |
| **Responsibilities** | The single AI interface for the platform; answer advisory questions using scoped context; maintain conversation history |
| **Interfaces** | `askGalileo(input)` |
| **Consumers** | All users (owners, advisors, admins) |
| **Inputs** | User question, Galileo context, conversation history |
| **Outputs** | Advisory response with intelligence labels (VERIFIED, PROJECTED, HYPOTHESIS, ADVISOR-CONFIRMED) |
| **Replaceable?** | ❌ No — Single AI interface (Article IX of Constitution) |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 15. Galileo Capability Framework

| Field | Value |
|-------|-------|
| **Owner** | Galileo |
| **Responsibilities** | Capability registry, pipeline execution contract, permission model for AI workflows |
| **Interfaces** | Capability Registry, Pipeline, Permissions |
| **Consumers** | Galileo, Executive Sessions |
| **Inputs** | Capability declarations, user tier, session state |
| **Outputs** | Executed capabilities, permission grants |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 16. Executive Session Governance

| Field | Value |
|-------|-------|
| **Owner** | Galileo |
| **Responsibilities** | Session accounting, tier-based access, earned session engine, preview mode |
| **Interfaces** | Session Engine, Accounting, Tiers |
| **Consumers** | Galileo, Capability Framework |
| **Inputs** | User tier, session usage, platform activity |
| **Outputs** | Session grants, consumption records, preview mode flags |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 17. Executive Intelligence Engine (EIE)

| Field | Value |
|-------|-------|
| **Owner** | Galileo |
| **Responsibilities** | Standardized, logic-based decision making in the Galileo intelligence layer |
| **Interfaces** | EIE decision pipeline |
| **Consumers** | Galileo |
| **Inputs** | Canonical facts, BIS, strategic context |
| **Outputs** | Logic-based executive decisions with reasoning |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 18. CBSS (Canonical Business State Synchronization)

| Field | Value |
|-------|-------|
| **Owner** | Sync Layer |
| **Responsibilities** | Shadow-mode orchestration of fact changes; classify propagation decisions; record sync actions without mutating production |
| **Interfaces** | `orchestrate(event)`, live sync policy, event qualification, circuit breaker |
| **Consumers** | All consumers (observes and coordinates) |
| **Inputs** | Business state events (fact changes) |
| **Outputs** | Sync actions (live or shadow), LiveSyncAction records, shadow comparisons |
| **Replaceable?** | ❌ No — Kernel foundation |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 19. IDO (Intelligence Dependency Orchestrator)

| Field | Value |
|-------|-------|
| **Owner** | Dependency Layer |
| **Responsibilities** | Coordinate what must happen when facts change; route each action to the correct certified owner engine; classify transitions (automatic, advisor_review, verification_required, blocked) |
| **Interfaces** | Dependency execution plan model (blueprint) |
| **Consumers** | None (coordinator — routes to engines) |
| **Inputs** | Fact change events, dependency graph, staleness map |
| **Outputs** | Dependency execution plans (metadata-only, no calculations) |
| **Replaceable?** | ❌ No — Kernel foundation |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No (blueprint-only implementation) |
| **Certification** | Kernel |

### 20. Field Governance

| Field | Value |
|-------|-------|
| **Owner** | Governance |
| **Responsibilities** | Field-level provenance, lock state, audit trail for valuation fields |
| **Interfaces** | `lock`, `unlock`, `update`, `getGovernance` |
| **Consumers** | Evidence Drawer, Valuation Workspace, Change Requests |
| **Inputs** | Field changes, advisor actions, AI recommendations |
| **Outputs** | Governance records (owner, lock state, source of truth, audit trail) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 21. Verification Queue

| Field | Value |
|-------|-------|
| **Owner** | Governance |
| **Responsibilities** | Surface conflicts, low-confidence values, and missing evidence for advisor resolution |
| **Interfaces** | `submit`, `resolve`, `getQueue` |
| **Consumers** | Verify Workspace, Intelligence Engine |
| **Inputs** | Conflicts (from Intelligence Engine), low-confidence values, missing evidence |
| **Outputs** | Queue items, resolution records |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 22. Notification Engine

| Field | Value |
|-------|-------|
| **Owner** | Platform |
| **Responsibilities** | Generate and deliver in-app and email notifications for platform events |
| **Interfaces** | `notify(input)` |
| **Consumers** | All users |
| **Inputs** | Events (task assigned, sprint completed, valuation update, etc.) |
| **Outputs** | Notification records (in-app, email) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 23. Document Intelligence

| Field | Value |
|-------|-------|
| **Owner** | Documents |
| **Responsibilities** | Extract financial data from uploaded documents; classify documents; produce extracted_fields |
| **Interfaces** | `extract(input)`, `classify(input)` |
| **Consumers** | Intelligence Engine, Canonical Fact Resolver, Data Room |
| **Inputs** | Uploaded documents (P&L, balance sheet, tax return, payroll) |
| **Outputs** | Extracted fields with confidence, document classifications |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 24. Calendar Sync

| Field | Value |
|-------|-------|
| **Owner** | Platform |
| **Responsibilities** | Sync sprint tasks, bookings, and reminders to external calendars (Google, Outlook, iCal) |
| **Interfaces** | `sync`, `syncRoadmap` |
| **Consumers** | Sprint View, Bookings, Command Center |
| **Inputs** | Sprint tasks, bookings, reminders |
| **Outputs** | CalendarSyncEvent records, provider events |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 25. Permission System

| Field | Value |
|-------|-------|
| **Owner** | Auth |
| **Responsibilities** | Role-based and assignment-based access control; granular user permissions |
| **Interfaces** | UserPermission entity, role checks |
| **Consumers** | All subsystems |
| **Inputs** | User role, assignments, business context |
| **Outputs** | Permission grants, access decisions |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 26. Business Context Engine

| Field | Value |
|-------|-------|
| **Owner** | Frontend |
| **Responsibilities** | Manage active business context; trigger BIS recalculation on business switch; track bisVersion |
| **Interfaces** | BusinessContextProvider, useBusinessContext |
| **Consumers** | Dashboard, all business-scoped pages |
| **Inputs** | User businesses, active selection |
| **Outputs** | Active business_id, profile_id, bisVersion, triggeredBy |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 27. Dashboard

| Field | Value |
|-------|-------|
| **Owner** | Frontend |
| **Responsibilities** | Display business intelligence to the owner; compose BIS, canonical facts, and sprint data into a unified view |
| **Interfaces** | Dashboard page component |
| **Consumers** | Owners, advisors (view), admins (view) |
| **Inputs** | BIS, canonical facts, sprint data, metrics, snapshots |
| **Outputs** | Dashboard display (no calculations — reads only) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ✅ Yes |
| **Experimental?** | ❌ No |
| **Certification** | Kernel |

### 28. Executive Brief

| Field | Value |
|-------|-------|
| **Owner** | Frontend |
| **Responsibilities** | Display the executive briefing narrative (generated by Executive Narrative Engine) in a Focus Mode walkthrough |
| **Interfaces** | ExecutiveBriefing component, useExecutiveBriefing |
| **Consumers** | Owners (first visit), advisors (replay) |
| **Inputs** | BIS, narrative engine output |
| **Outputs** | Briefing display (no content generation — reads from Narrative Engine) |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 29. Reports / Deliverables Engine

| Field | Value |
|-------|-------|
| **Owner** | Valuation |
| **Responsibilities** | Generate valuation reports and deliverables from published valuation versions |
| **Interfaces** | DeliverablesEngine |
| **Consumers** | Deliverables Workspace, Reports |
| **Inputs** | Published valuation versions, confidence scores, field governance |
| **Outputs** | Report documents, deliverable records |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

### 30. Command Center (Meeting Preparation)

| Field | Value |
|-------|-------|
| **Owner** | Advisory |
| **Responsibilities** | Generate advisor meeting preparation from canonical facts and BIS |
| **Interfaces** | `generateAdvisorCommandCenter(input)` |
| **Consumers** | Advisors, admins |
| **Inputs** | Canonical facts, BIS, client profile, business context |
| **Outputs** | Meeting preparation summary, client snapshot |
| **Replaceable?** | ❌ No |
| **Kernel?** | ❌ No (Certified) |
| **Experimental?** | ❌ No |
| **Certification** | Certified |

---

## Engine Count Summary

| Certification | Count |
|-------------|-------|
| Kernel | 16 |
| Certified | 14 |
| **Total** | **30** |

---

## Rules

```
RULE 1: No engine may operate outside this registry.
RULE 2: No new engine may be created for a concept an existing engine already owns.
RULE 3: Kernel engines require architectural review before modification.
RULE 4: Certified engines have stable, frozen interfaces.
RULE 5: All engines must declare ownership, inputs, outputs, and consumers.
RULE 6: Engines compose — they do not duplicate.
RULE 7: Engines read canonical facts first (Article VIII).
RULE 8: Engines never bypass governance (Article V).
```

---

## READY FOR CONSTITUTION REVIEW