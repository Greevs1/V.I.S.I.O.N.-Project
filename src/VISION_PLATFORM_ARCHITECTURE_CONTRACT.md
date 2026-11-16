# V.I.S.I.O.N. Platform™ — Architecture Contract

**Phase:** 14.5 — Platform Certification & Architecture Contract
**Date:** 2026-08-10
**Status:** FROZEN — Kernel Contract
**Authority:** This document is the permanent governing contract for the V.I.S.I.O.N. Platform. Every future feature must integrate through this contract. Nothing may bypass certified ownership. Nothing may duplicate existing intelligence.
**Supreme Authority:** `src/VISION_CONSTITUTION.md` — This contract is subordinate to the V.I.S.I.O.N. Constitution. No provision in this contract may violate the Constitution.

> **Phase B Amendment (2026-08-12):** Document Persistence Freeze (Constitution Article XV). All persistent document data is owned by Supabase. `getMetricAutoPopulate` is business-scoped. See `src/SUPABASE_DOCUMENT_AUTHORITY_MIGRATION.md`.
>
> **Phase C.1 Amendment (2026-08-12):** Shared Intelligence Contract Enforcement certified. Base44 Assessment and Document entities retired as persistence authorities. Supabase is the sole system of record. See `src/SHARED_INTELLIGENCE_CONTRACT_ENFORCEMENT.md`.
>
> **Phase D Amendment (2026-08-13):** Decision Intelligence Foundation certified. Decision Intelligence is a governed human decision support layer (Constitution Article XV). AI proposes reasoning, humans decide, existing certified systems execute. See `src/DECISION_INTELLIGENCE_FOUNDATION.md`.
>
> **Phase D.1 Amendment (2026-08-14):** Decision Outcome Intelligence certified. Closes the decision-learning loop with human-confirmed retrospective intelligence (Constitution Article XVI — Outcome Authority). AI analyzes and suggests; humans confirm. No new table — existing `business_decisions` outcome fields used. See `src/DECISION_OUTCOME_INTELLIGENCE.md`.
>
> **Phase E Amendment (2026-08-14):** Business DNA Foundation certified. Derived pattern intelligence synthesizing durable patterns across certified evidence (Constitution Article XVII — Business DNA Authority). Six families: Economic, Value, Operating, Decision, Owner, Risk & Resilience. AI proposes candidates; deterministic rules qualify. Evidence lineage dedup prevents confidence inflation. One additive table: `business_dna_patterns`. No master DNA score. See `src/BUSINESS_DNA_FOUNDATION.md`.

---

## 0. Contract Authority

This Architecture Contract is the **kernel** of the V.I.S.I.O.N. Platform. It defines:

- What every subsystem is
- Who owns what
- How systems extend
- What is forbidden
- How architecture evolves

**Every future implementation must pass this contract. No exceptions.**

---

## PART 1 — PLATFORM INVENTORY

Every certified subsystem in V.I.S.I.O.N., declaring purpose, owner, responsibilities, inputs, outputs, dependencies, consumers, mutation rights, read rights, extension points, forbidden responsibilities, certification level, and kernel status.

**Kernel Status** indicates whether a subsystem is Kernel (requires architectural review + platform owner approval before modification) or Certified (requires architectural review). See Part 7 for the full certification level definitions.

### 1.1 Canonical Intelligence Layer

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **Canonical Fact Registry** | 50-fact declarative registry — single source of truth for business facts | Canonical Layer | Kernel | Phase 14.2A |
| **Canonical Fact Resolver** | Resolves canonical fact values via 8-level source hierarchy | Canonical Layer | Kernel | Phase 14.2A |
| **Source Hierarchy** | 8-level authority ranking for source resolution | Canonical Layer | Kernel | Phase 14.2A |
| **Lineage Assembly** | Derives fact lineage from existing audit data | Canonical Layer | Certified | Phase 14.2A |
| **Consumer Adapter** | Read-path adapter for consumer migration | Canonical Layer | Certified | Phase 14.2B |
| **Canonical Fact Service** | Backend read-only API for canonical facts | Backend | Certified | Phase 14.2A |

### 1.2 Synchronization Layer

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **CBSS (Canonical Business State Synchronization)** | Shadow-mode orchestration of fact changes | Sync Layer | Kernel | Phase 14.3 |
| **Live Sync Policy** | Centralized live/shadow matrix | Sync Layer | Kernel | Phase 14.3B |
| **Event Qualification** | 8-check event eligibility for live sync | Sync Layer | Kernel | Phase 14.3B |
| **Circuit Breaker** | Per-consumer failure isolation | Sync Layer | Kernel | Phase 14.3B |
| **Live Orchestrator** | Determines live vs shadow per consumer | Sync Layer | Kernel | Phase 14.3B |
| **Deduplication** | Event dedup before propagation | Sync Layer | Certified | Phase 14.3A |
| **Event Ordering** | Dependency-aware event ordering | Sync Layer | Certified | Phase 14.3A |
| **Cycle Detection** | Acyclicity verification | Sync Layer | Certified | Phase 14.3A |
| **Subscription Registry** | Declarative consumer subscriptions | Sync Layer | Kernel | Phase 14.3 |
| **Impact Radius** | Maps events to affected consumers | Sync Layer | Certified | Phase 14.3 |
| **Governance** | Classifies propagation (automatic/review/verify/blocked) | Sync Layer | Kernel | Phase 14.3 |
| **Shadow Sync** | Shadow comparison for all consumers | Sync Layer | Certified | Phase 14.3A |
| **Explainable Sync** | Human-readable sync reports | Sync Layer | Certified | Phase 14.3 |
| **Observability** | Telemetry and metrics | Sync Layer | Certified | Phase 14.3 |
| **Timeline** | Business change timeline | Sync Layer | Certified | Phase 14.3 |

### 1.3 Dependency & Derived Fact Layer

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **Derived Fact Framework** | 40-fact derived inventory + dependency graph | Dependency Layer | Kernel | Phase 14.4A |
| **Intelligence Dependency Orchestrator (IDO)** | Coordinates what must happen when facts change | Dependency Layer | Kernel | Phase 14.4B |
| **Intelligence Graph (BIE)** | Static metric dependency edges | BIE | Certified | Phase 9 |
| **Staleness Map** | Valuation calculation staleness | Valuation Engine | Certified | Phase 13.3 |

### 1.4 Calculation Engines

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **Business Intelligence Engine (BIE)** | Composite intelligence metrics | BIE | Kernel | Phase 9 |
| **Valuation Calculation Engine** | All valuation calculations | Valuation | Kernel | Phase 13.3 |
| **Confidence Engine** | Confidence scoring (5 categories) | Valuation | Kernel | Phase 13.3 |
| **Build Value Engine** | 6 business quality dimensions | Valuation | Certified | Phase 13.3E |
| **Growth Plan Engine** | Growth initiative generation | Valuation | Certified | Phase 13.2 |
| **Intelligence Engine** | Candidate + conflict + prefill | Valuation | Kernel | Phase 13.3 |
| **Assessment Calculations** | Assessment result calculations | Assessment | Certified | Phase 3 |
| **NBA Engine** | Next best action | Execution | Certified | Phase 10 |
| **Sprint Aggregation** | Sprint progress | Execution | Certified | Phase 11 |
| **Freedom Engine** | Freedom path calculations | Assessment | Certified | Phase 11 |
| **Value Creation Engine** | Value creation tracking | Execution | Certified | Phase 11 |
| **Reporting Quality Engine** | Report quality scoring | Valuation | Certified | Phase 13.3 |
| **Galileo Opportunity Engine** | Opportunity ranking | Galileo | Certified | Phase 13.4 |

### 1.5 Consumer Systems

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **Dashboard** | Primary intelligence display | Frontend | Kernel | Phase 9 |
| **Executive Brief** | Narrative intelligence walkthrough | Frontend | Certified | Phase 9 |
| **Galileo** | AI advisory interface | Galileo | Kernel | Phase 13.4 |
| **Galileo Context Builder** | Builds scoped conversation context | Galileo | Certified | Phase 13.4A |
| **Galileo Capability Framework** | Capability registry + pipeline | Galileo | Certified | Phase 13.4B |
| **Executive Session Governance** | Session accounting + tiers | Galileo | Certified | Phase 13.4B |
| **Executive Intelligence Engine (EIE)** | Logic-based decision making | Galileo | Certified | Phase 13.4C |
| **Reports / Deliverables** | Valuation report generation | Valuation | Certified | Phase 13.3 |
| **Growth Plan Workspace** | Growth initiative UI | Frontend | Certified | Phase 13.2 |
| **Build Value Workspace** | Business quality UI | Frontend | Certified | Phase 13.3E |
| **Sprint View** | 90-day sprint execution | Frontend | Certified | Phase 11 |
| **Command Center** | Advisor meeting preparation | Advisory | Certified | Phase 13.1 |
| **Data Room** | Document management | Frontend | Certified | Phase 5 |
| **Exit Readiness** | Readiness tracking | Advisory | Certified | Phase 8 |
| **MA Simulator** | M&A scenario simulation | Advisory | Certified | Phase 8 |

### 1.6 Governance Systems

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **Field Governance** | Field-level provenance + lock state | Governance | Kernel | Phase 13.3G |
| **Verification Queue** | Conflict resolution surface | Governance | Kernel | Phase 13.3 |
| **Valuation Field Governance** | Valuation field ownership | Governance | Certified | Phase 13.3G |
| **Change Requests** | Read-only user change requests | Governance | Certified | Phase 13.3G |
| **Evidence Drawer** | Lineage + evidence display | Governance | Certified | Phase 13.3G |
| **Permission System** | Role + assignment-based access | Auth | Kernel | Phase 13.3G |
| **User Permissions** | Granular user permissions | Auth | Certified | Phase 13.3G |

### 1.7 Infrastructure Systems

| Subsystem | Purpose | Owner | Certification | Reference |
|-----------|---------|-------|---------------|----------|
| **BIE Persistence** | Snapshots + journal | BIE | Kernel | Phase 9 |
| **Notification System** | In-app + email notifications | Platform | Certified | Phase 6 |
| **Document Intelligence** | Extraction + classification | Documents | Certified | Phase 5 |
| **Calendar Sync** | Calendar event synchronization | Platform | Certified | Phase 12 |
| **Business Profiles** | Multi-business architecture | Platform | Kernel | Phase 4 |
| **Business Context Engine** | Active business context | Frontend | Kernel | Phase 4 |
| **Anonymous Session** | Guest session management | Platform | Certified | Phase 4 |
| **Enterprise Journey** | Pre-auth exploration | Frontend | Certified | Phase 4 |
| **Membership** | Subscription tier gating | Platform | Certified | Phase 7 |
| **Auth Context** | Authentication state | Auth | Kernel | Phase 1 |

### 1.8 Forbidden Responsibilities

| Subsystem | Forbidden |
|-----------|-----------|
| IDO | Calculating values, owning truth, calling engines directly |
| CBSS | Calculating values, owning truth, replacing engines |
| Dashboard | Calculating metrics independently, running fallback chains |
| Galileo | Calculating metrics, owning business facts, bypassing canonical |
| Executive Brief | Calculating metrics, owning narrative truth, generating content via LLM |
| Canonical Layer | Calculating derived values, owning business intelligence |
| Consumer Adapter | Writing to source tables, mutating canonical values |
| Field Governance | Changing field values, overriding advisor decisions |

---

## PART 2 — OWNERSHIP CONTRACT

### 2.1 The One-Owner Principle

**Every business concept has exactly ONE owner.** The owner is the single system authorized to produce, calculate, or manage that concept. No other system may duplicate this authority.

### 2.2 Complete Ownership Matrix

| Business Concept | Owner | Location | Others May |
|-----------------|-------|----------|-----------|
| **Revenue (canonical fact)** | Canonical Fact Layer | `canonicalFact/registry.ts` | Read only |
| **Net Income (canonical fact)** | Canonical Fact Layer | `canonicalFact/registry.ts` | Read only |
| **Cash (canonical fact)** | Canonical Fact Layer | `canonicalFact/registry.ts` | Read only |
| **Debt (canonical fact)** | Canonical Fact Layer | `canonicalFact/registry.ts` | Read only |
| **All 50 canonical facts** | Canonical Fact Layer | `canonicalFact/registry.ts` | Read only |
| **Gross Margin (derived)** | BIE Engine | `bie/engine.js` | Read only |
| **Normalized EBITDA (derived)** | Valuation Engine | `valuationCalculationEngine` | Read only |
| **Enterprise Value (derived)** | Valuation Engine | `valuationCalculationEngine` | Read only |
| **Equity Value (derived)** | Valuation Engine | `valuationCalculationEngine` | Read only |
| **IQ Score (derived)** | BIE Engine | `bie/engine.js` | Read only |
| **Business Impact Score (derived)** | BIE Engine | `bie/engine.js` | Read only |
| **Profit Gap Amount (derived)** | Assessment Engine | `assessmentCalculations.js` | Read only |
| **Value Gap Amount (derived)** | Assessment Engine | `assessmentCalculations.js` | Read only |
| **Tax Gap Annual (derived)** | Assessment Engine | `assessmentCalculations.js` | Read only |
| **Operations Score (derived)** | Assessment Engine | `assessmentCalculations.js` | Read only |
| **Freedom Score (derived)** | Assessment Engine | `assessmentCalculations.js` | Read only |
| **6 Build Value Dimensions** | Build Value Engine | `buildValueEngine.js` | Read only |
| **Confidence Scores** | Confidence Engine | `confidenceEngine.ts` | Read only |
| **Growth Initiatives** | Growth Plan Engine | `growthPlanEngine.js` | Read only |
| **Next Best Action** | NBA Engine | `nbaRecommendations.js` | Read only |
| **Sprint Progress** | Sprint Aggregation | `sprintAdapter.js` | Read only |
| **Document Completeness** | Intelligence Engine | `intelligenceEngine.ts` | Read only |
| **Verification Status** | Intelligence Engine | `intelligenceEngine.ts` | Read only |
| **Synchronization** | CBSS | `businessStateSync/` | Observe only |
| **Dependency Resolution** | IDO | (blueprint) | Observe only |
| **Derived Calculations** | Certified Calculation Engines | various | Read only |
| **Conversation** | Galileo | `askGalileo` | Read context only |
| **Galileo Context** | Galileo Context Builder | `buildGalileoContext` | Read only |
| **Executive Brief Narrative** | Executive Narrative Engine | `executiveNarrativeEngine.js` | Read only |
| **Valuation Publication** | Valuation Service | `valuationService` | Request only |
| **Field Provenance** | Field Governance | `fieldGovernanceService` | Read only |
| **Conflict Resolution** | Verification Queue | `verificationQueueService` | Submit only |
| **Notifications** | Notification System | `notificationService` | Request only |
| **Business Context** | Business Context Engine | `BusinessContext.jsx` | Read only |
| **User Permissions** | Permission System | `UserPermission` | Read only |
| **Assessment State** | Assessment Context | `AssessmentContext.jsx` | Read only |
| **Membership Tier** | Membership System | `useMembership.js` | Read only |
| **Document Extraction** | Document Intelligence | `runDocumentExtraction` | Submit only |
| **Calendar Events** | Calendar Sync | `calendarService` | Request only |
| **BIE Snapshots** | BIE Persistence | `biePersistence` | Read only |
| **BIE Journal** | BIE Persistence | `biePersistence` | Read only |
| **Business Timeline** | Timeline Module | `businessStateSync/timeline` | Read only |

### 2.3 Ownership Rules

```
RULE 1: Every business concept has exactly ONE owner.
RULE 2: The owner is declared in the ownership matrix.
RULE 3: Ownership never changes without architectural review.
RULE 4: No system may duplicate another system's ownership.
RULE 5: Consumers read from owners — they never become owners.
RULE 6: Owners may delegate reads but never delegate ownership.
RULE 7: New concepts must declare an owner before activation.
RULE 8: Orphaned concepts (no owner) are not allowed.
```

---

## PART 3 — ENGINE CERTIFICATION

### 3.1 Certified Engine Registry

| Engine | Owner | Inputs | Outputs | Dependencies | Consumers | Mutation Rights | Read Rights | Certification | Replaceable? | Extensible? | Deprecated? | Experimental? |
|--------|-------|--------|---------|-------------|-----------|-----------------|-------------|---------------|-------------|-------------|-------------|---------------|
| **Canonical Fact Resolver** | Canonical Layer | Supabase raw sources | Canonical fact values | None | All consumers | ❌ No | ✅ Read | Kernel | ❌ No | ✅ Add facts | ❌ No | ❌ No |
| **BIE Engine** | BIE | assessmentSummary, dashboardMetrics, latestSnapshot, canonicalFacts | BusinessIntelligenceMetric[] | Canonical Fact Resolver | Dashboard, Executive Brief, Galileo, Sprint | ✅ Snapshots, Journal | ✅ Read | Kernel | ❌ No | ✅ Add metrics | ❌ No | ❌ No |
| **Valuation Calculation Engine** | Valuation | normalized_ebitda, multiple, dcf, cap | enterprise_value, equity_value | Confidence Engine, Intelligence Engine | Dashboard, Reports, Growth Plan | ✅ valuation_calculations | ✅ Read | Kernel | ❌ No | ✅ Add methods | ❌ No | ❌ No |
| **Confidence Engine** | Valuation | source data quality, extraction confidence | confidence scores | Intelligence Engine | Valuation, BIS, Dashboard | ❌ No (read-only calc) | ✅ Read | Kernel | ❌ No | ✅ Add categories | ❌ No | ❌ No |
| **Build Value Engine** | Valuation | intelligence candidates | 6 dimension scores | Intelligence Engine | Build Value, BIS, Dashboard | ❌ No | ✅ Read | Certified | ❌ No | ✅ Add dimensions | ❌ No | ❌ No |
| **Growth Plan Engine** | Valuation | enterprise_value, normalized_ebitda, drivers | growth initiatives | Valuation Engine | Growth Plan, Sprint, BIE | ✅ initiatives | ✅ Read | Certified | ❌ No | ✅ Add initiative types | ❌ No | ❌ No |
| **Intelligence Engine** | Valuation | extracted_fields, assessment answers | candidates, conflicts, prefill | None | Valuation, Verify, Build Value | ❌ No | ✅ Read | Kernel | ❌ No | ✅ Add resolvers | ❌ No | ❌ No |
| **Assessment Calculations** | Assessment | assessment answers, benchmarks | gap amounts, scores | Benchmarks | BIE, Dashboard, Sprint | ✅ assessment results | ✅ Read | Certified | ❌ No | ✅ Add assessments | ❌ No | ❌ No |
| **NBA Engine** | Execution | gap amounts, completion, sprint | next best action | BIE, Sprint | Dashboard, Sprint | ❌ No | ✅ Read | Certified | ❌ No | ✅ Add recommendations | ❌ No | ❌ No |
| **Sprint Aggregation** | Execution | sprint tasks | sprint progress | SprintTask | Sprint, BIS, Dashboard | ❌ No | ✅ Read | Certified | ❌ No | ❌ No | ❌ No | ❌ No |
| **Executive Narrative Engine** | Frontend | BIS, BIE | executive brief narrative | BIE | Executive Brief | ❌ No | ✅ Read | Certified | ❌ No | ✅ Add chapters | ❌ No | ❌ No |
| **Galileo Context Builder** | Galileo | canonical facts, BIS, profile | galileo context | Canonical Resolver | Galileo | ❌ No | ✅ Read | Certified | ❌ No | ✅ Add domains | ❌ No | ❌ No |
| **CBSS** | Sync Layer | business state events | sync actions | All engines | All consumers | ✅ LiveSyncAction | ✅ Read | Kernel | ❌ No | ✅ Add consumers | ❌ No | ❌ No |
| **IDO** | Dependency | fact changes | execution plans | IntelligenceGraph, stalenessMap | None (coordinator) | ❌ No | ✅ Read | Kernel | ❌ No | ✅ Add rules | ❌ No | ❌ No |
| **Field Governance** | Governance | field changes | lock state, provenance | None | Evidence Drawer | ✅ governance records | ✅ Read | Kernel | ❌ No | ✅ Add fields | ❌ No | ❌ No |
| **Verification Queue** | Governance | conflicts | queue items | Intelligence Engine | Verify Workspace | ✅ queue items | ✅ Read | Kernel | ❌ No | ✅ Add conflict types | ❌ No | ❌ No |
| **Notification System** | Platform | events | notifications | None | All users | ✅ notifications | ✅ Read | Certified | ❌ No | ✅ Add types | ❌ No | ❌ No |
| **BIE Persistence** | BIE | BIE output | snapshots, journal | BIE Engine | BIE, Dashboard | ✅ snapshots, journal | ✅ Read | Kernel | ❌ No | ❌ No | ❌ No | ❌ No |

### 3.3 Interface Freeze

Every certified engine's interface is **frozen**. Changes require architectural review:

- Input shape changes → breaking
- Output shape changes → breaking
- New optional fields → non-breaking (additive)
- Removed fields → breaking
- Semantic changes → breaking

---

## PART 4 — EXTENSION CONTRACT

### 4.1 Allowed Extensions

Future developers MAY extend V.I.S.I.O.N. by:

| Extension | How | Approval Required |
|-----------|-----|------------------|
| Register capability | Galileo Capability Registry | Architectural review |
| Register consumer | Subscription Registry | Architectural review |
| Register derived fact | Derived Fact Framework + Ownership declaration | Architectural review |
| Register canonical fact | Canonical Fact Registry (additive) | Architectural review |
| Register orchestration rule | IDO registry (future) | Architectural review |
| Register subscription | Subscription Registry | Architectural review |
| Register valuation method | Methodology Registry | Architectural review |
| Register dashboard widget | Dashboard component registry | Review |
| Register report | Deliverables Engine | Review |
| Register advisor workflow | Command Center | Review |
| Register assessment type | Assessment Engine | Architectural review |
| Register notification type | Notification System | Review |
| Register benchmark | Benchmark Library | Review |

### 4.2 Forbidden Extensions

Future developers MAY NOT:

| Forbidden | Reason |
|----------|--------|
| Duplicate calculations | Violates One Calculation Owner Rule |
| Duplicate synchronization | Violates One Sync Owner Rule (CBSS) |
| Duplicate canonical facts | Violates One Truth Rule |
| Duplicate ownership | Violates One Owner Rule |
| Bypass governance | Violates Advisor Governance Rule |
| Hardcode dependencies | Violates Dependency Declaration Rule |
| Bypass IDO | Violates Dependency Resolution Rule |
| Bypass CBSS | Violates Synchronization Rule |
| Bypass canonical resolution | Violates Canonical First Rule |
| Create new calculation engines for existing concepts | Violates No Duplicate Engine Rule |
| Write directly to consumer tables | Violates Propagation Rule |
| Auto-promote AI hypotheses to canonical | Violates Advisor Governance Rule |
| Hardcode fallback values | Violates Evidence Rule |
| Expose internal IDs to clients | Violates Client Safe Rule |
| Publish valuations without advisor approval | Violates Review Rule |

### 4.3 Extension Process

```
1. Developer proposes extension
2. Architectural review (this contract)
3. Ownership declaration (if new concept)
4. Certification level assignment
5. Shadow mode (if sync/propagation)
6. Pilot (if live behavior)
7. Certification
8. Activation
```

---

## PART 5 — API CONTRACTS

### 5.1 Stable Internal Interfaces

| API | Contract | Owner | Stability |
|-----|----------|-------|-----------|
| **Canonical Fact API** | `canonicalFactService.resolveFact(businessId, factKey, options)` | Canonical Layer | FROZEN |
| **Canonical Fact Batch API** | `canonicalFactService.resolveFacts(businessId, factKeys[])` | Canonical Layer | FROZEN |
| **Consumer Adapter API** | `consumerAdapter.getConsumerFacts(input)` | Canonical Layer | FROZEN |
| **BIE API** | `buildBusinessIntelligenceEngine(inputs, opts)` | BIE | FROZEN |
| **BIS API** | `buildBusinessIntelligenceState(inputs, opts)` | BIE | FROZEN |
| **BIE Persistence API** | `biePersistence.saveSnapshot/appendJournalEntry` | BIE | FROZEN |
| **Valuation Calculation API** | `valuationCalculationEngine.calculate(inputs)` | Valuation | FROZEN |
| **Confidence API** | `confidenceEngine.calculateConfidence(input)` | Valuation | FROZEN |
| **Intelligence API** | `intelligenceEngine.buildCandidate/detectConflicts` | Valuation | FROZEN |
| **Build Value API** | `buildValueEngine.buildDimensionScores(intelligence)` | Valuation | FROZEN |
| **Growth Plan API** | `growthPlanEngine.generateInitiatives(inputs)` | Valuation | FROZEN |
| **Synchronization API** | `liveSyncOrchestrator.orchestrate(event)` | Sync Layer | FROZEN |
| **Live Sync Policy API** | `liveSyncPolicy.isLive(factKey, consumerId, businessId)` | Sync Layer | FROZEN |
| **Event Qualification API** | `qualifyEvent(event, factKey, consumerId)` | Sync Layer | FROZEN |
| **Circuit Breaker API** | `circuitBreaker.recordResult/consume` | Sync Layer | FROZEN |
| **Dependency Graph API** | `IntelligenceGraph.getDescendants/getAncestors` | BIE | FROZEN |
| **Staleness Map API** | `stalenessMap.getAffectedCalculations(sourceChange)` | Valuation | FROZEN |
| **Galileo Context API** | `buildGalileoContext(input)` | Galileo | FROZEN |
| **Galileo Ask API** | `askGalileo(input)` | Galileo | FROZEN |
| **Executive Brief API** | `executiveNarrativeEngine.buildBrief(bis)` | Frontend | FROZEN |
| **Field Governance API** | `fieldGovernanceService.lock/unlock/update` | Governance | FROZEN |
| **Verification Queue API** | `verificationQueueService.submit/resolve` | Governance | FROZEN |
| **Notification API** | `notificationService.notify(input)` | Platform | FROZEN |
| **Dashboard Data API** | `supabaseUserData.getDashboardMetrics/getAssessmentSummary` | Backend | FROZEN |
| **Sprint API** | `ninetyDaySprint.getSprint/getNextBestAction` | Execution | FROZEN |
| **Assessment Save API** | `saveAssessmentToSupabase.save(input)` | Assessment | FROZEN |
| **Document Upload API** | `uploadDocumentToSupabase.upload(input)` | Documents | FROZEN |
| **Document Extraction API** | `runDocumentExtraction.extract(input)` | Documents | FROZEN |
| **Calendar Sync API** | `calendarService.sync/syncRoadmap` | Platform | FROZEN |
| **Membership API** | `useMembership()` | Platform | FROZEN |
| **Auth API** | `base44.auth.me/isAuthenticated/logout` | Auth | FROZEN |
| **Entity SDK API** | `base44.entities.EntityName.operations` | Platform | FROZEN |
| **Integration API** | `base44.integrations.Core.endpoint` | Platform | FROZEN |

### 5.2 API Stability Rules

```
RULE 1: Frozen APIs do not change shape without architectural review.
RULE 2: Additive changes (new optional fields) are allowed.
RULE 3: Breaking changes require deprecation cycle.
RULE 4: Every API has ONE owner.
RULE 5: API consumers must handle null/missing gracefully.
RULE 6: No API may bypass canonical resolution.
```

---

## PART 6 — ARCHITECTURAL RULES

### 6.1 The Permanent Rules

These rules govern every future implementation. No feature may bypass them.

#### Rule 1: One Truth Rule
Every business fact exists exactly once in the Canonical Fact Registry. No duplicate facts. No duplicate storage of the same fact.

#### Rule 2: One Calculation Owner Rule
Every derived fact has exactly ONE calculation owner. No two engines calculate the same metric. Display readers consume — they do not recalculate.

#### Rule 3: No Duplicate Engine Rule
No new engine may be created to calculate what an existing certified engine already calculates. New engines require architectural review and must own a NEW concept.

#### Rule 4: Canonical First Rule
Every consumer reads canonical facts first, falling back to legacy sources. No consumer may bypass canonical resolution once a fact is in the pilot.

#### Rule 5: Advisor Governance Rule
Valuation outputs, growth initiatives, and advisor-level decisions always require advisor approval. AI never auto-promotes hypotheses to canonical. AI never publishes valuations.

#### Rule 6: Client Safe Rule
Internal source IDs, raw extraction metadata, and internal engine state are never exposed to clients. Client-safe filtering is mandatory for all client-facing APIs.

#### Rule 7: Explainability Rule
Every metric must explain itself. Lineage is derived from existing audit data. Evidence is available through the EvidenceDrawer. No black-box metrics.

#### Rule 8: Evidence Rule
No hardcoded fallback values. Metrics show empty states when data is missing. No fabricated data. No speculative backfilling.

#### Rule 9: Lineage Rule
Every fact carries lineage — the chain of derivation from primary sources to current value. Lineage is derived, not stored. No new lineage store.

#### Rule 10: Business Isolation Rule
Every query, event, and sync action is scoped by business_id. No cross-business data leakage. Multi-business architecture is strictly isolated.

#### Rule 11: Propagation Rule
No direct writes to consumer tables. Updates write to canonical source, then propagate via CBSS. No module has its own propagation graph.

#### Rule 12: Review Rule
Valuation publication requires advisor approval. Growth initiatives require advisor approval. No autonomous publication of advisor-governed outputs.

#### Rule 13: Version Rule
Published valuations are immutable. New versions create new records. No overwriting of published versions. Delta engine tracks changes between versions.

#### Rule 14: Shadow First Rule
New synchronization goes through shadow mode first. Live mode requires explicit pilot certification. No direct-to-live activation.

#### Rule 15: Dependency Declaration Rule
Every derived fact declares its dependencies. No hardcoded dependency lookups. The dependency graph is declarative and acyclic.

#### Rule 16: No Bypass Rule
No feature may bypass IDO for dependency resolution. No feature may bypass CBSS for synchronization. No feature may bypass canonical resolution for fact reads.

#### Rule 17: Reuse Rule
New features must reuse existing certified engines. Creating a new engine for an existing concept is forbidden. Extension is additive, not duplicative.

#### Rule 18: Certification Level Rule
Every subsystem has a certification level. Kernel systems require architectural review before modification. No uncertified system may enter production.

### 6.2 Rule Enforcement

| Rule | Enforced By |
|------|-------------|
| One Truth | Canonical Fact Registry |
| One Calculation Owner | Ownership Matrix |
| No Duplicate Engine | Architectural Review |
| Canonical First | Consumer Adapter |
| Advisor Governance | Governance Classification |
| Client Safe | clientSafe.ts filter |
| Explainability | EvidenceDrawer + Lineage |
| Evidence | BIE Engine (no hardcoded fallbacks) |
| Lineage | Lineage Assembly |
| Business Isolation | RLS + business_id scoping |
| Propagation | CBSS + stalenessMap |
| Review | Valuation Service |
| Version | Valuation Service + Delta Engine |
| Shadow First | Live Sync Policy |
| Dependency Declaration | IntelligenceGraph + Derived Fact Framework |
| No Bypass | Architectural Review |
| Reuse | Architectural Review |
| Certification Level | This Contract |

---

## PART 7 — CERTIFICATION LEVELS

### 7.1 Maturity Levels

| Level | Meaning | Modification Requires |
|-------|---------|----------------------|
| **Kernel** | Core platform foundation — cannot be replaced | Architectural review + platform owner approval |
| **Certified** | Production-certified — stable interface | Architectural review |
| **Preview** | Feature-complete but not yet certified | Review |
| **Experimental** | Under development — may change | No approval needed |

### 7.2 Subsystem Certification Assignment

| Subsystem | Level |
|-----------|-------|
| Canonical Fact Registry | Kernel |
| Canonical Fact Resolver | Kernel |
| Source Hierarchy | Kernel |
| CBSS | Kernel |
| Live Sync Policy | Kernel |
| Event Qualification | Kernel |
| Circuit Breaker | Kernel |
| Live Orchestrator | Kernel |
| Subscription Registry | Kernel |
| Governance | Kernel |
| Derived Fact Framework | Kernel |
| IDO | Kernel |
| Intelligence Graph | Kernel |
| BIE Engine | Kernel |
| BIE Persistence | Kernel |
| Valuation Calculation Engine | Kernel |
| Confidence Engine | Kernel |
| Intelligence Engine | Kernel |
| Field Governance | Kernel |
| Verification Queue | Kernel |
| Permission System | Kernel |
| Business Context Engine | Kernel |
| Auth Context | Kernel |
| Dashboard | Kernel |
| Galileo | Kernel |
| Staleness Map | Kernel |
| Consumer Adapter | Certified |
| Lineage Assembly | Certified |
| Canonical Fact Service | Certified |
| Deduplication | Certified |
| Event Ordering | Certified |
| Cycle Detection | Certified |
| Shadow Sync | Certified |
| Impact Radius | Certified |
| Explainable Sync | Certified |
| Observability | Certified |
| Timeline | Certified |
| Build Value Engine | Certified |
| Growth Plan Engine | Certified |
| Assessment Calculations | Certified |
| NBA Engine | Certified |
| Sprint Aggregation | Certified |
| Freedom Engine | Certified |
| Value Creation Engine | Certified |
| Reporting Quality Engine | Certified |
| Galileo Opportunity Engine | Certified |
| Executive Narrative Engine | Certified |
| Galileo Context Builder | Certified |
| Galileo Capability Framework | Certified |
| Executive Session Governance | Certified |
| Executive Intelligence Engine | Certified |
| Reports / Deliverables | Certified |
| Growth Plan Workspace | Certified |
| Build Value Workspace | Certified |
| Sprint View | Certified |
| Command Center | Certified |
| Data Room | Certified |
| Exit Readiness | Certified |
| MA Simulator | Certified |
| Valuation Field Governance | Certified |
| Change Requests | Certified |
| Evidence Drawer | Certified |
| User Permissions | Certified |
| Notification System | Certified |
| Document Intelligence | Certified |
| Calendar Sync | Certified |
| Business Profiles | Kernel |
| Anonymous Session | Certified |
| Enterprise Journey | Certified |
| Membership | Certified |
| Executive Brief | Certified |

### 7.3 Kernel Modification Rules

Kernel systems require:
1. Architectural review
2. Platform owner approval
3. Impact assessment on all dependents
4. Certification re-verification
5. Migration plan (if breaking)

---

## PART 8 — CHANGE CONTROL

### 8.1 Change Assessment Questions

Every future feature must answer these questions before implementation:

| # | Question | Required Answer |
|---|----------|----------------|
| 1 | What subsystem owns this? | Must map to ownership matrix |
| 2 | What contract changes? | Must be additive or reviewed |
| 3 | What dependencies change? | Must be declared |
| 4 | What engines are reused? | Must reuse certified engines |
| 5 | What canonical facts change? | Must be additive to registry |
| 6 | What consumers change? | Must register in subscription registry |
| 7 | What propagation changes? | Must go through CBSS |
| 8 | What governance changes? | Must respect advisor governance |
| 9 | What certification level? | Must assign level |
| 10 | What rules apply? | Must pass architectural rules |

### 8.2 Change Process

```
1. PROPOSAL
   - Answer all 10 change assessment questions
   - Identify ownership
   - Identify dependencies

2. REVIEW
   - Architectural review against this contract
   - Rule compliance check
   - Reuse verification

3. APPROVAL
   - Kernel changes: platform owner approval
   - Certified changes: architectural review
   - Preview/Experimental: review

4. IMPLEMENTATION
   - Additive only (no breaking changes without deprecation)
   - Reuse certified engines
   - Declare dependencies

5. SHADOW (if sync/propagation)
   - Shadow mode first
   - Compare expected vs actual

6. PILOT (if live behavior)
   - Controlled pilot
   - Telemetry monitoring
   - Circuit breaker protection

7. CERTIFICATION
   - Verify all rules pass
   - Assign certification level
   - Update ownership matrix

8. ACTIVATION
   - Enable for production
   - Monitor telemetry
```

### 8.3 Breaking Change Policy

| Change Type | Policy |
|-------------|--------|
| Additive (new optional field) | Allowed without review |
| Additive (new subsystem) | Review required |
| Breaking (removed field) | Deprecation cycle required |
| Breaking (shape change) | Architectural review + migration plan |
| Semantic change | Architectural review |
| Ownership change | Architectural review + re-certification |

---

## PART 9 — GOVERNING DOCUMENT REFERENCES

This Architecture Contract is the governing document. The following reports are subordinate:

| Report | Phase | Role |
|--------|-------|------|
| `CANONICAL_BUSINESS_INTELLIGENCE_LAYER.md` | 14.2 | Canonical layer blueprint |
| `CANONICAL_FACT_RESOLUTION_REPORT.md` | 14.2A | Read layer certification |
| `CANONICAL_CONSUMER_MIGRATION_REPORT.md` | 14.2B | Consumer migration certification |
| `CANONICAL_EXECUTIVE_BRIEF_BIE_MIGRATION_REPORT.md` | 14.2C | Executive brief migration |
| `CANONICAL_BUSINESS_STATE_SYNCHRONIZATION.md` | 14.3 | CBSS framework |
| `CANONICAL_SHADOW_SYNCHRONIZATION_CERTIFICATION.md` | 14.3A | Shadow sync certification |
| `CANONICAL_LIVE_SYNC_PILOT_REPORT.md` | 14.3B-D | Live sync pilots |
| `CANONICAL_LIVE_DEBT_SYNC_PILOT_REPORT.md` | 14.3C | Debt pilot |
| `CANONICAL_LIVE_CASH_SYNC_PILOT_REPORT.md` | 14.3D | Cash pilot |
| `DERIVED_FACT_FRAMEWORK.md` | 14.4A | Derived fact framework |
| `INTELLIGENCE_DEPENDENCY_ORCHESTRATOR.md` | 14.4B | IDO blueprint |

**All subordinate reports must reference this contract as the governing authority.**

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Platform inventory complete | ✅ Part 1 |
| Ownership contract complete | ✅ Part 2 |
| Engine certification complete | ✅ Part 3 |
| Extension contract defined | ✅ Part 4 |
| API contracts documented | ✅ Part 5 |
| Architectural rules defined (18 rules) | ✅ Part 6 |
| Certification levels defined (4 levels) | ✅ Part 7 |
| Change control defined | ✅ Part 8 |
| Governing document references | ✅ Part 9 |
| No UI redesigned | ✅ |
| No data migrated | ✅ |
| No calculations changed | ✅ |
| No synchronization changed | ✅ |
| No business logic changed | ✅ |

---

## ARCHITECTURE CONTRACT — FROZEN

This contract is the permanent kernel of V.I.S.I.O.N. Every future feature must integrate through this contract. Nothing may bypass certified ownership. Nothing may duplicate existing intelligence. The architecture is now self-governing.

---

## READY FOR PLATFORM CERTIFICATION REVIEW