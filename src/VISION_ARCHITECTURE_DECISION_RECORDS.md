# V.I.S.I.O.N. Platform™ — Architecture Decision Records (ADR)

**Date:** 2026-08-10
**Status:** Living Document
**Authority:** Companion to the V.I.S.I.O.N. Constitution

---

## Purpose

Architecture Decision Records (ADRs) capture the WHY behind every major architectural choice in V.I.S.I.O.N. Future developers must understand not only WHAT was built, but WHY it was built that way — so they do not undo hard-won lessons.

Each ADR follows the format:
- **Context** — the situation that required a decision
- **Decision** — what was decided
- **Alternatives Considered** — what other options were evaluated
- **Why This Decision Won** — the rationale for choosing this over alternatives
- **Tradeoffs** — what was sacrificed or accepted
- **Future Implications** — what this means for future development
- **Status** — current state of the decision

---

## ADR-001: Canonical Facts Exist

**Phase:** 14.2
**Status:** ACCEPTED

### Context
Business facts were duplicated across 2.4 tables on average. Revenue appeared in 5 tables. EBITDA was derived in 3+ places. When a source changed, consumers fell out of sync. There was no single source of truth.

### Decision
Create a Canonical Fact Registry — 50 business facts, each existing exactly once, with a declarative contract defining source candidates, source priority, verification requirements, and consumers.

### Alternatives Considered
1. **Centralized data warehouse** — ETL all facts into a single warehouse table. Rejected: would require new storage, new ETL pipeline, and would duplicate existing source tables.
2. **Event sourcing** — Treat every fact change as an event, replay to build current state. Rejected: over-engineered for the problem; the issue was duplication, not event history.
3. **Graph database** — Store facts as nodes with relationships. Rejected: introduced new infrastructure; lineage could be derived from existing audit data.
4. **Canonical Fact Registry (chosen)** — Declarative registry mapping to existing primary sources. No new storage. Reuses existing source priority resolution.

### Why This Decision Won
- No new storage — the registry maps to existing tables
- Source priority resolution was already implemented (intelligenceEngine) — formalizing it was additive
- Minimal infrastructure change — configuration, not migration
- Directly addressed the root cause (duplication)

### Tradeoffs
- Consumers must migrate to read canonical (incremental, ongoing)
- Legacy paths must be maintained as fallback during migration
- The registry is configuration, not enforcement — discipline is required

### Future Implications
- Every new fact must be registered before activation
- Consumer migration is incremental — not all consumers are migrated yet
- Valuation migration is deferred (Phase 14.2D)
- The registry becomes the single reference for all business facts

---

## ADR-002: IDO Exists

**Phase:** 14.4B
**Status:** ACCEPTED

### Context
When a fact changed, there was no coordinator to determine what must happen next. Each consumer had its own refresh logic. Dependency chains were implicit, not declarative.

### Decision
Create the Intelligence Dependency Orchestrator (IDO) — a coordination layer that determines what must happen when facts change, routing each action to the correct certified owner engine.

### Alternatives Considered
1. **Per-consumer refresh logic** — Each consumer determines its own dependencies. Rejected: led to scattered, inconsistent dependency logic; no single place understood full impact.
2. **Event bus with consumer subscriptions** — Publish events, consumers subscribe. Rejected: already exists (CBSS subscription registry); the missing piece was dependency coordination, not event delivery.
3. **Monolithic orchestrator that calculates** — A central engine that both coordinates and calculates. Rejected: violates One Owner principle; the orchestrator must never calculate.
4. **IDO as coordinator only (chosen)** — IDO determines what must happen and routes to owner engines. It never calculates. It never owns truth.

### Why This Decision Won
- Preserves the One Owner principle — IDO coordinates, engines calculate
- Reuses existing IntelligenceGraph and stalenessMap
- Centralizes dependency logic in one declarative place
- Blueprint-only in Phase 14.4B — safe, no production risk

### Tradeoffs
- IDO is blueprint-only — execution deferred to future phases
- Adds a coordination layer (additional indirection)
- Requires engines to declare dependencies explicitly

### Future Implications
- Every derived fact must declare its dependencies through IDO
- No feature may bypass IDO for dependency resolution (Constitution Article III)
- IDO will become the single entry point for all fact-change-driven actions

---

## ADR-003: CBSS Exists

**Phase:** 14.3
**Status:** ACCEPTED

### Context
There was no governed way to propagate fact changes to consumers. Each consumer had its own refresh trigger. There was no shadow mode to validate propagation before going live. There was no kill switch.

### Decision
Create the Canonical Business State Synchronization (CBSS) framework — a shadow-mode orchestration layer that observes fact changes, classifies propagation decisions, and records sync actions without mutating production engines.

### Alternatives Considered
1. **Direct consumer writes** — When a fact changes, write directly to consumer tables. Rejected: no audit trail, no governance, no kill switch, high risk of inconsistency.
2. **Pub/sub with immediate propagation** — Publish events, consumers immediately update. Rejected: no shadow validation, no way to catch bugs before production.
3. **Batch recalculation** — Periodically recalculate all consumers. Rejected: not real-time, stale data between batches.
4. **CBSS with shadow mode (chosen)** — Observe, classify, record. Shadow first, live later. Kill switch always available.

### Why This Decision Won
- Shadow mode provides a safety net — observe before acting
- Centralized policy controls which combinations are live
- Circuit breakers protect each consumer independently
- Global kill switch is the ultimate safety net
- Reuses existing stalenessMap and BIE journal

### Tradeoffs
- Additional infrastructure (12 modules)
- Shadow comparison has a small performance cost
- Live mode is limited to 6 combinations (revenue, debt, cash × dashboard, galileo)

### Future Implications
- All synchronization must go through CBSS (Constitution Article X)
- New fact+consumer combinations start in shadow, earn live through pilot certification
- The kill switch is always one flip away

---

## ADR-004: Valuation Remains Owner of Enterprise Value

**Phase:** 13.3
**Status:** ACCEPTED

### Context
Enterprise Value is the primary valuation output. Multiple systems needed to read it (Dashboard, BIS, Reports, Growth Plan, Executive Brief). There was pressure to calculate it in BIE or Dashboard for convenience.

### Decision
The Valuation Calculation Engine is the ONE owner of Enterprise Value. All other systems read from it. No other engine may calculate enterprise value.

### Alternatives Considered
1. **BIE calculates enterprise value** — BIE already composites metrics; add EV as a composite. Rejected: BIE is automatic (no advisor judgment); EV requires advisor approval. Violates Article V.
2. **Dashboard calculates enterprise value** — Calculate locally for display. Rejected: violates One Owner principle; risks inconsistent EV across displays.
3. **Each consumer calculates independently** — Let each system compute EV from its own inputs. Rejected: 5 tables already duplicated revenue; duplicating EV would be worse.
4. **Valuation Engine owns EV (chosen)** — The certified engine with reconciliation logic is the single owner. All others read.

### Why This Decision Won
- Valuation is advisor-governed — it requires advisor approval before publication
- BIE is automatic — it cannot own advisor-governed outputs
- The Valuation Engine has the certified reconciliation logic (multiple methods, weights)
- Duplicating the calculation would risk inconsistent enterprise values

### Tradeoffs
- BIE cannot produce EV autonomously — it must wait for Valuation Engine output
- Dashboard displays EV only when the Valuation Engine has produced it
- Growth Plan reads EV from Valuation Engine output (dependency)

### Future Implications
- Enterprise Value is always advisor_review — never automatic (Constitution Article V)
- Published valuations are immutable (Constitution Article XII)
- The Delta Engine tracks changes between versions
- No future system may calculate EV independently

---

## ADR-005: Shadow Mode Exists

**Phase:** 14.3A
**Status:** ACCEPTED

### Context
Live propagation of fact changes was risky — there was no way to validate that propagation would be correct before enabling it. Going directly to live could cause data inconsistency, refresh storms, or cross-business leakage.

### Decision
All new synchronization starts in shadow mode. Shadow mode observes what would happen if propagation were live, records the expected actions, and compares them against actual engine behavior — without mutating production.

### Alternatives Considered
1. **Direct to live** — Enable propagation immediately. Rejected: no way to catch bugs before production; high risk of data inconsistency.
2. **Canary deployment** — Enable for 1% of users, monitor, expand. Rejected: the risk is per-fact+consumer, not per-user; canary doesn't address the right dimension.
3. **Feature flags per consumer** — Flag-gated propagation. Rejected: scattered flags, no centralized policy, no shadow comparison.
4. **Shadow mode with centralized policy (chosen)** — Observe first, compare, then go live through controlled pilot.

### Why This Decision Won
- Shadow mode provides a safety net — observe before acting
- It allows comparison of expected vs actual behavior
- It caught 4 bugs in Phase 14.3A (consumer classification, dedup, ordering, cycles)
- It enables gradual, controlled rollout of live synchronization

### Tradeoffs
- Shadow comparison has a small performance cost
- Shadow mode adds infrastructure (ShadowSync module)
- Live pilots are limited — shadow continues even for live consumers

### Future Implications
- Every new synchronization starts in shadow (Constitution Article X)
- Shadow comparison continues even after going live (ADR-017)
- The kill switch returns everything to shadow instantly

---

## ADR-006: Consumer Migration Is Incremental

**Phase:** 14.2B
**Status:** ACCEPTED

### Context
Migrating all consumers to canonical facts at once would be high-risk — a single bug could affect every consumer simultaneously. There was no way to validate the migration incrementally.

### Decision
Consumer migration is incremental. One consumer at a time (Galileo first, then Dashboard, then Executive Brief, then BIE). Each migration is additive — canonical values are preferred, legacy values remain as fallback.

### Alternatives Considered
1. **Big-bang migration** — Migrate all consumers at once. Rejected: a single bug affects all consumers; no way to isolate failure.
2. **No migration** — Keep legacy paths forever. Rejected: defeats the purpose of canonical facts; duplication persists.
3. **Consumer-by-consumer with legacy removal** — Migrate one consumer, remove legacy. Rejected: removing legacy before all consumers are migrated risks breaking unmigrated consumers.
4. **Incremental, additive migration (chosen)** — One consumer at a time, canonical preferred, legacy preserved as fallback.

### Why This Decision Won
- Incremental migration limits blast radius — a bug affects one consumer, not all
- Additive migration (canonical preferred, legacy fallback) means no breaking changes
- Each migration is independently certified before moving to the next
- Legacy paths are preserved until all consumers are migrated and verified

### Tradeoffs
- Legacy paths must be maintained during migration (temporary duplication)
- Migration takes multiple phases (14.2B, 14.2C, 14.2D)
- Valuation migration is deferred — not all consumers are migrated yet

### Future Implications
- Each new consumer migration follows the same pattern (canonical preferred, legacy fallback)
- Legacy removal happens only after all consumers are migrated and verified
- The Consumer Adapter is the shared migration tool

---

## ADR-007: Propagation Is Governed

**Phase:** 14.3
**Status:** ACCEPTED

### Context
There was pressure to auto-propagate all fact changes to all consumers immediately. This would be fast but unsafe — low-confidence values, conflicts, and unverified inputs would reach consumers.

### Decision
Propagation is governed. Every fact change is classified into one of four categories: automatic, advisor_review, verification_required, blocked. Only automatic changes propagate immediately. All others require advisor action.

### Alternatives Considered
1. **Auto-propagate everything** — All changes propagate immediately. Rejected: low-confidence values and conflicts would pollute consumer displays.
2. **Manual propagation only** — Every change requires advisor action. Rejected: too slow for automatic composites (IQ Score, BIS); advisor would be overwhelmed.
3. **Confidence-threshold only** — Propagate if confidence > threshold. Rejected: doesn't handle conflicts or governance locks.
4. **Four-category governance (chosen)** — Automatic, advisor_review, verification_required, blocked.

### Why This Decision Won
- Not all truth is equal — a verified tax return is more trustworthy than an owner estimate
- Auto-propagating low-confidence values would pollute consumer displays
- Conflicts must be resolved by the advisor, not auto-resolved
- Governance protects the advisor's authority over business intelligence

### Tradeoffs
- Some changes require advisor action (slower than auto-propagation)
- The advisor must monitor the Verification Queue
- BIE composites are always automatic — no advisor judgment needed (good)

### Future Implications
- High-confidence (≥85) changes propagate automatically
- Medium-confidence (65-84) changes require advisor review
- Low-confidence (<65) or conflicting changes route to Verification Queue
- Valuation is always advisor_review — never automatic (Constitution Article V)

---

## ADR-008: Advisor Review Exists

**Phase:** 13.3
**Status:** ACCEPTED

### Context
AI could potentially auto-publish valuations, auto-approve add-backs, and auto-promote hypotheses. This would be fast but would remove the advisor from the loop — the advisor is the trusted authority who validates business truth.

### Decision
Advisor review is required for all valuation outputs, growth initiatives, and advisor-level decisions. AI never auto-publishes, never auto-promotes, never overrides advisor judgment.

### Alternatives Considered
1. **Full autonomy** — AI auto-publishes, auto-approves. Rejected: AI can be wrong; auto-publishing would risk incorrect valuations; removes the advisory relationship.
2. **Auto-publish with confidence threshold** — Auto-publish if confidence > 90%. Rejected: even high-confidence AI can be wrong; the advisor's judgment is the trust signal.
3. **Auto-publish with rollback** — Publish, then rollback if advisor disagrees. Rejected: published valuations are immutable (ADR-011); rollback is not possible.
4. **Advisor review required (chosen)** — AI proposes, advisor decides.

### Why This Decision Won
- The advisor is the trusted authority — they validate business truth
- AI can be wrong — auto-publishing would risk incorrect valuations
- The owner trusts the advisor, not the AI — the advisor's approval is the trust signal
- Removing the advisor from the loop would eliminate the advisory relationship

### Tradeoffs
- Publication is slower (requires advisor action)
- The advisor must actively review and approve
- AI cannot operate autonomously for governance-classified decisions

### Future Implications
- Valuation publication requires advisor approval (Constitution Article V)
- Growth initiatives require advisor approval
- AI hypotheses are recommendations, not canonical data
- AI extraction outputs are pending recommendations, not direct edits

---

## ADR-009: Galileo Is the Single AI Interface

**Phase:** 13.4
**Status:** ACCEPTED

### Context
There was pressure to create separate AI panels for valuation, executive brief, sprint planning, and advisory. Multiple AI interfaces would fragment the experience and dilute the intelligence layer.

### Decision
Galileo is the SINGLE AI interface for the entire platform. All AI interaction — advisory, valuation, executive brief, sprint planning — flows through Galileo. No separate chatbots or AI panels.

### Alternatives Considered
1. **Multiple specialized AI panels** — One per domain (valuation AI, sprint AI, etc.). Rejected: fragments the experience, dilutes intelligence, creates inconsistent contexts.
2. **Third-party AI integration** — Embed ChatGPT/Claude directly. Rejected: no access to canonical facts, no governance, no scoped context.
3. **No AI interface** — Just dashboards and reports. Rejected: the platform's value is advisory intelligence; without AI, it's just a dashboard.
4. **Galileo as single interface (chosen)** — One AI, all domains, scoped context, unified history.

### Why This Decision Won
- A single AI interface provides a consistent user experience
- Intelligence is centralized — Galileo reads from all certified engines
- Conversation history is unified — no fragmented context
- The advisor builds a relationship with one AI, not many

### Tradeoffs
- Galileo must handle all domains (complex context building)
- No domain-specific AI customization (all through one interface)
- Galileo's context builder must be comprehensive

### Future Implications
- All AI features integrate through Galileo (Constitution Article IX)
- Valuation intelligence operates through Galileo's conversation and context
- No separate AI panels are created
- Galileo does not own business facts — it reads canonical facts and explains them

---

## ADR-010: BIE Is the Composite Intelligence Owner

**Phase:** 9
**Status:** ACCEPTED

### Context
Composite intelligence metrics (IQ Score, Business Impact Score) were calculated in multiple places — Dashboard, BIS, and individual components. When inputs changed, the composite would be inconsistent across displays.

### Decision
The Business Intelligence Engine (BIE) is the ONE owner of composite intelligence metrics. All consumers read from BIE output. No other system may calculate IQ Score or Business Impact Score.

### Alternatives Considered
1. **Each component calculates its own composite** — Local calculation. Rejected: inconsistent IQ Scores across displays.
2. **Dashboard calculates and broadcasts** — Dashboard owns the composite. Rejected: Dashboard is a consumer, not an owner; violates One Owner principle.
3. **Server-side composite only** — Calculate on the server, client reads. Rejected: BIE already runs client-side with backend hydration; server-only would add latency.
4. **BIE as single owner (chosen)** — BIE calculates, all consumers read.

### Why This Decision Won
- Composite metrics must be consistent across all displays
- BIE has the certified weighting logic (profit, value, tax, operations, freedom, recast)
- BIE produces BusinessIntelligenceMetric objects with provenance, confidence, and dependencies
- Duplicating the calculation would risk inconsistent IQ Scores

### Tradeoffs
- BIE must be rebuilt when inputs change (client-side computation)
- All consumers depend on BIE output (tight coupling to BIE)
- BIE is Kernel — cannot be replaced

### Future Implications
- IQ Score and Business Impact Score are calculated once by BIE
- Dashboard, Executive Brief, and Galileo all read from BIE output
- BIE is automatic (no advisor judgment) — composites recalculate immediately
- BIE produces snapshots and journal entries for audit trail

---

## ADR-011: Published Valuations Are Immutable

**Phase:** 13.3
**Status:** ACCEPTED

### Context
Valuations could potentially be overwritten when new data came in. This would eliminate the historical record and make it impossible to track how the valuation changed over time.

### Decision
Published valuations are immutable. New versions create new records. The Delta Engine tracks changes between versions. No one — not AI, not the advisor, not the platform owner — can overwrite a published valuation.

### Alternatives Considered
1. **Overwrite on update** — Update the published valuation when new data arrives. Rejected: eliminates historical record; legal/financial documents must be permanent.
2. **Soft delete and replace** — Mark old as deleted, create new. Rejected: deletes the audit trail; "deleted" published valuations are confusing.
3. **Versioning with overwrite allowed** — Version but allow overwriting the latest. Rejected: the latest published version must also be immutable once published.
4. **Immutable versioning (chosen)** — New versions create new records; published versions are permanent.

### Why This Decision Won
- Published valuations are legal/financial documents — they must be permanent
- The historical record is essential for audit and trust
- Versioning allows tracking how the business value evolved
- The Delta Engine provides explainability — what changed between versions

### Tradeoffs
- More storage (multiple versions per valuation)
- The advisor must publish a new version to update (not just edit)
- Reports reference specific versions (must track which version)

### Future Implications
- `business_valuations.status` tracks lifecycle (draft → assigned → published)
- Publishing creates a new `valuation_versions` record
- Prior published versions remain immutable (Constitution Article XII)
- The Delta Engine compares versions for explainability

---

## ADR-012: The Enterprise Journey Precedes Authentication

**Phase:** 4
**Status:** ACCEPTED

### Context
Most platforms require login before showing any value. This creates a barrier — potential clients leave before experiencing the platform's intelligence. V.I.S.I.O.N. needed to show value before asking for commitment.

### Decision
The Enterprise Journey allows unauthenticated exploration. Guests can complete assessments, see their dashboard, and experience the intelligence before creating an account. The "Invisible Threshold" routes guests to the Journey and members to the Dashboard seamlessly.

### Alternatives Considered
1. **Login first** — Require authentication before any access. Rejected: creates a barrier; potential clients leave before experiencing value.
2. **Marketing page only** — Static landing page, no interactive intelligence. Rejected: doesn't show the platform's real value.
3. **Free trial with login** — Sign up for a free trial. Rejected: still requires commitment before experiencing intelligence.
4. **Enterprise Journey with Invisible Threshold (chosen)** — Unauthenticated exploration, seamless routing for members.

### Why This Decision Won
- Showing value first increases conversion
- The advisory relationship starts with exploration, not commitment
- Guests can experience the intelligence without friction
- The "Invisible Threshold" ensures members never see the Journey

### Tradeoffs
- Guest data is temporary (anonymous session) — must be saved to persist
- Some features require authentication (sprint, calendar, agreements)
- The Invisible Threshold requires careful auth state management

### Future Implications
- Unauthenticated users see the Enterprise Journey
- Guests can complete assessments with anonymous sessions
- Save Progress Modal invites guests to create an account
- Authenticated users never see the Journey — they go to their role-based destination

---

## ADR-013: Multi-Business Architecture

**Phase:** 4
**Status:** ACCEPTED

### Context
Advisors manage multiple businesses. Owners may own multiple entities. The platform needed to support multiple businesses per user with strict isolation between them.

### Decision
Multi-business architecture: every user can have multiple businesses. Every query, event, and sync is scoped by business_id. The Business Context Engine manages the active business. RLS enforces isolation.

### Alternatives Considered
1. **Single business per user** — One business per account. Rejected: advisors manage multiple clients; owners have multiple entities.
2. **Shared business pool** — All businesses visible to all users. Rejected: massive security risk; cross-client data leakage.
3. **Multi-business without isolation** — Multiple businesses but no strict scoping. Rejected: cross-business leakage; violates client trust.
4. **Multi-business with strict isolation (chosen)** — Multiple businesses, every query scoped by business_id, RLS enforced.

### Why This Decision Won
- Advisors need to switch between client businesses
- Owners may have multiple entities (operating company + holding company)
- Cross-business data leakage would be a critical security failure
- Business context must be explicit, never guessed

### Tradeoffs
- Every query must include business_id (developer discipline)
- RLS must be configured per table (manual in Supabase)
- Business Context Engine adds a layer of state management

### Future Implications
- Every query includes business_id scoping (Constitution Article XI)
- CBSS events are scoped by business_id — no cross-business propagation
- Canonical facts are resolved per business
- RLS enforces isolation at the database level

---

## ADR-014: Executive Sessions (Not Credits)

**Phase:** 13.4B
**Status:** ACCEPTED

### Context
The platform needed a way to govern advanced AI usage. Calling them "credits" or "tokens" felt transactional and devalued the advisory relationship.

### Decision
Rename internal references from credits/tokens/usage to "Executive Sessions." Executive sessions are consumed only when advanced reasoning occurs — simple conversations are free.

### Alternatives Considered
1. **Credits/tokens** — Standard SaaS terminology. Rejected: feels transactional, devalues the advisory relationship.
2. **Unlimited AI** — No limits on AI usage. Rejected: no governance on advanced reasoning; cost and abuse risk.
3. **Per-question pricing** — Charge per question. Rejected: too granular, feels nickel-and-dime.
4. **Executive Sessions (chosen)** — Advisory terminology, consumed only for advanced reasoning.

### Why This Decision Won
- "Executive Sessions" reflects the advisory nature of the platform
- Credits/tokens feel transactional — Executive Sessions feel consultative
- Simple conversations should be free — advanced reasoning consumes a session
- This aligns with the advisor-augmented philosophy

### Tradeoffs
- The Earned Session Engine adds complexity
- Users must understand what consumes a session vs. what is free
- Preview Mode shows high-level findings without consuming a session

### Future Implications
- All internal references use "Executive Sessions" (Constitution preference)
- The Earned Session Engine grants sessions based on platform activity
- Preview Mode shows high-level findings without consuming a session
- Strategic reasoning consumes a session only when the user engages deeply

---

## ADR-015: No Hardcoded Fallback Values

**Phase:** 9
**Status:** ACCEPTED

### Context
Dashboard components had hardcoded fallback values (e.g., "assume $500K revenue if missing", "assume 10 hours/week freedom"). These fabricated data points made the dashboard look populated but were not real business intelligence.

### Decision
Remove all hardcoded fallback values. Metrics show empty states when data is missing. No fabricated data. No speculative backfilling.

### Alternatives Considered
1. **Keep hardcoded fallbacks** — Show a default value when data is missing. Rejected: fabricated data is misleading; looks real but isn't.
2. **Show zero** — Display 0 when data is missing. Rejected: 0 is a real value; misleading.
3. **Show "N/A"** — Display N/A. Rejected: doesn't drive action; "Complete assessment to see" is better.
4. **Empty states (chosen)** — Show "—" or "Complete assessment to see" when data is missing.

### Why This Decision Won
- Fabricated data is misleading — it looks real but isn't
- The advisor and owner need to know what's missing, not see fake numbers
- Empty states drive action (complete the assessment, upload the document)
- Hardcoded values risk being mistaken for real intelligence

### Tradeoffs
- The dashboard looks less populated when data is missing
- Users must complete assessments/upload documents to see metrics
- No "demo mode" with fake data

### Future Implications
- Dashboard shows "—" or "Complete assessment to see" when data is missing (Constitution Article VIII)
- No hardcoded revenue, freedom hours, or impact scores
- Gap Dashboard cards show empty state messages
- The Evidence Rule codifies this

---

## ADR-016: Field-Level Governance for Valuation

**Phase:** 13.3G
**Status:** ACCEPTED

### Context
Valuation fields could be edited by anyone with access. There was no way to track who changed what, when, or why. There was no way to lock fields that were finalized.

### Decision
Field-Level Governance: every valuation field has an owner, a lock state, a source of truth, and an audit trail. AI never writes directly to governed fields — it produces recommendations that require advisor approval.

### Alternatives Considered
1. **No field governance** — Anyone with access can edit any field. Rejected: no audit trail; no accountability; no way to lock finalized fields.
2. **Role-based only** — Only admins can edit valuation fields. Rejected: doesn't track which advisor owns which field; no lock state.
3. **Version-level governance** — Governance at the version level, not field level. Rejected: too coarse; can't lock individual fields while others are in progress.
4. **Field-level governance (chosen)** — Every field has an owner, lock state, source of truth, and audit trail.

### Why This Decision Won
- Valuation is a financial/legal document — changes must be auditable
- The advisor who owns a field should control it
- Locking prevents accidental or unauthorized changes
- AI recommendations must be approved before becoming canonical

### Tradeoffs
- Additional entities (ValuationFieldGovernance, ValuationChangeRequest)
- More complex editing flow (lock/unlock, change requests)
- AI cannot write directly — must go through approval

### Future Implications
- `ValuationFieldGovernance` entity tracks field ownership and lock state
- `ValuationChangeRequest` entity allows read-only users to request changes
- The EvidenceDrawer displays field provenance and audit trail
- AI extraction outputs are `pending` recommendations — never direct edits (Constitution Article V)

---

## ADR-017: Shadow Comparison Continues for Live Consumers

**Phase:** 14.3B
**Status:** ACCEPTED

### Context
Once a consumer went live, there was a temptation to stop shadow comparison. But shadow comparison is what validates that live propagation is correct — stopping it would remove the safety net.

### Decision
Shadow comparison continues for ALL consumers, even live ones. For live consumers, shadow comparison validates that the live action matches the expected shadow action. For shadow consumers, it records what would happen.

### Alternatives Considered
1. **Stop shadow after going live** — Disable shadow comparison once live. Rejected: removes the safety net; no way to detect drift.
2. **Periodic shadow check** — Run shadow comparison weekly. Rejected: bugs between checks go undetected; not real-time.
3. **Shadow only on failure** — Run shadow comparison only when live fails. Rejected: by the time live fails, damage is done.
4. **Continuous shadow comparison (chosen)** — Shadow runs for all consumers, always.

### Why This Decision Won
- Shadow comparison is the ongoing validation mechanism
- If live behavior diverges from shadow, it indicates a bug
- Removing shadow comparison would eliminate the ability to detect drift
- Shadow comparison has negligible performance cost

### Tradeoffs
- Shadow comparison runs continuously (small performance cost)
- Shadow discrepancies must be investigated
- Additional storage for shadow records

### Future Implications
- Every live sync action has a corresponding shadow comparison
- Shadow discrepancies are logged and investigated
- The shadow comparison infrastructure (ShadowSync) runs for all consumers
- Live consumers are never "blind" — they always have shadow validation (Constitution Article X)

---

## ADR-018: The Kill Switch

**Phase:** 14.3B
**Status:** ACCEPTED

### Context
Live synchronization, once enabled, could be difficult to roll back if something went wrong. There needed to be a single, instant way to return everything to shadow mode.

### Decision
A global kill switch (`CANONICAL_LIVE_SYNC_ENABLED`) can return ALL synchronization to shadow mode instantly. No data repair. No migration. Just flip the switch.

### Alternatives Considered
1. **No kill switch** — Once live, always live. Rejected: no way to roll back; high risk.
2. **Per-consumer rollback** — Roll back one consumer at a time. Rejected: slow; if there's a systemic issue, you need to roll back everything now.
3. **Data repair scripts** — Run scripts to fix data after a bad sync. Rejected: complex, error-prone, slow.
4. **Global kill switch (chosen)** — One switch, instant rollback, no data repair.

### Why This Decision Won
- Live synchronization carries risk — the kill switch is the ultimate safety net
- Data repair after a bad sync is complex and error-prone
- The kill switch is instant and reversible
- It provides confidence to enable live pilots — if anything goes wrong, flip the switch

### Tradeoffs
- The kill switch is all-or-nothing (can't selectively roll back)
- Flipping the switch returns ALL 6 live combinations to shadow
- Re-enabling requires the pilot business cohort to be set

### Future Implications
- `liveSyncPolicy.isLive()` checks the kill switch first
- Setting the switch to false returns all live combinations to shadow
- Setting it back to true re-enables live for pilot businesses
- No data is lost — shadow mode continues recording (Constitution Article X)

---

## ADR-019: Point-in-Time vs Period-Based Facts

**Phase:** 14.3C
**Status:** ACCEPTED

### Context
Revenue is period-based (FY2024, TTM) — it has a reporting period. Debt and Cash are point-in-time (balance as of a specific date) — they have an effective date. Treating them the same would cause incorrect staleness decisions.

### Decision
Event qualification distinguishes point-in-time facts from period-based facts. Period-based facts use `isReportingPeriodValid` (rejects >3 years old). Point-in-time facts use `isPointInTimeDateValid` (no "too old" check — historical balances are valid for as-of context).

### Alternatives Considered
1. **Treat all facts the same** — Use period-based validation for everything. Rejected: would incorrectly reject historical balance sheet balances for as-of queries.
2. **Treat all facts as point-in-time** — No "too old" check for anything. Rejected: would fail to reject stale P&L data (5-year-old revenue is stale).
3. **Per-fact custom logic** — Each fact has its own validation. Rejected: scattered, hard to maintain.
4. **Two-category validation (chosen)** — Period-based vs point-in-time, with a declared set for each.

### Why This Decision Won
- A balance sheet from 2 years ago is still valid for an as-of-2-years-ago query
- A P&L from 5 years ago is stale — it doesn't reflect current operations
- Treating point-in-time facts with period logic would incorrectly reject historical balances
- Treating period-based facts with point-in-time logic would fail to reject stale periods

### Tradeoffs
- Two validation paths (slightly more complex)
- The POINT_IN_TIME_FACTS set must be maintained as new facts are added
- Future balance sheet facts must be declared as point-in-time

### Future Implications
- `POINT_IN_TIME_FACTS` set includes debt, cash (and future balance sheet facts)
- `qualifyEvent` branches based on fact type
- Historical as-of queries work correctly for point-in-time facts
- Revenue (period-based) still rejects >3-year-old sources

---

## ADR-020: The Constitution Is Supreme

**Phase:** 14.5
**Status:** ACCEPTED

### Context
As the platform grew, there was a risk that future developers would bypass the certified architecture — creating duplicate calculations, duplicating ownership, or bypassing governance. The platform needed a way to protect itself.

### Decision
The Constitution is the permanent supreme law. Every future feature must pass the Architecture Constitution Check before writing code. 13 Articles govern every implementation. The Constitution is self-governing — it enforces the rules through ownership matrices, certification levels, and change control.

### Alternatives Considered
1. **No constitution** — Trust developers to follow best practices. Rejected: architecture erodes over time without explicit rules.
2. **Guidelines only** — Suggest best practices, don't enforce. Rejected: suggestions are ignored under deadline pressure; no enforcement.
3. **Code-level enforcement** — Build linters/validators that check rules. Rejected: can't enforce all rules automatically; some are architectural, not syntactic.
4. **Constitution with mandatory check (chosen)** — Supreme law, 13 Articles, 13-question check before any code.

### Why This Decision Won
- Without a constitution, the architecture would erode over time
- Future developers need to know what is allowed and what is forbidden
- The Constitution makes the rules explicit and enforceable
- The Constitution Check is mandatory — no code is written until all 13 answers pass

### Tradeoffs
- Every implementation requires a Constitution Check (overhead)
- The Constitution is permanent — amendments require architectural review
- Future developers must learn and respect the Constitution

### Future Implications
- The Constitution is the highest architectural authority (Constitution Article XIII)
- Every future implementation must pass the 13-question Constitution Check
- The Articles are permanent — they do not expire, degrade, or become optional
- The platform is now self-governing

---

## ADR Index

| ADR | Title | Phase | Status |
|-----|-------|-------|--------|
| ADR-001 | Canonical Facts Exist | 14.2 | ACCEPTED |
| ADR-002 | IDO Exists | 14.4B | ACCEPTED |
| ADR-003 | CBSS Exists | 14.3 | ACCEPTED |
| ADR-004 | Valuation Remains Owner of Enterprise Value | 13.3 | ACCEPTED |
| ADR-005 | Shadow Mode Exists | 14.3A | ACCEPTED |
| ADR-006 | Consumer Migration Is Incremental | 14.2B | ACCEPTED |
| ADR-007 | Propagation Is Governed | 14.3 | ACCEPTED |
| ADR-008 | Advisor Review Exists | 13.3 | ACCEPTED |
| ADR-009 | Galileo Is the Single AI Interface | 13.4 | ACCEPTED |
| ADR-010 | BIE Is the Composite Intelligence Owner | 9 | ACCEPTED |
| ADR-011 | Published Valuations Are Immutable | 13.3 | ACCEPTED |
| ADR-012 | The Enterprise Journey Precedes Authentication | 4 | ACCEPTED |
| ADR-013 | Multi-Business Architecture | 4 | ACCEPTED |
| ADR-014 | Executive Sessions (Not Credits) | 13.4B | ACCEPTED |
| ADR-015 | No Hardcoded Fallback Values | 9 | ACCEPTED |
| ADR-016 | Field-Level Governance for Valuation | 13.3G | ACCEPTED |
| ADR-017 | Shadow Comparison Continues for Live Consumers | 14.3B | ACCEPTED |
| ADR-018 | The Kill Switch | 14.3B | ACCEPTED |
| ADR-019 | Point-in-Time vs Period-Based Facts | 14.3C | ACCEPTED |
| ADR-020 | The Constitution Is Supreme | 14.5 | ACCEPTED |
| ADR-021 | Supabase Is the Sole Persistent System of Record | 15.6 | ACCEPTED |
| ADR-022 | Document Persistence Freeze | 15.7 | ACCEPTED |

---

## ADR-021: Supabase Is the Sole Persistent System of Record

**Phase:** 15.6
**Status:** ACCEPTED

### Context

Persistent business data existed across BOTH Base44 Entities and Supabase. Different consumers selected different sources, producing stale assessments overriding current assessments, Base44 records disagreeing with Supabase, BIE reading different values from Dashboard, Executive Brief treating completed assessments as missing, and stale dashboard_metrics overriding fresh assessment values.

### Decision

Supabase is the sole authoritative persistence layer for all persistent V.I.S.I.O.N. business data. Base44 is the application/UI layer only. Every persistent write must terminate in Supabase. Every authoritative persistent read must originate from Supabase. No future feature may introduce a Base44 Entity as an independent system of record.

### Alternatives Considered

1. **Keep dual-source with better sync** — Rejected: sync logic is fragile, race conditions inevitable, two sources of truth persist.
2. **Base44 as primary, Supabase as mirror** — Rejected: Base44 lacks RLS, audit trail, and relational integrity needed for business data.
3. **Big-bang rewrite** — Rejected: too risky, too many consumers to migrate simultaneously.

### Why This Decision Won

Single source of truth eliminates database conflict permanently. Supabase provides RLS, audit trail, relational integrity, and business-scoped queries. Controlled strangler migration allows domain-by-domain certification without breaking the app.

### Tradeoffs

- Base44 Entities remain temporarily as legacy mirrors (storage overhead)
- Migration requires careful domain-by-domain certification
- No silent fallback to Base44 means Supabase outages show explicit unavailable state

### Future Implications

- All new features must persist to Supabase
- Base44 Entity creation for business data requires Constitution Check
- Future Base44 implementations may NOT modify this rule without explicit platform-owner approval
- Migration phases B-F will bring remaining domains to Supabase-only

---

## ADR-022: Document Persistence Freeze

**Phase:** 15.7 (Phase B)
**Status:** ACCEPTED

### Context

Document data (metadata, storage, extraction, analysis, derived metrics) needed the same single-source-of-truth treatment as assessments. An audit revealed the document architecture was already substantially Supabase-backed — `base44.entities.Document` had ZERO usage in frontend and backend. However, `getMetricAutoPopulate` lacked `business_id` scoping, creating a multi-business isolation gap where extracted metrics from one business could contaminate another.

### Decision

All persistent documents, document metadata, extracted data, analysis, financial metrics, and document-derived business intelligence are owned by Supabase. Base44 may provide the document user interface but may not own persistent document truth. No Base44 Document entity may become authoritative. `getMetricAutoPopulate` must accept and scope by `active_business_id`.

### Alternatives Considered

1. **Leave getMetricAutoPopulate profile-scoped** — Rejected: cross-business metric contamination in multi-business profiles.
2. **Create a new Supabase document metric table** — Rejected: `extracted_fields` + `getMetricAutoPopulate` already support the metric contract. No new table needed.
3. **Migrate DocumentClassification and DocumentFolder to Supabase** — Rejected: they are non-authoritative (LEGACY_MIRROR and TRANSIENT_UI). Document truth is already in Supabase `documents` table. No migration needed.

### Why This Decision Won

The document architecture was already Supabase-backed. The only functional gap (business_id scoping) is a targeted fix, not a migration. This preserves the existing working architecture while closing the isolation gap and establishing the Constitution freeze.

### Tradeoffs

- `DocumentClassification` and `DocumentFolder` Base44 entities remain as non-authoritative supplementary stores (audit metadata, custom folder definitions)
- Historical Base44 `Document` entity records are not deleted (zero usage, safe to deprecate later)

### Future Implications

- No new Base44 Document entity may become authoritative
- All document consumers must use Supabase-backed certified services
- `getMetricAutoPopulate` callers must always pass `active_business_id` from BusinessContext
- Phase C will address the next domain (TBD)

### Status

ACCEPTED — Phase A (Assessments) implemented. See `src/SUPABASE_SINGLE_SOURCE_OF_TRUTH_MIGRATION.md`.

---

## ADR-0XX: Decision Intelligence Is a Governed Human Decision Support Layer

**Phase:** D
**Status:** ACCEPTED

### Context

The platform needed a way to help owners and advisors answer: "What should we decide, based on what we currently know?" Major executive decisions (acquire a competitor, sell the business, raise prices, hire a key executive, expand geographically) were unstructured — no systematic framing, no evidence collection, no option comparison, no assumption tracking, no challenge mode.

The risk was building either (a) an autonomous decision engine that makes decisions for users, or (b) a parallel system that duplicates existing recommendation, execution, and memory systems.

### Decision

Decision Intelligence is a **governed human decision support layer**. It structures decisions but does not make them.

- AI proposes reasoning (framing, evidence, options, tradeoffs, recommendations)
- Humans decide (explicit finalization with selected option + reason)
- Existing certified systems execute (Growth Plan, Sprint, Roadmap, Valuation, Verification Queue)

Decision Intelligence **consumes** the Shared Business Intelligence Contract. It does not independently resolve current business truth. It **composes** certified outputs into a Decision Context.

### Alternatives Considered

1. **Autonomous decision engine** — AI makes decisions and executes them. REJECTED: violates human authority, creates safety risk, no audit trail for "why did the AI decide this."
2. **Parallel recommendation engine** — Decision Intelligence has its own recommendation logic. REJECTED: duplicates BIE/Galileo, creates competing truth.
3. **Parallel execution engine** — Decision Intelligence has its own task/roadmap system. REJECTED: duplicates Sprint/Roadmap/Growth Plan, creates competing execution.
4. **No decision system** — Leave decisions unstructured. REJECTED: major executive decisions deserve structured support.

### Why This Decision Won

- **Human authority preserved** — AI proposes, humans decide. The finalization action requires explicit human input (selected_option_id + decision_reason).
- **No duplication** — Decision Intelligence composes existing certified outputs. It does not create a new truth engine, recommendation engine, or execution engine.
- **Historical reproducibility** — Decision-time evidence is preserved immutably (source_contract_version + source_context_snapshot). When current facts change, historical reasoning remains.
- **Governed routing** — Confirmed decisions route to existing execution systems. No parallel execution.
- **Business Memory integration** — Confirmed major decisions may become memory candidates through the existing governance workflow.
- **Challenge mode** — Devil's Advocate challenges the evidence, not the person. Identifies confirmation bias, missing evidence, failure modes.

### Tradeoffs

- Decisions require manual finalization (no auto-decide) — this is intentional
- The `business_decisions` Supabase table is a new persistence domain (additive, RLS-safe)
- Challenge mode uses LLM credits (claude_sonnet_4_6) — advisor-triggered only
- Outcome review is framework-only (no autonomous outcome judgment in this phase)

### Future Implications

- Decision Intelligence creates structured data that makes future Business DNA and Business Twin possible (NOT implemented in this phase)
- Decision Patterns may be extracted from the Decision Ledger in future phases
- Outcome tracking (succeeded/failed/inconclusive) is prepared but requires human confirmation
- Meeting Intelligence Decision Moments may link to Decision records

### Status

ACCEPTED — Phase D implemented. See `src/DECISION_INTELLIGENCE_FOUNDATION.md`.

---

## ADR: DECISION OUTCOMES ARE HUMAN-CONFIRMED RETROSPECTIVE INTELLIGENCE

**Phase:** D.1
**Status:** ACCEPTED

### Context

Phase D established Decision Intelligence — structuring decisions, collecting evidence, and routing human-confirmed decisions to existing execution systems. But the decision-learning loop was open: once a decision was made, there was no systematic way to ask "What did we expect? What actually happened? Why? What did we learn? What should we do next?"

The risk was building either (a) an autonomous outcome engine that declares decisions successful or failed without human judgment, or (b) a parallel system that duplicates existing truth, memory, timeline, and execution systems.

### Decision

Decision Outcome Intelligence is a **governed retrospective intelligence layer**. It closes the decision-learning loop but does not close it autonomously.

- AI analyzes evidence and recommends an outcome classification (advisory only)
- Humans confirm the final outcome status (succeeded, partially_succeeded, failed, ongoing, inconclusive)
- Existing systems own current truth (Shared Intelligence Contract), memory (Business Memory), timeline (CBSS), and execution (Growth Plan, Sprint, Roadmap)
- Lessons become Business Memory candidates through existing governance (not auto-promoted)

The outcome lifecycle:
```
BUSINESS STATE → DECISION → EXPECTED OUTCOMES → EXECUTION →
REVIEW DATE → CURRENT EVIDENCE → OUTCOME ANALYSIS →
HUMAN CONFIRMATION → ACTUAL OUTCOME → BUSINESS MEMORY / TIMELINE / NEXT ACTION
```

### Alternatives Considered

1. **Autonomous outcome judgment** — AI declares success/failure. REJECTED: violates human authority; business outcome judgment requires context AI doesn't have; creates false confidence.
2. **New outcome table** — Create a separate `decision_outcomes` table. REJECTED: the `business_decisions` table already has `expected_outcomes`, `actual_outcomes`, `outcome_status`, `outcome_review_date`, `outcome_reviewed_at`, `outcome_notes` — all unused. No new table needed.
3. **Parallel truth engine** — Outcome Intelligence resolves current business metrics independently. REJECTED: violates Article I; current evidence must come from the Shared Intelligence Contract.
4. **Auto-promoted lessons** — Confirmed outcomes automatically create permanent Business Memory. REJECTED: violates Business Memory governance; lessons are candidates, not truth.
5. **Human-confirmed retrospective (chosen)** — AI analyzes and suggests; humans confirm; existing systems own truth, memory, timeline, execution. No new table. No new truth engine.

### Why This Decision Won

- **No new table** — All outcome data uses existing `business_decisions` JSONB fields (expected_outcomes, actual_outcomes) and existing text/timestamp columns (outcome_status, outcome_review_date, outcome_reviewed_at, outcome_notes). Only one additive index was added.
- **Human authority preserved** — `confirmOutcome` requires `isAdvisorOrAdmin`. AI can analyze (`analyzeOutcome`) but cannot confirm. This is the OUTCOME AUTHORITY gate.
- **No duplication** — Current evidence comes from the Shared Intelligence Contract. Memory candidates go through existing Business Memory governance. Timeline events use existing `business_state_events`. Execution evidence comes from existing Growth Plan, Sprint, and Roadmap.
- **Immutability preserved** — Decision-time context (`source_context_snapshot`, `source_contract_version`) is never overwritten. Review-time state is captured in `actual_outcomes[].reviewed_at` and `outcome_reviewed_at`.
- **TOO_EARLY and INCONCLUSIVE supported** — The system does not force a judgment when evidence is insufficient or the outcome horizon hasn't elapsed.
- **Failed decisions preserved** — Failed decisions generate valuable memory candidates. No blame language. Historical context is preserved.
- **Follow-up decisions preserve history** — A follow-up decision supersedes the original but does not rewrite it. The original's outcome may be "inconclusive" or "superseded context."

### Tradeoffs

- Outcome review requires manual human confirmation (no auto-judge) — this is intentional
- AI analysis uses LLM credits (claude_sonnet_4_6) — advisor-triggered only
- The `expected_outcomes` and `actual_outcomes` JSONB structures are formalized but not CHECK-constrained at the DB level (flexibility for non-numeric outcomes)
- Review state is derived deterministically from existing fields, not persisted — no new column needed

### Future Implications

- Decision Outcome Intelligence creates the first foundation for Business DNA — patterns of what worked and what didn't across decisions (NOT implemented in this phase)
- Future phases may extract Decision Patterns from the Decision Ledger + outcome data
- Meeting Intelligence may surface "Decision Reviews Due" in meeting briefs
- Living Intelligence may prioritize due reviews in whatMattersNow
- Value creation from successful outcomes must still go through the existing governed `value_creation_events` process — no automatic value creation

### Status

ACCEPTED — Phase D.1 implemented. See `src/DECISION_OUTCOME_INTELLIGENCE.md`.

---

## ADR-022: Business DNA Is Derived Pattern Intelligence, Not Source Truth

**Date:** 2026-08-14
**Phase:** E — Business DNA Foundation
**Status:** ACCEPTED
**Constitution Article:** XVII — Business DNA Authority

### Context

V.I.S.I.O.N. has 15+ certified subsystems producing authoritative business intelligence. Each owns its domain: Shared Contract owns current metrics, Business Memory owns durable context, Timeline owns events, Decision Intelligence owns decision framing, Valuation owns value calculations.

The platform needed a way to answer: "What durable patterns explain how this particular business creates value, operates, makes decisions, depends on its owner, encounters risk, and evolves over time?"

This is NOT a fact, NOT a metric, NOT a memory, NOT a decision, NOT a valuation. It is DERIVED INTELLIGENCE — patterns synthesized across all certified evidence.

### Decision

Business DNA is a governed derived intelligence layer that:
- Synthesizes durable patterns from certified evidence (never recalculates)
- Uses six families: Economic, Value, Operating, Decision, Owner, Risk & Resilience
- AI proposes candidate patterns; deterministic rules qualify them
- Evidence lineage deduplication prevents confidence inflation
- Contradictions mark patterns WEAKENING/CONTESTED (never silent overwrite)
- Supersession preserves history
- No master DNA score (DNA describes patterns, not a score)
- Owner DNA contains no psychological profiling
- One additive table: `business_dna_patterns`
- Client-safe filtering before output

### Why This Decision Won

- **Derived, not authoritative** — DNA references evidence, never recalculates facts. Shared Contract remains the sole source of current truth.
- **Lineage-aware evidence** — Five copies of the same metric count as ONE independent source. This prevents confidence inflation from rendering the same fact in multiple systems.
- **Deterministic qualification** — AI proposes candidates, but deterministic rules decide CANDIDATE → EMERGING → ESTABLISHED transitions. No silent promotion.
- **Contradiction preservation** — When evidence contradicts a pattern, the old pattern is marked WEAKENING or CONTESTED, not overwritten. A new candidate is created. History is preserved.
- **No master score** — Business IQ, assessment scores, and valuation confidence already exist. A DNA score would create semantic confusion.
- **Owner DNA safety** — Owner DNA describes observable business dependency, NOT psychological traits. Forbidden terms are validated.
- **One table** — No separate tables per DNA family. JSONB evidence_refs, implications, and questions keep it compact.
- **Quiet state** — Sparse businesses have sparse DNA. No generic AI filler. "Not enough evidence yet" is a valid output.

### Tradeoffs

- AI candidate generation uses LLM credits (claude_sonnet_4_6) — advisor-triggered only
- Pattern qualification requires temporal durability (60+ days for ESTABLISHED) — new businesses will have sparse DNA initially
- Evidence lineage dedup requires careful lineage_root assignment — the backend must correctly identify the underlying source
- No master DNA score means no single "DNA health" metric — some users may expect one

### Future Implications

- Phase E.1 (reserved): Visual DNA experience, exploration interface, evolution visualization
- Business Twin (reserved): Simulation, counterfactual modeling, predictive behavior — will consume DNA patterns
- Galileo integration: 4 capabilities registered (analyze, explain, challenge, compare)
- Executive Brief: Only high-confidence, material patterns may influence briefing prioritization
- Meeting Intelligence: May retrieve relevant DNA patterns for meeting context
- Decision Intelligence: Decision Context may retrieve relevant DNA patterns

### Status

ACCEPTED — Phase E implemented. See `src/BUSINESS_DNA_FOUNDATION.md`.

---

*Future architectural decisions will be recorded as new ADRs. This is a living document.*