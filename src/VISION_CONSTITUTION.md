# The V.I.S.I.O.N. Constitution™

**The Permanent Governing Rulebook for the V.I.S.I.O.N. Platform™**

**Date:** 2026-08-10
**Status:** FROZEN — Highest Architectural Authority
**Authority:** This Constitution is the supreme law of the V.I.S.I.O.N. Platform. Every future AI, developer, advisor, and subsystem must follow it. Nothing may violate it. No feature, no engine, no migration, no synchronization may bypass these Articles.

---

## Preamble

V.I.S.I.O.N. has reached Operating System maturity. Before any new autonomous features are built, the platform must establish its permanent governing constitution.

This is not a feature. This is not an engine. This is the **permanent rulebook** that ensures the platform can grow for years without accumulating architectural debt.

The Constitution guarantees:
- One source of truth
- One owner for every business concept
- No duplicated intelligence
- No duplicated calculations
- No duplicated synchronization
- No bypassing governance
- Explainable intelligence
- Advisor-first oversight
- Client-safe boundaries
- Extension over replacement
- Composition over duplication

This is the permanent operating system kernel.

---

## Article I — One Truth

**Business truth exists exactly once.**

Every business fact — revenue, cash, debt, enterprise value, IQ score — exists in exactly one place: the Canonical Fact Registry. No fact is stored twice. No fact has two definitions. No fact has two sources of authority.

Every consumer reads from that truth. When truth changes, every consumer sees the new value. No consumer maintains its own copy of truth. No consumer recalculates truth. No consumer bypasses the canonical resolver.

**Violations of this Article:**
- Storing the same fact in multiple tables
- Calculating a canonical fact in a consumer
- Bypassing the canonical resolver to read a raw source
- Creating a parallel fact store

**Enforcement:** Canonical Fact Registry + Source Hierarchy + Consumer Adapter

---

## Article II — Single Ownership

**Every business concept has one owner.**

No concept is orphaned. No concept has competing owners. No concept is co-owned. The owner is the single system authorized to produce, calculate, or manage that concept.

| Concept | Owner |
|---------|-------|
| Revenue, Cash, Debt, all 50 canonical facts | Canonical Fact Layer |
| Enterprise Value, Equity Value | Valuation Calculation Engine |
| Normalized EBITDA | Valuation Calculation Engine |
| IQ Score, Business Impact Score | Business Intelligence Engine |
| Profit Gap, Value Gap, Tax Gap, Operations Score, Freedom Score | Assessment Engine |
| 6 Build Value Dimensions | Build Value Engine |
| Confidence Scores | Confidence Engine |
| Growth Initiatives | Growth Plan Engine |
| Next Best Action | NBA Engine |
| Sprint Progress | Sprint Aggregation |
| Conversation, Advisory Context | Galileo |
| Synchronization | CBSS |
| Dependency Resolution | IDO |
| Derived Calculations | Certified Calculation Engines |
| Executive Brief Narrative | Executive Narrative Engine |
| Field Provenance | Field Governance |
| Conflict Resolution | Verification Queue |
| Notifications | Notification System |
| Business Context | Business Context Engine |
| User Permissions | Permission System |
| Document Extraction | Document Intelligence |
| Calendar Events | Calendar Sync |
| BIE Snapshots & Journal | BIE Persistence |

**Violations of this Article:**
- Creating a second owner for an existing concept
- A consumer that becomes an owner (recalculating instead of reading)
- Failing to declare an owner for a new concept
- Changing ownership without architectural review

**Enforcement:** Ownership Matrix + Architectural Review

---

## Article III — No Duplicate Intelligence

**Every new feature must reuse certified intelligence.**

Never rebuild what already exists. Never fork an engine. Never bypass a certified calculation. Never create a parallel system for an existing concept.

When a new feature needs a metric, it reads from the owner. When a new feature needs synchronization, it uses CBSS. When a new feature needs dependency resolution, it uses IDO. When a new feature needs a calculation, it calls the certified engine.

**Violations of this Article:**
- Creating a new engine that calculates what an existing engine calculates
- Forking an engine to customize behavior (extend instead)
- Bypassing a certified engine to calculate locally
- Building a parallel intelligence pipeline

**Enforcement:** No Duplicate Engine Rule + Reuse Rule + Architectural Review

---

## Article IV — Explainability

**Every recommendation, synchronization, valuation, prediction, and advisor recommendation must be explainable.**

No black-box metrics. No unexplained values. Every number on the dashboard, every recommendation from Galileo, every valuation output, every sync action must carry its lineage — the chain of derivation from primary sources to the current value.

Lineage is derived from existing audit data. Evidence is available through the EvidenceDrawer. When a user asks "why does it say that?", the platform answers with sources, confidence, and derivation steps.

**Violations of this Article:**
- Displaying a metric without explainability
- Calculating a value without recording lineage
- Hiding the source of a recommendation
- Publishing a valuation without an audit trail

**Enforcement:** Lineage Assembly + EvidenceDrawer + Explainability Rule

---

## Article V — Advisor Governance

**AI assists. Advisors govern. Business owners decide.**

AI proposes, calculates, analyzes, and recommends. The advisor reviews, approves, rejects, or modifies. The business owner provides data and confirms facts.

AI never auto-publishes a valuation. AI never auto-promotes a hypothesis to canonical. AI never overrides an advisor's decision. AI never bypasses the Verification Queue.

Valuation outputs, growth initiatives, and advisor-level decisions always require advisor approval before propagation. The advisor is the trusted authority who validates business truth.

**Violations of this Article:**
- Auto-publishing valuations without advisor approval
- Auto-promoting AI hypotheses to canonical data
- Bypassing the Verification Queue for conflicts
- Allowing AI to override advisor judgment

**Enforcement:** Governance Classification + Review Rule + Field Governance

---

## Article VI — Client Safety

**Nothing internal leaks externally.**

Internal source IDs, raw extraction metadata, internal engine state, and advisor-only evidence are never exposed to clients. Client-safe filtering is mandatory for all client-facing APIs.

The owner sees their dashboard. The advisor sees their workspace. Internal identifiers, raw confidence scores, and engine internals are filtered before reaching the client.

**Violations of this Article:**
- Exposing internal IDs (Supabase row IDs, engine state) to clients
- Showing raw extraction metadata to owners
- Displaying advisor-only evidence to clients
- Bypassing client-safe filtering

**Enforcement:** clientSafe.ts + Client Safe Rule + API Contracts

---

## Article VII — Extension First

**Every new capability should register into existing systems.**

Never create a parallel system. When you need a new capability, register it into the existing registry — Canonical Fact Registry, Subscription Registry, Capability Registry, Methodology Registry, Derived Fact Framework, IDO rules.

Extension is additive. You add a new fact to the registry. You add a new consumer to the subscription registry. You add a new capability to the capability registry. You do not create a new system alongside the existing one.

**Violations of this Article:**
- Creating a parallel system instead of extending the existing one
- Building a standalone intelligence pipeline
- Creating a new registry when an existing one serves the purpose
- Hardcoding behavior instead of registering it

**Enforcement:** Extension Contract + Architectural Review

---

## Article VIII — Canonical First

**Every business fact must resolve through Canonical Facts.**

Every consumer — Dashboard, Galileo, Executive Brief, Reports, Growth Plan, Sprint — reads canonical facts first, falling back to legacy sources only when canonical is unavailable. No consumer may bypass canonical resolution once a fact is in the pilot.

When a new fact enters the Canonical Fact Registry, all consumers migrate to read it. Legacy paths are fallbacks, not primaries. No consumer may treat a legacy source as the primary source for a canonical fact.

**Violations of this Article:**
- Reading a legacy source when a canonical fact is available
- Treating a legacy path as primary for a canonical fact
- Bypassing the consumer adapter
- Hardcoding a source read instead of resolving canonically

**Enforcement:** Consumer Adapter + Canonical First Rule + Consumer Migration

---

## Article IX — Composition Over Duplication

**Compose existing systems. Do not duplicate them.**

When a new feature needs intelligence, it composes existing engines — BIE for composites, Valuation Engine for enterprise value, Growth Plan Engine for initiatives. It does not rebuild the calculation. It does not fork the logic. It composes.

Composition means calling the certified engine and reading its output. Duplication means copying the logic and running it independently. The Constitution forbids duplication.

**Violations of this Article:**
- Copying calculation logic instead of calling the engine
- Duplicating synchronization logic instead of using CBSS
- Reimplementing dependency resolution instead of using IDO
- Building a local intelligence cache instead of reading canonical

**Enforcement:** Reuse Rule + No Duplicate Engine Rule + Architectural Review

---

## Article X — Shadow Before Live

**Every new synchronization starts in shadow mode.**

No synchronization goes directly to live. Shadow mode validates that propagation is correct before it affects production. Live mode is earned through pilot certification, not assumed.

Shadow comparison continues even after a consumer goes live — it is the ongoing validation that live behavior matches expected behavior. If shadow and live diverge, it indicates a bug.

**Violations of this Article:**
- Enabling live sync without shadow certification
- Disabling shadow comparison after going live
- Bypassing the circuit breaker
- Ignoring shadow discrepancies

**Enforcement:** Live Sync Policy + Shadow Sync + Circuit Breaker + Kill Switch

---

## Article XI — Business Isolation

**Every query, event, and sync is scoped by business.**

No cross-business data leakage. Multi-business architecture is strictly isolated. Every query includes business_id. Every event is scoped by business_id. Every sync action is scoped by business_id.

An advisor managing 10 clients never sees client A's data in client B's dashboard. An owner with 3 businesses never sees business 1's valuation in business 2's report.

**Violations of this Article:**
- Querying without business_id scoping
- Propagating events across businesses
- Sharing intelligence across business boundaries
- Bypassing RLS

**Enforcement:** RLS + business_id scoping + Business Isolation Rule

---

## Article XII — Immutable Published Truth

**Published valuations are permanent.**

Once a valuation is published, it is immutable. New versions create new records. The Delta Engine tracks changes between versions. No one — not AI, not the advisor, not the platform owner — can overwrite a published valuation.

Published truth is permanent. It is a legal and financial document. It must not change.

**Violations of this Article:**
- Overwriting a published valuation
- Modifying a published version in place
- Deleting a published valuation
- Bypassing the version system

**Enforcement:** Valuation Service + Version Rule + Delta Engine

---

## Article XIII — The Constitution Is Supreme

**This Constitution is the highest architectural authority.**

No feature, no engine, no migration, no synchronization may violate these Articles. Every future implementation must pass the Architecture Constitution Check before writing code.

If any answer in the Constitution Check indicates duplication or bypassing, implementation STOPS. The certified extension point is recommended instead.

The Constitution may be amended only through architectural review and platform owner approval. The Articles themselves are permanent — they do not expire, they do not degrade, they do not become optional.

**Enforcement:** Architecture Constitution Check + Architectural Review + Platform Owner Approval

---

## Amendment Process

The Constitution may be amended only through:
1. Architectural review
2. Platform owner approval
3. Impact assessment on all subsystems
4. Certification re-verification

The Articles are permanent. New Articles may be added. Existing Articles may not be removed or weakened.

---

## STOP CONDITION

| Requirement | Status |
|-------------|--------|
| Constitutional principles documented | ✅ 17 Articles |
| One Truth | ✅ Article I |
| Single Ownership | ✅ Article II |
| No Duplicate Intelligence | ✅ Article III |
| Explainability | ✅ Article IV |
| Advisor Governance | ✅ Article V |
| Client Safety | ✅ Article VI |
| Extension First | ✅ Article VII |
| Canonical First | ✅ Article VIII |
| Composition Over Duplication | ✅ Article IX |
| Shadow Before Live | ✅ Article X |
| Business Isolation | ✅ Article XI |
| Immutable Published Truth | ✅ Article XII |
| Constitution Supremacy | ✅ Article XIII |
| **Supabase Authority** | ✅ **Article XIV** |
| **Document Persistence Freeze** | ✅ **Article XV** |
| **Decision Authority** | ✅ **Article XV (Decision)** |
| **Outcome Authority** | ✅ **Article XVI** |
| **Business DNA Authority** | ✅ **Article XVII** |
| No features built | ✅ |
| No business logic changed | ✅ |
| No UI redesigned | ✅ |

---

## Article XIV — Supabase Is the Sole Persistent System of Record

**Supabase is the sole authoritative persistence layer for business and platform data in V.I.S.I.O.N.**

Base44 may render, collect, cache, and temporarily hold data, but may never independently own persistent business truth.

Every persistent write must terminate in Supabase.
Every authoritative persistent read must originate from Supabase or a certified service whose source is Supabase.

No future feature may introduce a Base44 Entity as an independent system of record.

### Base44 Persistence Freeze

Base44 MUST NOT create a new persistent Entity for business data if an appropriate Supabase domain exists.

Base44 MUST NOT make a Base44 Entity authoritative for:
- Business facts, financials, assessments, documents, valuation
- Recommendations, planning, business memory, advisor notes
- Reports, conversations, workflow state that must survive across users/sessions

Any proposal to add persistent Base44 storage must:
1. Perform Constitution Check
2. Prove no Supabase owner exists
3. Explain why Supabase cannot own it
4. Obtain explicit platform-owner approval

Without explicit approval: USE SUPABASE.

### No Silent Fallback to Base44

Once a domain is Supabase-certified, Base44 fallback is PROHIBITED.

If Supabase is unavailable: show controlled temporary unavailable state.
Stale data is more dangerous than explicit unavailable data.

**Enforcement:** Supabase Single Source of Truth Migration (Phase A-F) + Constitution Check

---

## Article XV — Document Persistence Freeze

**All persistent documents, document metadata, extracted data, analysis, financial metrics, and document-derived business intelligence are owned by Supabase.**

Base44 may provide the document user interface but may not own persistent document truth.

No Base44 Document entity may become authoritative.

All document consumers must use Supabase-backed certified services.

### Document Ownership Map

| Concept | Supabase Owner | Authority Level |
|--------|---------------|-----------------|
| Document metadata | `documents` table | AUTHORITATIVE |
| Storage object | Supabase Storage (bucket: `documents`) | AUTHORITATIVE |
| Raw / structured extraction | `extracted_fields` table | AUTHORITATIVE |
| Document analysis | `document_analysis` table | AUTHORITATIVE |
| Document business scope | `documents.business_id` | AUTHORITATIVE |
| Document owner / profile | `documents.profile_id` | AUTHORITATIVE |
| Document status | `documents.upload_status` | AUTHORITATIVE |
| Document folder assignment | `documents.extracted_data.system_folder` | AUTHORITATIVE |

### Base44 Document Entity Classification

| Base44 Entity | Classification | Reason |
|--------------|---------------|--------|
| `Document` | SAFE_TO_DEPRECATE | Zero usage in frontend and backend. All document truth is in Supabase. |
| `DocumentClassification` | LEGACY_MIRROR | Stores classification audit metadata only. Document truth (type, scope) is in Supabase `documents` table. Non-authoritative. |
| `DocumentFolder` | TRANSIENT_UI | Custom folder definitions only. Folder assignment is in Supabase `documents.extracted_data.system_folder`. Non-authoritative. |

### Supabase Ownership Within Supabase

A cache must never outrank its source:

| Supabase Table | Authority Level |
|---------------|-----------------|
| `documents` | AUTHORITATIVE — document identity, status, scope |
| `extracted_fields` | AUTHORITATIVE — extraction output |
| `document_analysis` | AUTHORITATIVE — analysis state |
| `assessment_calculations` | AUTHORITATIVE — assessment calculation output |
| `dashboard_metrics` | DERIVED/CACHE/SNAPSHOT — NOT superior to calculation owner |
| `business_metric_snapshots` | HISTORICAL SNAPSHOT — NOT current truth |

### No Silent Base44 Document Fallback

Once a document domain is Supabase-certified, Base44 Document entity fallback is PROHIBITED.

If Supabase is unavailable: show controlled temporary unavailable/retry state.
Stale document data is more dangerous than explicit unavailable data.

**Enforcement:** Supabase Document Authority Migration (Phase B) + Constitution Check

---

## Article XV — Decision Authority

**V.I.S.I.O.N. may structure, analyze, challenge, and recommend around business decisions, but final decision authority remains with an authorized human.**

Decision Intelligence is a governed human decision support layer. It may:
- frame the decision
- collect relevant evidence from certified sources
- identify options, assumptions, risks, and unknowns
- compare tradeoffs
- show financial/business implications
- recommend an option (advisory only)
- identify missing information
- surface historical context
- record the final human decision

Decision Intelligence may NOT:
- automatically approve a decision
- execute a transaction
- alter Valuation
- create financial commitments
- change ownership
- publish something externally
- assign high-risk actions
- spend money
- legally bind the business

Confirmed decisions route into existing certified execution systems (Growth Plan, Sprint, Roadmap, Verification Queue, Valuation, Document Requests). Decision Intelligence does not create a parallel execution engine.

Decision-time evidence and reasoning are preserved historically. When current business facts change after a decision is made, the historical decision context is NOT silently rewritten. The decision record preserves `source_contract_version` and `source_context_snapshot` for reproducibility.

**Violations of this Article:**
- AI silently marking a decision as DECIDED without human action
- Decision Intelligence executing a transaction or commitment directly
- Rewriting historical decision context when current facts change
- Creating a parallel execution engine instead of routing to existing systems

**Enforcement:** Decision Intelligence Coordinator + Human Finalization + Supabase `business_decisions` table (RLS-enforced, backend-mediated)

---

## Article XVI — Outcome Authority

**V.I.S.I.O.N. may analyze evidence and recommend an outcome classification, but only an authorized human may confirm whether a business decision succeeded, partially succeeded, failed, remains ongoing, or is inconclusive.**

Decision Outcome Intelligence is a governed retrospective intelligence layer. It may:
- compare expected outcomes to current evidence from the Shared Intelligence Contract
- analyze what improved, what did not, and what was unexpected
- identify assumptions that held and assumptions that failed
- surface possible lessons as Business Memory candidates
- suggest an outcome status (advisory only)
- recommend a follow-up action or follow-up decision

Decision Outcome Intelligence may NOT:
- set the final outcome_status (humans own this)
- automatically create Verified Business Value Created
- auto-promote lessons to durable Business Memory
- rewrite historical decision-time or review-time context
- force a success/failure judgment when evidence is insufficient or too early

Decision-time and outcome-review-time context must remain historically reproducible. Later business changes must not rewrite what was known at the time of the decision or at the time of the outcome review.

Lessons may become governed Business Memory candidates but are never silently promoted to durable truth.

**Violations of this Article:**
- AI silently marking a decision as succeeded or failed without human confirmation
- Automatically creating Verified Business Value Created from a decision outcome
- Auto-promoting outcome lessons to Business Memory without advisor confirmation
- Rewriting historical decision context or review-time state when current facts change
- Forcing a success/failure judgment when the outcome is too early or inconclusive

**Enforcement:** Outcome Intelligence Coordinator + Human Outcome Confirmation + Supabase `business_decisions` outcome fields (outcome_status, outcome_reviewed_at, outcome_notes, actual_outcomes — all RLS-enforced, backend-mediated)

---

## Article XVII — Business DNA Authority

**Business DNA is governed derived intelligence describing durable patterns observed across certified business evidence. Business DNA is never authoritative source truth.**

Business DNA may synthesize patterns from certified systems but may not override, rewrite, or independently recalculate authoritative facts, metrics, memories, decisions, outcomes, valuation results, assessments, or historical events.

Every Business DNA assertion must remain traceable to evidence, confidence, provenance, business scope, and time.

### What Business DNA Is

Business DNA answers: "What durable patterns explain how this particular business creates value, operates, makes decisions, depends on its owner, encounters risk, and evolves over time?"

Business DNA is DERIVED INTELLIGENCE. It synthesizes patterns across:
- Shared Intelligence Contract (current metrics)
- Business Memory (confirmed context)
- Timeline (events)
- Decisions and Decision Outcomes
- Valuation (value drivers)
- Growth Plan / Sprint / Roadmap (execution)
- Value Creation Events (verified value)
- Assessments (scores and gaps)

### What Business DNA Is NOT

Business DNA is NOT:
- raw facts or current metrics (Shared Contract owns those)
- an assessment or score (Assessment Engine owns those)
- Business Memory (memory stores confirmed context; DNA derives patterns)
- Timeline (timeline records events; DNA synthesizes patterns across events)
- Decision Intelligence (decisions frame choices; DNA synthesizes across decisions)
- Valuation (valuation calculates value; DNA describes value sensitivity)
- Business Twin (simulation/prediction — reserved for future)
- a master DNA score (no single score — DNA describes patterns)

### No Master DNA Score

Business DNA MUST NOT produce a single composite "DNA Score." Business IQ, assessment scores, operations score, and valuation confidence already exist. Another score would create semantic confusion. DNA describes patterns, not a score.

### Owner DNA Safety

Owner DNA describes the RELATIONSHIP between the owner and the business. It is NOT a psychological profile.

Allowed: "Owner approves 90% of large expenditures." "Owner remains primary rainmaker."

NOT allowed: "Owner is controlling." "Owner has anxiety around delegation." "Owner is narcissistic."

No psychological diagnosis, personality traits, or speculative personal attributes. Only observable business dependency patterns.

### Evidence Lineage

Five copies of the same metric are NOT five pieces of evidence. Evidence lineage deduplication prevents confidence inflation. Multiple systems rendering the same underlying fact count as ONE independent evidence source.

### No Silent Promotion

AI may propose candidate patterns. Promotion to ESTABLISHED follows deterministic rules: multiple independent evidence sources AND sufficient temporal durability AND no unresolved material contradiction. No candidate may silently become established.

### Contradictions Preserve History

When new evidence contradicts an existing pattern, the old pattern is NOT silently overwritten. It is marked WEAKENING or CONTESTED. A new candidate pattern is created. Historical patterns are preserved for evolution analysis.

**Violations of this Article:**
- Business DNA overriding or recalculating authoritative facts
- Creating a master DNA score
- Owner DNA containing psychological profiling
- Counting duplicate evidence lineages as independent sources
- AI silently promoting a candidate to ESTABLISHED
- Silently overwriting a contradicted pattern instead of marking it WEAKENING/CONTESTED
- Creating separate DNA family tables instead of using one table
- Business DNA creating Verified Business Value directly

**Enforcement:** Business DNA Coordinator + Deterministic Qualification + Evidence Lineage Dedup + Supabase `business_dna_patterns` table (RLS-enforced, backend-mediated) + Architecture Guard

---

## READY FOR CONSTITUTION REVIEW

*This Constitution is the permanent operating system kernel of V.I.S.I.O.N. It does not expire. It does not degrade. It is the rulebook for every future builder.*