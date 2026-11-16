# Phase 13.4A.1 — Galileo Valuation Integration Audit

**Date:** 2026-08-06
**Phase:** 13.4A.1 (Audit & Design — No Implementation)
**Status:** READY FOR GALILEO VALUATION CONTEXT REVIEW
**Objective:** Make Galileo the unified intelligence and advisor-assistance layer across the entire Business Valuation workflow — without creating a separate valuation chatbot, AI panel, or parallel conversation system.

---

## Table of Contents

1. [Existing Galileo Architecture](#1-existing-galileo-architecture)
2. [Existing Backend Actions](#2-existing-backend-actions)
3. [Existing Frontend Components](#3-existing-frontend-components)
4. [Existing Context Payload](#4-existing-context-payload)
5. [Existing Data Sources](#5-existing-data-sources)
6. [Existing Permissions](#6-existing-permissions)
7. [Conversation Persistence](#7-conversation-persistence)
8. [Page Awareness](#8-page-awareness)
9. [Suggested Prompts](#9-suggested-prompts)
10. [Citation Behavior](#10-citation-behavior)
11. [Active-Business Switching](#11-active-business-switching)
12. [Existing System Prompts](#12-existing-system-prompts)
13. [Existing Memory Behavior](#13-existing-memory-behavior)
14. [Missing Valuation Connections](#14-missing-valuation-connections)
15. [Duplicate Systems to Avoid](#15-duplicate-systems-to-avoid)
16. [Recommended Additive Integration Points](#16-recommended-additive-integration-points)
17. [Context Contract (Proposed)](#17-context-contract-proposed)
18. [Permission Boundaries (Proposed)](#18-permission-boundaries-proposed)
19. [Conversation Scoping (Proposed)](#19-conversation-scoping-proposed)
20. [Initial Command Set (Mapped)](#20-initial-command-set-mapped)
21. [Implementation Risks](#21-implementation-risks)
22. [Stop Condition Confirmation](#22-stop-condition-confirmation)

---

## 1. Existing Galileo Architecture

Galileo is the platform's single AI interface. It is **not** a valuation-specific assistant. It currently operates across the dashboard, assessments, sprint, documents, and journey — but has **zero awareness** of the Business Valuation system.

### Architectural Summary

| Layer | Component | Mount Point | Backend Function | Persistence |
|-------|-----------|-------------|------------------|-------------|
| Global Drawer | `GalileoPanel` | `AppLayout` (all authenticated pages) | `buildGalileoContext` + `InvokeLLM` | **None** (local state only) |
| Embedded Card | `AskGalileoCard` | Expert/client views, test pages | `askGalileo` (OpenRouter) | `galileo_conversations` (Supabase) |
| Journey Overlay | `PersistentGalileo` | Enterprise Journey only | N/A (static scripts) | N/A |
| Event Overlay | `GalileoGuidance` | Enterprise Journey only | N/A (event-driven) | N/A |
| Dashboard Widgets | `GalileoCardInsight`, `GalileoAdvisorCard`, `GalileoGuidanceCard` | Dashboard | `generateGalileoInsights` | N/A |

### Critical Finding: Two Parallel Galileo Implementations

The platform currently has **two different Galileo chat implementations** that share the same visual identity but use different backend functions, different context resolution, different persistence, and different response formats:

1. **`GalileoPanel`** (the global drawer) — calls `buildGalileoContext` for context, then calls `InvokeLLM` directly with a hardcoded system prompt. Conversations are **not persisted**. Response is a plain string.

2. **`AskGalileoCard`** (embedded card) — calls `askGalileo` backend function, which uses OpenRouter (gpt-4o-mini), persists to `galileo_conversations`, and returns a structured JSON response with `category`, `confidence_level`, `supporting_sources`, `missing_data`, `recommended_next_step`, and `gated_detail`.

**This is a pre-existing architectural inconsistency.** The valuation integration must NOT create a third implementation. Phase 13.4A should extend the existing architecture additively, and Phase 13.4B should consider unifying the two entry points.

---

## 2. Existing Backend Actions

### 2.1 `askGalileo` (base44/functions/askGalileo/entry.ts)

**Purpose:** Q&A function for the embedded `AskGalileoCard`. Answers user questions using canonical BIE recommendations.

**Architecture:**
- Resolves profile + business via `resolveProfileAndBusiness()` (server-side, from `base44.auth.me()`)
- Fetches canonical BIE recommendations via `fetchCanonicalRecommendations()`
- Loads supporting context: assessments, documents, NBA, sprint, advisor notes
- Resolves strategy context + advisor overrides + supporting evidence per recommendation
- Fetches strategic hypotheses and learning patterns
- Calls OpenRouter (gpt-4o-mini) with a structured system prompt
- Returns structured JSON: `{ category, answer, recommendation_key, supporting_sources, missing_data, recommended_next_step, confidence_level, is_data_driven, source, intelligence_labels, hypotheses_surfaced, gated_detail }`
- Falls back to rule-based answer if LLM fails
- Applies gating for free users (hides `gated_detail`)
- Persists conversation to `galileo_conversations` Supabase table

**Permission Model:**
- Requires authenticated user (`base44.auth.me()`)
- Resolves profile from `profiles` table by email
- Owners can only access their own business (enforced in `buildGalileoContext`, not in `askGalileo` directly)
- Admins/advisors get full context
- Free users get gated detail (no implementation steps)

**Valuation Awareness:** **None.** No valuation_id, no valuation tables, no valuation assignments, no valuation calculations.

### 2.2 `buildGalileoContext` (base44/functions/buildGalileoContext/entry.ts)

**Purpose:** Aggregates all business intelligence into a single structured context object. Used by `GalileoPanel`.

**Architecture:**
- Resolves profile + business server-side (from `base44.auth.me()`)
- Parallel fetches 14 data sources: business_entities, dashboard_metrics, snapshots, assessments, opportunities, NBA, roadmap, VCE, documents, advisor_notes, KB entries, sprint, extracted_fields, strategy_outcomes
- Fetches ReadinessItems from Base44 entity
- Fetches chat history from `GalileoConversation` entity
- Fetches canonical BIE recommendations
- Builds a large context object with: business_profile, current_metrics, financial_snapshots, ciq_summary, gap_summary, top_opportunities, next_best_actions, roadmap_status, verified_value_created, document_summary, accepted_financial_fields, advisor_notes_summary, chat_history, missing_data, risks, recommended_focus, source_quality, exit_readiness_summary, knowledge_base, active_sprint, page_context_summary, outcome_tracking_summary, canonical_recommendations

**Permission Model:**
- Requires authenticated user
- Owners can only access their own business (`profile.primary_business_id !== business_id` → 403)
- Admins/advisors get full access

**Page Awareness:** Partial. Accepts `current_route`, `page_context`, `selected_entity_id`. Infers `inferred_intent` from route (tax → tax_strategy, profit → profit_optimization, etc.). No valuation route inference.

**Valuation Awareness:** **None.** No valuation tables queried.

### 2.3 `generateGalileoInsights` (base44/functions/generateGalileoInsights/entry.ts)

**Purpose:** Formats verified intelligence from canonical BIE recommendations into headline, observation, why it matters, consequence of inaction, potential upside, confidence language, next decision, and follow-up question.

**Valuation Awareness:** **None.** Same BIE-only data sources as `askGalileo`.

### 2.4 Shared Module: `galileoBieConsumer` (base44/shared/galileoBieConsumer/entry.ts)

**Purpose:** The canonical BIE recommendation builder + Strategy Library resolver + advisor override handler + supporting evidence builder. All Galileo backend functions import from this module.

**Key Exports:**
- `fetchCanonicalRecommendations(sb, profileId, businessId)` — builds canonical recommendations from dashboard_metrics + assessments + snapshots
- `resolveStrategyContext(...)` — resolves Strategy Library options for a recommendation, with scope priority and access-level filtering
- `checkAdvisorOverride(...)` — checks for active advisor overrides
- `buildSupportingEvidence(...)` — builds evidence from metrics, documents, assessments
- `buildGalileoResponseContract(...)` — builds the response contract honoring overrides
- `generateStrategicHypothesis(...)` — AI-generated hypothesis (labeled HYPOTHESIS, requires advisor review)
- `compareApprovedStrategies(...)` — AI comparison of approved strategies only
- `fetchLearningPatterns(...)` — fetches learning patterns from `strategy_learning_summary`
- `recordLearningPattern(...)` — records a learning pattern with audit trail
- `applyLearningAdjustments(...)` — adjusts strategy ranking using validated patterns
- `resolveProfileAndBusiness(sb, user, data)` — resolves profile + business + membership from authenticated user
- `INTELLIGENCE_LABELS` — VERIFIED, PROJECTED, HYPOTHESIS, ADVISOR_CONFIRMED

**Architecture Rule:** "BIE decides. Strategy Library enriches. Galileo explains." Galileo may NOT invent, score, rank, or create new recommendations.

**Valuation Awareness:** **None.** All data sources are BIE/assessment/sprint/document — no valuation tables.

---

## 3. Existing Frontend Components

### 3.1 `GalileoButton` (src/components/galileo/GalileoButton.jsx)

- Floating button, bottom-right, `glass-gold` style
- Mounted globally in `AppLayout`
- Opens `GalileoPanel` via `onClick`
- No page context, no valuation awareness

### 3.2 `GalileoPanel` (src/components/galileo/GalileoPanel.jsx)

- Slide-out drawer (right side, max-w-md)
- Mounted globally in `AppLayout`
- **Two code paths:**
  - Authenticated: calls `buildGalileoContext` backend function
  - Anonymous: calls `getGalileoContext()` from `AssessmentContext` (local)
- Calls `InvokeLLM` directly with a hardcoded system prompt
- **Conversations are NOT persisted** (messages are local React state)
- Has a question limit (ANON_LIMIT=5, FREE_LIMIT=7, paid=unlimited)
- Static suggested questions (5 questions, same everywhere)
- No valuation awareness, no page-aware suggested questions
- Accepts `pageContext` and `targetBusinessId` props but only passes them to `buildGalileoContext`

### 3.3 `AskGalileoCard` (src/components/galileo/AskGalileoCard.jsx)

- Embedded card component (used in expert client views, test pages)
- Calls `askGalileo` backend function
- **Persists conversations** to `galileo_conversations` (via backend)
- Returns structured response with meta (category, confidence, sources, missing_data, next_step)
- Has starter questions (7 questions, same everywhere)
- Supports `targetBusinessId` prop (for expert/admin client views)
- No valuation awareness

### 3.4 Journey-Only Components (NOT the chat)

These are **not** the Galileo chat. They are guidance overlays for the Enterprise Journey:

- `PersistentGalileo` — always-visible avatar with crossfading guidance messages (static scripts)
- `GalileoGuidance` — event-driven guidance overlay (from `useEnterpriseDiscovery`)
- `GalileoCoach` — journey coaching component
- `GalileoWelcome` — journey welcome
- `GalileoHelpBubble` — journey help
- `GalileoTimeline` — journey timeline

**These must NOT be modified for valuation integration.** They are journey-specific.

### 3.5 Dashboard Widgets (NOT the chat)

- `GalileoCardInsight` — dashboard insight card
- `GalileoEducationModal` — education modal
- `GalileoAdvisorCard` — advisor card
- `GalileoGuidanceCard` — guidance card (sprint)

These are display widgets, not conversation entry points.

### 3.6 `ExecutiveBriefing` Local GalileoPanel

`ExecutiveBriefing.jsx` has its own local `GalileoPanel` component (line 480) — this is a **different** component from `src/components/galileo/GalileoPanel.jsx`. It renders briefing step content, not a chat. Name collision but no functional overlap.

---

## 4. Existing Context Payload

### 4.1 `buildGalileoContext` Output

The context object returned by `buildGalileoContext` contains:

```
{
  _meta: { business_id, profile_id, generated_at, question, current_route, schema_notes },
  business_profile: { id, name, industry, entity_type, annual_revenue_range, state, years_in_business, employees },
  current_metrics: { revenue, net_profit, ebitda, business_value, ciq_score, data_confidence } (each with {value, source}),
  financial_snapshots: [{ date, ciq_score, revenue, net_profit, ebitda, business_value, confidence }],
  ciq_summary: { current_score, trend, snapshot_count },
  gap_summary: { profit_gap, value_gap, tax_gap, operations_gap, recast_ebitda, freedom, total_opportunity },
  top_opportunities: [{ id, title, category, priority_score, estimated_impact, confidence_score, difficulty, status, source }],
  next_best_actions: [{ id, title, type, priority_score, estimated_impact, status, reason, difficulty, expected_days }],
  roadmap_status: { total, by_status, completed_count, in_progress_count, total_estimated_value, total_verified_value },
  verified_value_created: { total_verified_value, total_tax_savings, total_profit_improvement, total_cash_flow_improvement, verified_event_count, pending_verification_count, total_estimated_pipeline, events },
  document_summary: { total_documents, by_type, completed_count, pending_review_count, years_covered },
  accepted_financial_fields: [{ field, value, normalized_value, category, document_type, reviewed_at, source }],
  advisor_notes_summary: { count, notes },
  chat_history: [{ role, content, timestamp }],
  missing_data: [...],
  risks: [{ risk, severity, area }],
  recommended_focus: [{ area, action, reason, estimated_impact, source }],
  source_quality: { has_verified_financials, has_advisor_review, has_completed_assessments, total_assessments_possible, has_verified_wins, data_confidence_score, overall_quality },
  exit_readiness_summary: { total_items, completed, completion_pct, by_status, critical_pending, stalled_items },
  knowledge_base: { total_entries, by_category, top_insights },
  active_sprint: { id, path_title, path_goal, progress_percent, total_tasks, completed_tasks, next_tasks },
  page_context_summary: { current_route, page_name, selected_tab, visible_section, selected_assessment, selected_sprint_path, selected_document, selected_entity_id, inferred_intent },
  outcome_tracking_summary: { total_outcomes, completed_outcomes_count, verified_outcomes_count, pending_actuals_count, total_projected_impact, total_actual_impact, total_variance, average_accuracy_percentage, best_performing_categories, underperforming_categories, sprint_outcomes },
  canonical_recommendations: [...]
}
```

### 4.2 `askGalileo` Context (Inline)

`askGalileo` builds its context inline (not via a separate context object). It includes:
- Canonical BIE recommendations (summary)
- Business context: ciq_score, assessments_completed, assessments_missing, active_sprint, next_best_actions, documents, advisor_notes_count
- Strategic hypotheses
- Learning patterns
- Page context lines (current_route, page_name, selected_tab)

### 4.3 What Is Missing (Valuation)

Neither context payload includes:
- `valuation_id`, `valuation_name`, `lifecycle_status`
- `assignment_role`, `can_view`, `can_edit`, `can_review`, `can_publish`
- `client_safe_only` flag
- Approved outputs: `normalized_ebitda`, `maintainable_earnings`, `enterprise_value`, `equity_value`, `confidence`, `advisor_conclusion`
- Evidence summary: `document_count`, `extraction_count`, `verified_fields`, `conflicting_fields`, `missing_fields`
- Verification summary: `critical_items`, `high_priority_items`, `waiting_on_owner`, `publication_blockers`
- Build Value summary: `strongest_dimension`, `weakest_dimension`, `value_drivers`, `value_detractors`
- Growth Plan summary: `candidate_initiatives`, `approved_initiatives`, `client_visible_initiatives`
- Version summary: `current_version`, `prior_version`, `enterprise_value_delta`, `confidence_delta`
- Readiness: `discover_completion`, `validation_open_count`, `build_value_completion`, `calculation_readiness`, `publication_readiness`, `critical_blockers`, `stale_calculations`

---

## 5. Existing Data Sources

### 5.1 Supabase Tables (Public Schema)

Currently queried by Galileo:
- `business_entities`
- `dashboard_metrics`
- `business_metric_snapshots`
- `business_assessments`
- `business_opportunities`
- `next_best_actions`
- `roadmap_items`
- `value_creation_events`
- `documents`
- `advisor_notes`
- `ninety_day_sprint_paths`
- `ninety_day_sprint_tasks`
- `extracted_fields`
- `strategy_outcomes`
- `strategy_learning_summary`
- `strategic_hypotheses`
- `recommendation_strategy_mappings`
- `recommendation_overrides`
- `galileo_conversations`
- `profiles`
- `business_owners`

### 5.2 Supabase Tables (Valuation Schema) — NOT YET QUERIED

These exist but Galileo has zero access:
- `valuation.business_valuations`
- `valuation.valuation_assignments`
- `valuation.valuation_audit_log`
- `valuation.valuation_versions`
- `valuation.valuation_calculations`
- `valuation.valuation_adjustments`
- `valuation.valuation_reconciliation`
- `valuation.valuation_conclusions`
- `valuation.valuation_confidence_scores`
- `valuation.valuation_publication_status`
- `valuation.valuation_shares`
- `valuation.valuation_requests`
- `valuation.valuation_request_events`
- `valuation.valuation_field_governance`
- `valuation.valuation_change_requests`
- `valuation.valuation_intelligence_snapshots`
- `valuation.valuation_verification_queue`
- `valuation.valuation_build_value_scores`
- `valuation.valuation_growth_plan_initiatives`
- `valuation.valuation_deliverables`

### 5.3 Base44 Entities

Currently queried:
- `GalileoConversation` — conversation persistence
- `KnowledgeBaseEntry` — KB entries
- `ReadinessItem` — exit readiness

Not yet queried (but available):
- `ValuationFieldGovernance` — field-level governance
- `ValuationChangeRequest` — change requests
- `StrategicHypothesis` — strategic hypotheses (also in Supabase)
- `StrategyLearningPattern` — learning patterns (also in Supabase)

---

## 6. Existing Permissions

### 6.1 Current Galileo Permission Model

| Role | Context Access | Detail Access | Conversation Persistence |
|------|----------------|---------------|--------------------------|
| Anonymous | Local AssessmentContext only | ANON_LIMIT=5 questions | None |
| Free Owner | Own business only | FREE_LIMIT=7, gated detail | Via `askGalileo` only |
| Paid Owner | Own business only | Full detail | Via `askGalileo` only |
| Advisor | Assigned businesses | Full detail + proprietary steps | Via `askGalileo` only |
| Admin/Super Admin | All businesses | Full detail | Via `askGalileo` only |

### 6.2 Enforcement Points

- `buildGalileoContext`: checks `profile.primary_business_id !== business_id` → 403 for non-admins
- `askGalileo`: resolves profile + business via `resolveProfileAndBusiness`, but does NOT re-check business ownership (relies on profile resolution)
- `GalileoPanel`: passes `targetBusinessId` or `activeContext.businessId` to backend
- `AskGalileoCard`: same pattern

### 6.3 What Is Missing (Valuation)

No valuation assignment checks:
- No `valuation_assignments` query
- No `can_view`, `can_edit`, `can_review`, `can_publish` resolution
- No `client_safe_only` filtering
- No distinction between "assigned advisor" and "unassigned advisor"
- No archived/published valuation read-only enforcement
- No business owner client-safe boundary enforcement

The valuation system already has this permission model in `valuationService` and `valuationAuth.ts` (`base44/shared/valuationEngine/valuationAuth.ts`). Galileo must reuse it, not reinvent it.

---

## 7. Conversation Persistence

### 7.1 Current State

| Entry Point | Persistence | Storage | Scoping |
|-------------|-------------|---------|---------|
| `GalileoPanel` | **None** | Local React state | N/A |
| `AskGalileoCard` | Yes | `galileo_conversations` (Supabase) | `profile_id` + `business_id` |

### 7.2 `galileo_conversations` Schema

```
{
  id (uuid),
  profile_id (uuid),
  business_id (uuid),
  messages: [{
    role_user: string,
    role_assistant: string,
    category: string,
    confidence: string,
    recommendation_key: string,
    source: string,
    timestamp: iso
  }],
  created_at, updated_at
}
```

### 7.3 GalileoConversation Entity (Base44)

```
{
  messages: [{ role, content, timestamp }],
  questions_used: number
}
```

RLS: `created_by` (owner can only see their own; admins can see all).

### 7.4 What Is Missing (Valuation)

- No `valuation_id` in conversation scoping
- No `conversation_mode` (general vs. valuation_advisor)
- No `client_safe` flag on conversations
- No context reset on business/valuation switch
- `GalileoPanel` doesn't persist at all — valuation conversations would be lost on panel close

---

## 8. Page Awareness

### 8.1 Current State

`GalileoPanel` receives `pageContext` from `AppLayout`:
```js
const pageContext = {
  page_name: location.pathname.split('/').filter(Boolean).pop() || 'dashboard',
  current_route: location.pathname,
};
```

`buildGalileoContext` infers `inferred_intent` from route:
- `/tax` → tax_strategy
- `/profit` → profit_optimization
- `/value` → valuation
- `/operations` → operations_improvement
- `/freedom` → owner_independence
- `/sprint` or `/command` → sprint_execution
- `/data-room` or `/document` → document_review
- `/dashboard` → overall_health
- default → general

### 8.2 What Is Missing (Valuation)

No valuation route inference:
- `/advisory/business-valuation` → not mapped
- `/advisory/valuation/:id` → not mapped
- `/advisory/valuation/:id?ws=discover` → workspace not extracted
- `/advisory/valuation/:id?ws=validate` → not mapped
- `/advisory/valuation/:id?ws=build_value` → not mapped
- `/advisory/valuation/:id?ws=valuation` → not mapped
- `/advisory/valuation/:id?ws=growth_plan` → not mapped
- `/advisory/valuation/:id?ws=deliverables` → not mapped
- `/admin/business-valuations` → not mapped

No `workspace_key` or `section_key` passed to Galileo.
No "Viewing: My Business · Valuation · Maintainable Earnings" context line.

---

## 9. Suggested Prompts

### 9.1 Current State

**GalileoPanel** — 5 static questions (same everywhere):
1. What's my biggest hidden profit opportunity?
2. How can I reduce my tax burden this year?
3. What would a buyer see as a red flag?
4. How do I reduce my business dependency on me?
5. What's the fastest path to increase my valuation?

**AskGalileoCard** — 7 static questions (same everywhere):
1. What should I focus on next?
2. What is hurting my business value most?
3. What tax opportunities am I missing?
4. How can I improve profit?
5. What should I do in the next 90 days?
6. What documents do you still need?
7. What sprint tasks should I finish first?

### 9.2 What Is Missing (Valuation)

No workspace-specific suggested questions. The phase spec defines 7 workspace-specific question sets (Valuation Landing, Discover, Validate, Build Value, Valuation, Growth Plan, Deliverables) — none exist.

---

## 10. Citation Behavior

### 10.1 Current State

**GalileoPanel** — no structured citations. The system prompt says "Based on your uploaded P&L..." but there's no structured source reference.

**AskGalileoCard** — has `supporting_sources` (array of strings) and `missing_data` (array of strings) in the response meta. Displayed as:
- `↳ {source}` (supporting sources)
- `Missing: {data}` (missing data)
- `→ {next_step}` (recommended next step)

### 10.2 What Is Missing (Valuation)

No valuation-specific citation types:
- No "View Evidence" action
- No "Open Source" action
- No "Open Related Section" action
- No document/extracted_field/assessment/adjustment/benchmark/calculation/verification/advisor_conclusion/version/initiative source references
- No client-safe source labels
- No internal ID hiding for business owners

---

## 11. Active-Business Switching

### 11.1 Current State

`GalileoPanel` and `AskGalileoCard` both resolve business via:
```
targetBusinessId || activeContext?.businessId || undefined
```

`activeContext` comes from `useAuth()` — the `BusinessContextEngineProvider`.

When the active business changes, `activeContext.businessId` changes, and the next Galileo call uses the new business. However:
- **GalileoPanel** does NOT reset messages on business switch
- **AskGalileoCard** does NOT reset conversation on business switch
- No "active context" header showing current business
- No cross-business leakage prevention

### 11.2 What Is Missing (Valuation)

- No valuation_id in active context
- No conversation reset on valuation switch
- No "Viewing: My Business · Valuation · Maintainable Earnings" header
- No cross-valuation leakage prevention

---

## 12. Existing System Prompts

### 12.1 GalileoPanel System Prompt

Hardcoded in `GalileoPanel.jsx` (lines 51-94). Key rules:
- "You are Galileo, the AI Strategic Advisor inside the V.I.S.I.O.N. Platform™"
- Dynamic advisory lens (Tax Strategist, Valuation Advisor, etc.) — invisible to user
- Data priority: page context → canonical recommendations → verified values → document fields → assessments → sprint → KB → general AI
- Intelligence labels: VERIFIED, PROJECTED, HYPOTHESIS, ADVISOR-CONFIRMED
- Response format: What I'm Seeing / Why It Matters / Hidden Opportunity / Risks / Strategic Hypothesis / Recommended Next Action

### 12.2 askGalileo System Prompt

Hardcoded in `askGalileo/entry.ts` (lines 122-200). Key rules:
- "BIE decides. Strategy Library enriches. Galileo explains."
- Never fabricate numbers
- Must reference canonical recommendation_key
- Intelligence labels (same 4)
- Response format: JSON with category, answer, recommendation_key, supporting_sources, missing_data, recommended_next_step, confidence_level, intelligence_labels, hypotheses_surfaced, gated_detail

### 12.3 What Is Missing (Valuation)

No `valuation_advisor` mode. No valuation-specific:
- Context loading rules
- Suggested prompt sets
- Available actions
- Permission boundaries
- Answer format (Answer / Why / Evidence / Confidence / Recommended Next Action)
- Citation expectations
- Client-safe filtering rules
- Prohibited autonomous actions list

---

## 13. Existing Memory Behavior

### 13.1 Current State

**GalileoPanel** — no memory. Messages are local state, lost on close.

**AskGalileoCard** — conversation persisted to `galileo_conversations`. On mount, does NOT load previous conversations (starts fresh). Conversation ID is set after first message.

`buildGalileoContext` fetches last 5 messages from most recent `GalileoConversation` as `chat_history`.

### 13.2 What Is Missing (Valuation)

- No scoped memory (profile_id + business_id + valuation_id + conversation_mode)
- No "sections reviewed" memory
- No "draft content" memory
- No "preferred explanation depth" memory
- No "pending questions" memory
- No "navigation history" memory
- No mutable-value reload rule (always reload current valuation facts from backend)
- No published-version immutable reference rule

---

## 14. Missing Valuation Connections

### Complete Gap Inventory

| Valuation Capability | Galileo Connection | Status |
|---------------------|-------------------|--------|
| Active business | `activeContext.businessId` | ✅ Exists |
| Active valuation | None | ❌ Missing |
| Current workspace | None | ❌ Missing |
| Current section | None | ❌ Missing |
| User assignment + permissions | None | ❌ Missing |
| Valuation lifecycle state | None | ❌ Missing |
| Latest approved calculations | None | ❌ Missing |
| Current evidence state | None | ❌ Missing |
| Open verification items | None | ❌ Missing |
| Publication blockers | None | ❌ Missing |
| Build Value findings | None | ❌ Missing |
| Growth Plan candidates | None | ❌ Missing |
| Published versions | None | ❌ Missing |
| Client-safe boundaries | None | ❌ Missing |
| Valuation requests (owner) | None | ❌ Missing |
| Admin request management | None | ❌ Missing |
| Version intelligence | None | ❌ Missing |
| Field governance | None | ❌ Missing |
| Evidence lineage | None | ❌ Missing |

**Every single valuation capability is disconnected from Galileo.**

---

## 15. Duplicate Systems to Avoid

### 15.1 Do NOT Create

1. **A separate valuation chatbot** — Galileo is the only AI interface
2. **A separate AI panel** — use the existing `GalileoPanel` / `AskGalileoCard`
3. **A separate assistant identity** — Galileo remains "Galileo"
4. **A parallel conversation system** — use `galileo_conversations` + `GalileoConversation`
5. **A third backend function** — extend `buildGalileoContext` or create ONE new `getGalileoValuationContext` that reuses existing valuation services
6. **A separate context model** — extend the existing context contract additively
7. **A separate permission model** — reuse `valuationAuth.ts` and `valuation_assignments`
8. **A separate visual design** — use the existing premium dark glass system
9. **A competing progress engine** — reuse `computeStages` from `ValuationExperienceShell`
10. **A separate next-action resolver** — reuse the readiness/progress data from the UI

### 15.2 Pre-Existing Duplication to Consolidate (Phase 13.4B)

The two Galileo chat implementations (`GalileoPanel` + `AskGalileoCard`) should eventually be unified. For Phase 13.4A, both must be made valuation-aware additively. Phase 13.4B should consolidate them into a single component with a shared backend function.

---

## 16. Recommended Additive Integration Points

### 16.1 Backend (Additive)

**Option A (Preferred):** Create ONE new backend function `getGalileoValuationContext` that:
- Reuses `resolveProfileAndBusiness` from `galileoBieConsumer`
- Reuses `valuationAuth.ts` for assignment + permission resolution
- Reuses `valuationService.getValuationSummary` for valuation summary
- Reuses `valuationCalculationService.getCalculationSummary` for calculations
- Reuses `verificationQueueService` for verification items
- Reuses `intelligenceEngine` for build value findings
- Reuses `growthPlanEngine` for growth plan candidates
- Reuses `deliverablesEngine` for deliverable status
- Reuses `deltaEngine` for version intelligence
- Returns the context contract defined in Section 17

**Option B:** Extend `buildGalileoContext` to accept `valuation_id` and conditionally include valuation data. Less clean but fewer functions.

**Recommendation:** Option A. A separate function keeps the valuation context contract clean and avoids bloating `buildGalileoContext` (which is already 724 lines).

### 16.2 Frontend (Additive)

1. **`AppLayout`** — pass `valuationId` and `workspaceKey` to `GalileoPanel` (derived from route)
2. **`GalileoPanel`** — accept `valuationId`, `workspaceKey`, `sectionKey` props; call `getGalileoValuationContext` when valuation context is active; show "Viewing:" context line; show valuation brief; show workspace-specific suggested questions
3. **`AskGalileoCard`** — same additive changes (or unify with `GalileoPanel` in Phase 13.4B)
4. **`ValuationExperienceShell`** — no changes needed (Galileo is global via AppLayout)
5. **`BusinessValuation`** — no changes needed (Galileo is global via AppLayout)

### 16.3 Conversation Scoping (Additive)

- Add `valuation_id` and `conversation_mode` to `galileo_conversations` (migration required)
- Reset conversation when `valuation_id` changes
- Show active context in conversation header

### 16.4 System Prompt (Additive)

- Add a `valuation_advisor` mode section to the system prompt
- Conditional inclusion based on `conversation_mode`
- No change to the base Galileo identity

---

## 17. Context Contract (Proposed)

The proposed `getGalileoValuationContext` response structure:

```
{
  business_context: {
    business_id,
    business_name,
    business_family_type
  },
  valuation_context: {
    valuation_id,
    valuation_name,
    lifecycle_status,
    engagement_type,
    purpose,
    valuation_date,
    current_workspace,
    current_section,
    latest_published_version,
    shared_version
  },
  access_context: {
    current_profile_id,
    app_role,
    assignment_role,         // lead | contributor | reviewer | publisher | viewer | business_owner | client_team
    can_view,
    can_edit,
    can_review,
    can_publish,
    can_manage_assignments,
    client_safe_only          // true for business_owner / client_team
  },
  readiness: {
    discover_completion,
    validation_open_count,
    build_value_completion,
    calculation_readiness,
    publication_readiness,
    critical_blockers,
    warnings,
    stale_calculations
  },
  approved_outputs: {
    normalized_ebitda,
    normalized_sde,
    maintainable_earnings,
    enterprise_value,
    enterprise_value_range,
    defensible_value,
    potential_value,
    equity_value,
    confidence,
    advisor_conclusion
  },
  evidence_summary: {
    document_count,
    extraction_count,
    verified_fields,
    conflicting_fields,
    missing_fields,
    assessment_count,
    evidence_gaps
  },
  verification_summary: {
    critical_items,
    high_priority_items,
    waiting_on_owner,
    waiting_on_advisor,
    publication_blockers
  },
  build_value_summary: {
    strongest_dimension,
    weakest_dimension,
    largest_ebitda_constraint,
    largest_multiple_constraint,
    largest_transferability_risk,
    value_drivers,
    value_detractors
  },
  growth_plan_summary: {
    candidate_initiatives,
    approved_initiatives,
    client_visible_initiatives
  },
  version_summary: {
    current_version,
    prior_version,
    enterprise_value_delta,
    equity_value_delta,
    confidence_delta,
    attribution_summary
  }
}
```

**Rules:**
- All values come from existing valuation services — no new calculations
- `null` / `[]` for missing data — never fabricated
- `client_safe_only=true` → suppress internal fields (draft calculations, internal notes, methodology weights, unsupported adjustments, hidden risks)
- Deep detail loaded on demand (separate action), not in the initial context

---

## 18. Permission Boundaries (Proposed)

### 18.1 Server-Side Enforcement (Authoritative)

| Role | Context Access | Approved Outputs | Internal Details | Draft Content | Actions |
|------|---------------|-----------------|-----------------|---------------|---------|
| Super Admin | Full | Full | Full | Full | Read + Draft + Controlled Write |
| Assigned Advisor (can_edit) | Full | Full | Full | Full | Read + Draft + Controlled Write |
| Reviewer (can_review) | Full | Full | Full | Read | Read + Draft |
| Publisher (can_publish) | Full | Full | Full | Read | Read + Draft + Publish actions |
| Viewer (can_view only) | Full | Full | Read | Read | Read only |
| Unassigned Advisor | Denied | Denied | Denied | Denied | Denied |
| Business Owner | Client-safe only | Approved only | Denied | Denied | Read + Draft owner content |
| Client Team | Client-safe only | Approved only | Denied | Denied | Read only |

### 18.2 Enforcement Points

1. `getGalileoValuationContext` — resolves assignment from `valuation_assignments`, sets `client_safe_only`, filters output
2. `askGalileo` (extended) — checks `client_safe_only` before including internal context in LLM prompt
3. System prompt — includes `client_safe_only` rules (defense in depth, NOT sole enforcement)

### 18.3 Reuse Existing

- `valuationAuth.ts` (`base44/shared/valuationEngine/valuationAuth.ts`) — already has assignment resolution
- `valuationService.getValuationSummary` — already returns `assignment` with permission flags
- `valuation_assignments` table — already has `can_view`, `can_edit`, `can_review`, `can_publish`, `can_manage_assignments`

---

## 19. Conversation Scoping (Proposed)

### 19.1 Scoping Key

Every valuation conversation scoped to:
```
{
  profile_id,
  business_id,
  valuation_id,
  conversation_mode,        // 'general' | 'valuation_advisor'
  client_safe               // boolean
}
```

### 19.2 Switching Rules

- Business switch → start new scoped thread (or reset context)
- Valuation switch → start new scoped thread (or reset context)
- Workspace switch → same thread, update `current_workspace` in context
- Mode switch (general → valuation_advisor) → same thread, update mode

### 19.3 Leakage Prevention

- Never allow Business A facts in Business B context
- Never allow Valuation A facts in Valuation B context
- Always reload current valuation facts from backend (never trust cached mutable values)
- Published versions may be referenced as immutable historical facts

### 19.4 UI

- Show active context in conversation header: "Viewing: My Business · Valuation · Maintainable Earnings"
- Show `client_safe` indicator for owner/client views

---

## 20. Initial Command Set (Mapped)

### 20.1 Read-Only Commands (Phase 13.4A.4)

| # | Command | Workspace | Data Source | Client-Safe |
|---|---------|-----------|-------------|-------------|
| 1 | Summarize This Valuation | All | `approved_outputs` + `readiness` | Yes (filtered) |
| 2 | What Should I Do Next? | All | `readiness` + next-action resolver | Yes (filtered) |
| 3 | Explain Enterprise Value | Valuation | `approved_outputs.enterprise_value` | Yes |
| 4 | Explain Equity Value | Valuation | `approved_outputs.equity_value` | Yes |
| 5 | Why Is Confidence Limited? | Valuation | `approved_outputs.confidence` + `evidence_summary` | Yes (filtered) |
| 6 | Show Publication Blockers | Valuation/Deliverables | `readiness.critical_blockers` | No (advisor only) |
| 7 | Show Missing Information | Discover/Validate | `evidence_summary.missing_fields` + `verification_summary` | Yes (filtered) |
| 8 | Explain Maintainable Earnings | Valuation | `approved_outputs.maintainable_earnings` | Yes |
| 9 | Explain the Selected Multiple | Valuation | `approved_outputs` (multiple) | Yes (filtered) |
| 10 | Show Top Value Drivers | Build Value | `build_value_summary.value_drivers` | Yes (filtered) |
| 11 | Show Top Value Risks | Build Value | `build_value_summary.value_detractors` | Yes (filtered) |
| 12 | What Changed Since the Last Version? | Deliverables | `version_summary` | Yes (filtered) |
| 13 | Prepare Advisor Brief | All | Full context | No (advisor only) |
| 14 | Draft Client Explanation | Deliverables | `approved_outputs` (filtered) | Yes |
| 15 | Draft Request for Missing Information | Validate | `verification_summary` | No (advisor only) |
| 16 | Open the Relevant Section | All | Navigation action | Yes |

### 20.2 Command → Mode Mapping

- Commands 1-12, 14, 16 → Available in `valuation_advisor` mode for all roles (filtered by `client_safe_only`)
- Commands 13, 15 → Available in `valuation_advisor` mode for advisor roles only

### 20.3 Prohibited Autonomous Actions (All Modes)

Galileo must NEVER autonomously:
- Change source financial data
- Approve an add-back
- Change maintainable earnings
- Select or change a multiple
- Select methodology
- Set reconciliation weights
- Approve confidence
- Approve advisor conclusion
- Publish
- Share
- Revoke sharing
- Restore or archive
- Assign an advisor
- Convert a valuation request
- Modify a published version

These require existing controlled workflows and authorized human approval.

---

## 21. Implementation Risks

### 21.1 High Risk

1. **Two Galileo implementations drift** — `GalileoPanel` and `AskGalileoCard` may diverge if only one is updated. **Mitigation:** Update both in Phase 13.4A, unify in Phase 13.4B.

2. **Context payload bloat** — The valuation context contract adds 8 new sections. If loaded eagerly, it could slow Galileo opening. **Mitigation:** Load compact summary only; deep detail on demand.

3. **Permission bypass via LLM prompt** — If `client_safe_only` is only enforced in the system prompt (not in the backend context), the LLM could leak internal data. **Mitigation:** Filter context in `getGalileoValuationContext` BEFORE sending to LLM. System prompt is defense in depth only.

4. **Cross-business/cross-valuation leakage** — If conversation scoping doesn't reset on switch, Business A facts could appear in Business B context. **Mitigation:** Reset conversation on `valuation_id` change; always reload from backend.

5. **Stale data represented as current** — If Galileo caches valuation values and the valuation changes, it could present stale values as current. **Mitigation:** Always reload from backend; never cache mutable valuation values in conversation memory.

### 21.2 Medium Risk

6. **`GalileoPanel` conversation persistence gap** — Currently `GalileoPanel` doesn't persist. Adding valuation conversations without persistence means lost context. **Mitigation:** Add persistence in Phase 13.4A.2 or accept ephemeral valuation conversations for Phase 13.4A.

7. **`galileo_conversations` schema migration** — Adding `valuation_id` and `conversation_mode` requires a Supabase migration. **Mitigation:** Additive columns with defaults; no breaking change.

8. **OpenRouter model consistency** — `askGalileo` uses gpt-4o-mini; `GalileoPanel` uses `InvokeLLM` (automatic model). Valuation answers may need higher quality. **Mitigation:** Use `model: "claude_sonnet_4_6"` for valuation_advisor mode (costs more credits — note this to the user).

9. **Existing non-valuation Galileo behavior** — Must not break dashboard, sprint, assessment, journey Galileo behavior. **Mitigation:** `valuation_advisor` mode is conditional; base mode unchanged.

### 21.3 Low Risk

10. **Route parsing for workspace_key** — Extracting `ws` query param from `/advisory/valuation/:id?ws=discover` is straightforward.

11. **Suggested question sets** — 7 workspace-specific sets are static content, easy to add.

12. **Visual integration** — Existing Galileo panel design is premium dark; valuation brief and context line fit naturally.

---

## 22. Stop Condition Confirmation

Phase 13.4A.1 is complete. The following have been delivered:

- [x] **Existing Galileo architecture audited** — 2 chat implementations, 3 backend functions, 1 shared module, 1 entity, 6 journey-only components, 4 dashboard widgets
- [x] **Reusable integration points identified** — `buildGalileoContext`, `askGalileo`, `galileoBieConsumer`, `GalileoPanel`, `AskGalileoCard`, `galileo_conversations`, `valuationAuth.ts`, `valuationService`, `valuationCalculationService`, `verificationQueueService`, `intelligenceEngine`, `growthPlanEngine`, `deliverablesEngine`, `deltaEngine`
- [x] **Duplicate assistant architecture explicitly avoided** — No separate valuation chatbot/panel/identity will be created; Galileo remains the single AI interface; the pre-existing `GalileoPanel` vs `AskGalileoCard` duplication is documented and flagged for Phase 13.4B consolidation
- [x] **Context contract defined** — Section 17 (8 new context sections with field-level specifications)
- [x] **Permission boundaries defined** — Section 18 (8 roles × 6 permission dimensions, server-side enforcement)
- [x] **Conversation scoping defined** — Section 19 (5-field scoping key, switching rules, leakage prevention)
- [x] **Initial command set mapped** — Section 20 (16 commands, workspace mapping, client-safe filtering, prohibited autonomous actions)
- [x] **Implementation risks documented** — Section 21 (12 risks, 3 high / 4 medium / 5 low, with mitigations)

### Verdict

**READY FOR GALILEO VALUATION CONTEXT REVIEW**

Phase 13.4A.2 (Build valuation context service, enforce permissions, add conversation scoping) should NOT begin until this audit is reviewed and approved.

---

## Appendix A: File Inventory

### Galileo Core (Chat)
- `src/components/galileo/GalileoButton.jsx` — floating launcher
- `src/components/galileo/GalileoPanel.jsx` — global drawer (no persistence)
- `src/components/galileo/AskGalileoCard.jsx` — embedded card (with persistence)
- `base44/functions/askGalileo/entry.ts` — Q&A backend (OpenRouter)
- `base44/functions/buildGalileoContext/entry.ts` — context aggregator
- `base44/functions/generateGalileoInsights/entry.ts` — insight formatter
- `base44/shared/galileoBieConsumer/entry.ts` — shared BIE consumer module

### Galileo Journey (Not Chat — Do Not Modify)
- `src/components/experience/PersistentGalileo.jsx`
- `src/components/experience/GalileoCoach.jsx`
- `src/components/experience/GalileoWelcome.jsx`
- `src/components/experience/GalileoHelpBubble.jsx`
- `src/components/experience/GalileoTimeline.jsx`
- `src/components/galileo/GalileoGuidance.jsx`

### Galileo Dashboard Widgets (Not Chat)
- `src/components/dashboard/GalileoCardInsight.jsx`
- `src/components/dashboard/GalileoEducationModal.jsx`
- `src/components/dashboard/GalileoAdvisorCard.jsx`
- `src/components/galileo/GalileoGuidanceCard.jsx`
- `src/components/galileo/GalileoPageGuide.jsx`
- `src/components/galileo/GalileoBadge.jsx`

### Galileo Mount Point
- `src/components/layout/AppLayout.jsx` — mounts `GalileoButton` + `GalileoPanel` globally

### Galileo Entity
- `base44/entities/GalileoConversation.jsonc` — messages array, `questions_used`, RLS by `created_by`

### Valuation Services to Reuse
- `base44/shared/valuationEngine/valuationAuth.ts` — assignment + permission resolution
- `src/lib/valuationService.js` — `getValuationSummary`, `getValuationAccessSummary`
- `src/lib/valuationCalculationService.js` — `getCalculationSummary`, `validatePublicationReadiness`
- `src/lib/verificationQueueService.js` — verification queue
- `base44/shared/valuationEngine/intelligenceEngine.ts` — build value findings
- `src/lib/valuation/growthPlanEngine.js` — growth plan candidates
- `src/lib/valuation/deliverablesEngine.js` — deliverable status
- `base44/shared/valuationEngine/deltaEngine.ts` — version intelligence

---

## Appendix B: Phase 13.4A Subphase Roadmap

| Subphase | Scope | Status |
|----------|-------|--------|
| 13.4A.1 | Audit, context contract, permission boundaries, conversation scoping, command mapping, risk documentation | ✅ Complete (this document) |
| 13.4A.2 | Build `getGalileoValuationContext`, enforce permissions, add conversation scoping | ⏸ Pending review |
| 13.4A.3 | Page awareness, contextual brief, workspace-specific suggested questions | ⏸ Pending |
| 13.4A.4 | Read-only commands, evidence references, navigation actions | ⏸ Pending |
| 13.4A.5 | Draft-only advisor/client content commands, confirmation model | ⏸ Pending |

**Stop after 13.4A.1. Do not begin 13.4A.2 automatically.**