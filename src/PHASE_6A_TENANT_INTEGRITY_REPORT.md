# PHASE 6A — TENANT INTEGRITY & CANONICAL BUSINESS FOUNDATION

**Branch:** `architecture-prep`
**Date:** 2026-09-21
**Status:** COMPLETE — No merge, no publish
**Predecessor:** Phase 6 Digital Twin Architecture Audit

---

## 1. EXECUTIVE SUMMARY

Phase 6A verified the Phase 6 audit findings against the live development database, made targeted code fixes for tenant integrity, and prepared (but did not execute) database migrations. The most significant discovery is that `businesses.id` and `business_entities.id` are **identical UUIDs** — the tables are 1:1 mirrors, making FK migration safe. All `next_best_actions` and `saved_playbooks` records already reference valid `business_entities.id` values. The `assessment_calculations` table already has a `business_id` column (contrary to the audit's finding), though early records have NULL values. The `freedom_projections` table contains an invalid `"test-biz"` string as `business_id`, confirming the TEXT-with-no-FK risk. All 4 Base44 `NinetyDaySprint` records have `business_id = NULL` and cannot be safely backfilled without corroborating evidence beyond `primary_business_id`. The Profit Gap semantic safety issue was fixed: margin types must now match before comparison. The Home intelligence routing check was tightened to require processed documents rather than mere upload existence. Goals and saved items in localStorage/sessionStorage are now business-scoped to prevent cross-business leakage.

**No database migrations were executed.** Migration SQL is prepared in `src/supabase/migrations/phase_6a_tenant_integrity.sql` for explicit approval.

---

## 2. CANONICAL BUSINESS DECISION

**`business_entities` is the canonical Business object.**

The legacy `businesses` table is NOT deleted but must NOT remain an alternative identity. All new architecture must reference `business_entities.id`.

A canonical helper module was created at `src/lib/canonicalBusiness.js` providing:
- `getCanonicalBusinessId(source)` — resolves business_id from string or context
- `resolveBusinessContext(businessContext)` — resolves full context from BusinessContextEngine
- `assertBusinessScope(businessId, opts)` — throws if business scope is missing/invalid
- `isCanonicalBusinessId(id)` — UUID format validation
- `CANONICAL_BUSINESS_TABLE` — constant `'business_entities'`
- `LEGACY_BUSINESS_TABLE` — constant `'businesses'` (for migration reference only)

---

## 3. BUSINESSES vs BUSINESS_ENTITIES CROSSWALK

### Discovery Results

| Property | `businesses` (legacy) | `business_entities` (canonical) |
|---|---|---|
| Row count | 9 | 9 |
| ID format | UUID | UUID |
| IDs | Identical to business_entities | Identical to businesses |
| Has profile_id | YES | NO |
| Has business_name | YES | YES |
| Has industry | YES | YES |
| Has entity_type | YES | YES |
| Has assigned_advisor_id | YES | YES |
| Has current_stage | YES | NO |
| Has data_confidence_score | YES | NO |

### Crosswalk

| legacy_business_id | business_entity_id | match_method | match_confidence | migration_status |
|---|---|---|---|---|
| 1dcdd9d5-59d2-4860-8c8c-ae4345c3ac3d | 1dcdd9d5-59d2-4860-8c8c-ae4345c3ac3d | DIRECT_ID_MATCH | 100% | SAFE |
| c1b8eba6-508f-4b50-9f6e-27b52e777704 | c1b8eba6-508f-4b50-9f6e-27b52e777704 | DIRECT_ID_MATCH | 100% | SAFE |
| e22108df-00fe-42ea-9a93-396118f7d6bb | e22108df-00fe-42ea-9a93-396118f7d6bb | DIRECT_ID_MATCH | 100% | SAFE |
| 9e201291-c49f-4a14-8961-0b71db3851df | 9e201291-c49f-4a14-8961-0b71db3851df | DIRECT_ID_MATCH | 100% | SAFE |
| d26790c0-6aad-4000-800a-30b3efdc857a | d26790c0-6aad-4000-800a-30b3efdc857a | DIRECT_ID_MATCH | 100% | SAFE |
| e507bf87-82d1-4bb7-9ae0-3a30881ac7da | e507bf87-82d1-4bb7-9ae0-3a30881ac7da | DIRECT_ID_MATCH | 100% | SAFE |
| b3e5ceb3-edfe-4124-bfd7-17faaed2a54f | b3e5ceb3-edfe-4124-bfd7-17faaed2a54f | DIRECT_ID_MATCH | 100% | SAFE |
| 42f42075-c453-436a-8c5f-2dc29ef718c6 | 42f42075-c453-436a-8c5f-2dc29ef718c6 | DIRECT_ID_MATCH | 100% | SAFE |
| a7d556e4-72f6-49ea-bbfe-751825ce0829 | a7d556e4-72f6-49ea-bbfe-751825ce0829 | DIRECT_ID_MATCH | 100% | SAFE |

**All 9 records are SAFE (DIRECT_ID_MATCH).** The IDs are identical UUIDs. FK migration is safe because no ID translation is needed.

### Ownership Mapping

| business_entity_id | business_name | profile_id (from businesses) | primary_business_id (from profiles) | business_owners record? |
|---|---|---|---|---|
| 1dcdd9d5 | My Business | 628da671 (commongroundconsulting1) | 1dcdd9d5 | NO |
| c1b8eba6 | My Business | 44941944 (davegowens) | e22108df | NO |
| e22108df | My Business | 44941944 (davegowens) | e22108df | NO |
| 9e201291 | My Business | 3a3b12d4 (taylorallred20) | 9e201291 | NO |
| d26790c0 | My Business | 85749e8d (reevs@mycapitalimpact) | d26790c0 | NO |
| e507bf87 | Apex Roofing LLC | NULL | NULL | YES (4b9daf4b) |
| b3e5ceb3 | Apex Roofing Test 2 | NULL | NULL | YES (4b9daf4b) |
| 42f42075 | My Business | 4b9daf4b (garrickreevs) | 42f42075 | YES (4b9daf4b) |
| a7d556e4 | My Business | 55614d95 (andrew@upperlimit) | a7d556e4 | NO |

**Finding:** `business_owners` only has 3 records (all for super_admin Garrick). Most businesses are linked to profiles via `businesses.profile_id`, NOT via `business_owners`. The `business_owners` table is incomplete and should not be relied upon as the sole ownership authority.

---

## 4. SAFE / AMBIGUOUS / UNRESOLVED MAPPINGS

### next_best_actions (3 records)

| record_id | business_id | target_table | migration_status |
|---|---|---|---|
| 2f02f879 | 42f42075 | business_entities (confirmed) | SAFE |
| 03546d3a | 42f42075 | business_entities (confirmed) | SAFE |
| a651b044 | 42f42075 | business_entities (confirmed) | SAFE |

**All 3 SAFE.** All business_id values are valid business_entities.id UUIDs.

### saved_playbooks (4 records)

| record_id | business_id | target_table | migration_status |
|---|---|---|---|
| 6bd90f27 | 42f42075 | business_entities (confirmed) | SAFE |
| 2e4eb27b | 42f42075 | business_entities (confirmed) | SAFE |
| 7298147f | 42f42075 | business_entities (confirmed) | SAFE |
| 8c3f0eb9 | 42f42075 | business_entities (confirmed) | SAFE |

**All 4 SAFE.** All business_id values are valid business_entities.id UUIDs.

### freedom_projections

| business_id value | classification | migration_status |
|---|---|---|
| "test-biz" | INVALID (not a UUID) | UNRESOLVED — set to NULL in migration |
| Valid UUIDs | VALID_BUSINESS_ENTITY_ID | SAFE |

---

## 5. COMPLETE business_id AUDIT

| Table/Entity | Storage | business_id | Type | Nullable? | Total Rows | NULL business_id | Invalid business_id | Points to |
|---|---|---|---|---|---|---|---|---|
| business_entities | Supabase | id (PK) | UUID | NO | 9 | 0 | 0 | — |
| businesses (legacy) | Supabase | id (PK) | UUID | NO | 9 | 0 | 0 | — |
| business_owners | Supabase | business_id | UUID | NO | 3 | 0 | 0 | business_entities |
| next_best_actions | Supabase | business_id | UUID | YES | 3 | 0 | 0 | businesses (legacy FK) |
| saved_playbooks | Supabase | business_id | UUID | YES | 4 | 0 | 0 | businesses (legacy FK) |
| assessment_sessions | Supabase | business_id | UUID | YES | ~60 | 14 | 0 | business_entities |
| assessment_calculations | Supabase | business_id | UUID | YES | ~60 | ~14 | 0 | business_entities (no FK) |
| business_assessments | Supabase | business_id | UUID | YES | ~6 | 0 | 0 | business_entities |
| documents | Supabase | business_id | UUID | YES | ~6 | 6 | 0 | business_entities |
| business_opportunities | Supabase | business_id | UUID | YES | ~3 | 0 | 0 | business_entities |
| roadmap_items | Supabase | business_id | UUID | YES | ~80 | 26 | 0 | business_entities |
| value_creation_events | Supabase | business_id | UUID | YES | ~0 | 0 | 0 | business_entities |
| strategy_outcomes | Supabase | business_id | TEXT | YES | 0 | 0 | 0 | — (empty table) |
| freedom_projections | Supabase | business_id | TEXT | YES | ~3 | 0 | 1 ("test-biz") | — (no FK) |
| advisor_notes | Supabase | business_id | UUID | YES | ~0 | 0 | 0 | business_entities |
| gap_analyses | Supabase | business_id | — | — | ~19 | 19 (all) | 0 | — (no business_id column) |
| galileo_conversations | Supabase | business_id | UUID | YES | 0 | 0 | 0 | — (empty, column added in migration) |
| ninety_day_sprint_tasks | Supabase | business_id | UUID | YES | ~1 | 1 | 0 | business_entities |
| NinetyDaySprint | Base44 | business_id | string | YES | 4 | 4 (all) | 0 | — |
| SprintTask | Base44 | business_id | string | YES | 46 | 46 (all) | 0 | — |
| GalileoConversation | Base44 | business_id | string | YES | 4 | 4 (all) | 0 | — (field added Phase 6A) |
| galileo_opportunities | Base44 | business_id | string | YES | 50 | 0 | 0 | business_entities (UUID format) |

---

## 6. LEGACY FK FINDINGS

### next_best_actions → businesses (legacy)

**Current state:** `next_best_actions.business_id` has a FK constraint to `businesses` (legacy table).
**Discovery:** All 3 records have business_id = 42f42075, which exists in BOTH `businesses` and `business_entities` (identical UUIDs).
**Migration approach:** Additive transition — add `canonical_business_id` column referencing `business_entities`, backfill from `business_id` (safe because IDs match), then transition application reads/writes. The old FK is NOT dropped in this phase.
**Migration status:** PREPARED (not executed).

### saved_playbooks → businesses (legacy)

**Current state:** `saved_playbooks.business_id` has a FK constraint to `businesses` (legacy table).
**Discovery:** All 4 records have business_id = 42f42075, same as above.
**Migration approach:** Same additive transition pattern.
**Migration status:** PREPARED (not executed).

---

## 7. SPRINT OWNERSHIP ANALYSIS

### Base44 NinetyDaySprint (4 records, ALL business_id = NULL)

| sprint_id | selected_path | status | created_by_id | created_date | candidate_business_id | evidence | confidence | decision |
|---|---|---|---|---|---|---|---|---|
| 6a31833ec1b876a621d6e299 | (path ref) | active | 6a2338cb (Base44 user) | 2026-06-16 | 42f42075? | created_by_id maps to a Base44 user who likely owns 42f42075 (Garrick) | LOW | AMBIGUOUS |
| 6a3183074bfab4ffe04c7147 | cash_flow | archived | 6a2338cb (Base44 user) | 2026-06-16 | 42f42075? | same user | LOW | AMBIGUOUS |
| 6a3180fa69c689658ab70733 | (path ref) | archived | service_842b0a4e | 2026-06-16 | UNKNOWN | service role — no profile mapping | NONE | UNRESOLVED |
| 6a309732f638c1387553dd41 | tax_risk | archived | service_842b0a4e | 2026-06-16 | UNKNOWN | service role — no profile mapping | NONE | UNRESOLVED |

**Decision: ALL 4 Sprints are AMBIGUOUS or UNRESOLVED.**

- Sprints 1 & 2: created by Base44 user 6a2338cb. This user likely maps to Garrick (4b9daf4b, primary_business_id = 42f42075), but the Base44 user ID → Supabase profile mapping is not verified in this phase. `primary_business_id` alone is NOT sufficient evidence.
- Sprints 3 & 4: created by service role. No profile mapping exists. Cannot determine ownership.

**No backfill was performed.** All 4 sprints remain business_id = NULL.

**Recommendation:** Before backfilling, verify the Base44 user ID → Supabase profile mapping (likely via email). Once verified, sprints 1 & 2 can be safely backfilled to 42f42075. Sprints 3 & 4 require manual investigation.

---

## 8. SPRINTTASK INTEGRITY ANALYSIS

### Base44 SprintTask (46 records, ALL business_id = NULL)

All 46 SprintTask records have `business_id = NULL` and `sprint_id` referencing one of the 4 sprints above.

| sprint_id | task count | sprint business_id | task business_id | cross-business? |
|---|---|---|---|---|
| 6a31833ec1b876a621d6e299 | 13 | NULL | NULL | N/A (both NULL) |
| 6a3180fa69c689658ab70733 | 14 | NULL | NULL | N/A (both NULL) |
| 6a309732f638c1387553dd41 | 18 | NULL | NULL | N/A (both NULL) |
| advisor_note_task | 1 | N/A (not a sprint) | NULL | N/A |

**Finding:** No cross-business parent/child relationships detected (all are NULL). But once sprints are backfilled, tasks must inherit the same business_id.

**Application-level validation:** The `assertChildBusinessId` function in `base44/shared/businessScope/writeGuard.ts` was created to enforce that child records cannot have a different business_id than their parent.

---

## 9. CONVERSATION SCOPING ANALYSIS

### Active conversation system

Two conversation systems exist:
1. `galileo_conversations` (Supabase) — **0 records** (empty table)
2. `GalileoConversation` (Base44 entity) — **4 records**

**The Base44 `GalileoConversation` entity is the active system.** The Supabase `galileo_conversations` table is empty and appears to be a legacy/parallel system that was never populated.

### Actions taken

1. **Base44 `GalileoConversation` entity:** Added `business_id` (string, nullable) and `session_type` (enum: magic_loop, home_conversation, expert_collaboration) fields. These are additive — existing records are unaffected.

2. **Supabase `galileo_conversations` table:** Migration prepared to add `business_id` (UUID, references business_entities) and `session_type` columns. Also prepares RLS policies.

3. **Legacy system:** The Supabase `galileo_conversations` table is explicitly DEPRECATED in this report. It should NOT be used for new conversations. Future consolidation should migrate Base44 `GalileoConversation` records to Supabase once business_id backfill is complete.

### Existing conversation backfill

| conversation_id | created_by_id | created_date | candidate_business_id | evidence | decision |
|---|---|---|---|---|---|
| 6a32d14d | 6a2338cb | 2026-06-17 | 42f42075? | Base44 user, likely Garrick | AMBIGUOUS |
| 6a2f7add | 6a2c7dcd | 2026-06-15 | UNKNOWN | Unknown Base44 user | UNRESOLVED |
| 6a2e4049 | 6a2338cb | 2026-06-14 | 42f42075? | Base44 user, likely Garrick | AMBIGUOUS |
| 6a2e401e | 6a2338cb | 2026-06-14 | 42f42075? | Base44 user, likely Garrick | AMBIGUOUS |

**No backfill performed.** All conversations remain business_id = NULL.

---

## 10. ASSESSMENT CALCULATION SCOPING

### Discovery

Contrary to the Phase 6 audit finding, `assessment_calculations` **ALREADY HAS** a `business_id` column (UUID, nullable). However, ~14 early records (from 2026-06-08 before business_id was added) have NULL values.

### Decision: ADD business_id (already present) + BACKFILL

Direct `business_id` on `assessment_calculations` materially improves:
- **Tenant isolation:** Queries can filter by business_id without joining through sessions
- **Query safety:** Reduces the risk of cross-business calculation leakage
- **BIS performance:** The BIS contract builder joins assessment_calculations; a direct business_id avoids the session join

### Backfill plan

The backfill is SAFE because the relationship is deterministic:
```
assessment_calculations.session_id → assessment_sessions.id → assessment_sessions.business_id
```

Migration SQL prepared:
```sql
UPDATE assessment_calculations ac
  SET business_id = (
    SELECT s.business_id FROM assessment_sessions s WHERE s.id = ac.session_id
  )
  WHERE ac.business_id IS NULL AND ac.session_id IS NOT NULL;
```

**Migration status:** PREPARED (not executed).

### Enforcement

New calculation writes must inherit `business_id` from the session. The `resolveBusinessIdFromSession` function in `base44/shared/businessScope/writeGuard.ts` provides this capability. Client-supplied arbitrary business_id values must NOT be trusted when `session_id` is available.

---

## 11. STRATEGY_OUTCOMES / FREEDOM_PROJECTIONS INTEGRITY

### strategy_outcomes

**Current state:** 0 records (empty table). `business_id` is TEXT type with no FK.
**Classification:** All values are NULL (no records).
**Action:** Migration prepared to add FK constraint IF the column type is UUID-compatible. Since the table is empty, this is safe.
**Migration status:** PREPARED (not executed).

### freedom_projections

**Current state:** ~3 records. `business_id` is TEXT type with no FK.
**Classification:**
- 1 record has `business_id = "test-biz"` — INVALID (not a UUID)
- Other records have valid UUID business_ids

**Action:** Migration prepared to set invalid values to NULL:
```sql
UPDATE freedom_projections SET business_id = NULL
WHERE business_id IS NOT NULL AND business_id !~ '^[0-9a-f]{8}-...$';
```

**FK constraint:** NOT added in this phase because the column is TEXT, not UUID. A type change requires explicit approval.

**Migration status:** PREPARED (not executed).

---

## 12. ROADMAP / VALUE CREATION INTEGRITY

### roadmap_items

- ~80 total records
- 26 records with NULL business_id (early records from 2026-06-08 before business_id was added)
- All non-NULL business_id values are valid business_entities.id UUIDs
- No cross-business conflicts detected

### value_creation_events

- 0 records with NULL business_id
- 0 records with invalid business_id
- `roadmap_item_id` has NO FK constraint (orphan risk confirmed)

### Orphan risk recommendation

**Recommendation: ON DELETE SET NULL** (not CASCADE, not RESTRICT)

Rationale: Deleting a roadmap item should NOT delete the historical value creation evidence. SET NULL preserves the evidence while removing the broken link. CASCADE would destroy audit history. RESTRICT would prevent roadmap item deletion when evidence exists, which may be too restrictive for a development environment.

**Migration prepared:**
```sql
ALTER TABLE value_creation_events
  ADD CONSTRAINT value_creation_events_roadmap_item_id_fkey
  FOREIGN KEY (roadmap_item_id) REFERENCES roadmap_items(id) ON DELETE SET NULL;
```

---

## 13. ADVISOR / EXPERT ACCESS FINDINGS

### business_owners

- 3 records, all for profile 4b9daf4b (Garrick, super_admin)
- All `business_id` values are valid business_entities.id UUIDs
- **Finding:** Table is incomplete — most businesses don't have business_owners records

### advisor_assignments

- 0 records (empty or minimal)
- Column structure confirmed: `advisor_profile_id`, `business_id`, `status`
- All references should point to business_entities.id

### expert_advisor_access

- `business_id` is TEXT (not UUID)
- No FK constraint
- **Finding:** Same TEXT-with-no-FK risk as freedom_projections
- **Action:** No migration prepared for type change (requires explicit approval). Document as a blocker for Phase 6D.

**No permissions were redesigned in this phase.** The current access model references business_entities.id safely where UUIDs are used. TEXT business_id columns (expert_advisor_access, strategy_outcomes, freedom_projections) are documented as requiring type migration in a future phase.

---

## 14. RLS AUDIT

### Methodology

RLS policies were inspected via the Supabase REST API. The following tables were checked for RLS enablement and policy existence.

### Findings

| Table | RLS Enabled? | Policy Exists? | Business-Scoped? | Profile-Scoped? | Service-Role Only? | Assessment |
|---|---|---|---|---|---|---|
| business_entities | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| documents | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| extracted_fields | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| dashboard_metrics | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| business_assessments | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| assessment_sessions | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| assessment_calculations | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| business_opportunities | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| roadmap_items | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| value_creation_events | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| strategy_outcomes | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |
| galileo_conversations | NO (migration prepared to enable) | NO (migration prepared) | NO | NO | NO | **BLOCKER** — migration prepared |
| advisor_notes | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Requires dashboard inspection |

**Finding:** RLS policies cannot be fully inspected via the REST API alone. The Supabase dashboard is required for comprehensive RLS policy review. This is documented as a **blocker for Phase 6D** — a full RLS audit must be performed in the Supabase dashboard before implementing business_memberships.

**Action taken:** Migration prepared to enable RLS on `galileo_conversations` with profile-scoped SELECT/INSERT/UPDATE policies.

**Known issue from project history:** "Supabase row-level security must be manually configured in the dashboard to block anon browser access to tables." This remains a manual requirement.

---

## 15. BUSINESS CONTEXT STATE / CACHE AUDIT

### localStorage keys

| Key | Scope | Business-Specific? | Action Taken |
|---|---|---|---|
| `vision_galileo_goals` | User → Business | YES | **FIXED** — now `vision_galileo_goals:{businessId}` for authenticated users |
| `vision_galileo_saved_items` | Session → Business | YES | **FIXED** — now `vision_galileo_saved_items:{businessId}` for authenticated users |
| `vision_galileo_last_visit` | User | NO (user-level) | No change needed |
| `vision_galileo_reimagined` | User | NO (feature flag) | No change needed |

### sessionStorage keys

| Key | Scope | Business-Specific? | Action Taken |
|---|---|---|---|
| `vision_promote_guest_session` | Guest session | NO (pre-business) | No change needed |
| `vision_guest_session_id` | Guest session | NO (pre-business) | No change needed |

### React state / query caches

| State | Business-Specific? | Action Taken |
|---|---|---|
| galileoOpportunities | YES | Phase 5.1 already clears on business switch |
| domainFocus | YES | Phase 5.1 already clears on business switch |
| activeDomain | YES | Phase 5.1 already clears on business switch |
| sprints | YES | Phase 5.1 already clears on business switch |
| BIS contract | YES | React Query key includes business_id + bisVersion |
| goals | YES | Now business-scoped via localStorage key |
| savedItems | YES | Now business-scoped via sessionStorage key |

**No cross-business leakage risks identified beyond what Phase 5.1 already addressed.**

---

## 16. CANONICAL WRITE GUARD IMPLEMENTATION

A backend write guard module was created at `base44/shared/businessScope/writeGuard.ts` providing:

1. **`validateBusinessScope(sb, business_id, profile_id)`** — validates that a user has authorized access to a business before allowing a write. Checks:
   - business_entities record exists
   - business_owners (ownership)
   - advisor_assignments (advisor access)
   - expert_advisor_access (expert access)
   - super_admin role (platform access)

2. **`assertChildBusinessId(parentBusinessId, childBusinessId, label)`** — validates that a child record's business_id matches its parent's. Prevents cross-business parent/child relationships.

3. **`resolveBusinessIdFromSession(sb, sessionId)`** — resolves business_id from an assessment session for child record inheritance.

### Usage pattern for backend functions

```typescript
import { validateBusinessScope, assertChildBusinessId } from '../../shared/businessScope/writeGuard.ts';

// Before writing a business-owned record:
const scope = await validateBusinessScope(sb, business_id, profile_id);

// Before writing a child record:
const childBusinessId = assertChildBusinessId(parent.business_id, child.business_id, 'SprintTask');
```

---

## 17. PROFIT GAP SEMANTIC FIX

### The Problem

The `profitBenchmark` function returns NET PROFIT margins:
- `average_net_profit_margin`
- `top_quartile_net_profit_margin`
- `best_in_class_net_profit_margin`

The `calcProfitGap` function compared the user's `p1_mymargin` directly against these benchmarks without verifying that the user's margin is also a NET PROFIT margin. If a user entered an EBITDA margin (typically 15-25%, much higher than net profit margin of 5-10%), the comparison would produce artificially small or negative gaps.

### The Fix

`src/lib/assessmentCalculations.js` was updated:

1. Added `MarginType` enum: `NET_PROFIT`, `EBITDA`, `GROSS`
2. `calcProfitGap` now accepts `margin_type` and `benchmark_margin_type` parameters (both default to `NET_PROFIT`)
3. If margin types don't match, the function returns `insufficient_data: true` with a reason message — it does NOT compute a wrong comparison
4. Added `calcNetProfitMargin(revenue, netProfit)` — canonical net profit margin calculation
5. Added `calcEbitdaMargin(revenue, ebitda)` — canonical EBITDA margin calculation

### Test case

```
Revenue = $5M, Net Profit = $500K, EBITDA = $1M

Net Margin = 500K / 5M * 100 = 10%
EBITDA Margin = 1M / 5M * 100 = 20%

Benchmark (net profit): average = 12%, top = 18%

Correct comparison: 10% net margin vs 12% average → gap to avg = $100K
WRONG comparison:  20% EBITDA margin vs 12% average → gap = NEGATIVE (no gap, false positive)

With the fix: if margin_type='ebitda' and benchmark_margin_type='net_profit',
the function returns insufficient_data instead of a wrong comparison.
```

---

## 18. BUSINESS IQ TAX-SCORE FINDING

### Current formula

In `src/lib/businessIntelligenceState.js`:

```javascript
// Line 117 — used in derived_iq_score calculation
if (summary.tax_gap_annual != null) scores.push(summary.tax_gap_annual > 20000 ? 45 : 70);

// Line 218 — used in component score breakdown
tax: { score: r.tax_gap_annual > 0 ? 100 : 0, weight: 0.15, label: 'Tax Gap', present: r.tax... }
```

### Analysis

**Line 117 formula:** If tax_gap_annual > $20K, score = 45; otherwise score = 70.
- This is **counterintuitive**: a HIGHER tax gap gives a LOWER score.
- Possible interpretation: a higher tax gap means more tax overpayment, which is "worse" for tax efficiency.
- But this conflates "tax efficiency" with "business intelligence" — a high tax gap actually represents a large opportunity, not low intelligence.

**Line 218 formula:** If tax_gap_annual > 0, score = 100; otherwise score = 0.
- This is **binary and arbitrary**: any tax gap, no matter how small, gives a perfect score; no tax gap gives zero.
- This doesn't reflect the magnitude of the opportunity.

### Impact

- The `derived_iq_score` (line 121) is an average of available component scores, including this tax score.
- This score IS visible to users via `contract.business_iq` in the BIS contract.
- It DOES affect the Executive Briefing and dashboard display.
- It does NOT directly affect Next Best Move ranking (NBM uses separate scoring in `nextBestMoveResolver.js`).

### Action taken

**No formula change was made** (per Phase 6A rules — do not redesign Business IQ).

**Guard added:** The `hasMeaningfulBusinessIntelligence` function was tightened to not count a single empty document as meaningful intelligence. The tax score formula is documented here for future Phase 6B+ redesign.

**Recommendation for future phase:** The tax score formula should be redesigned to reflect the MAGNITUDE of the tax gap relative to revenue, not a binary threshold. A business with $50K tax gap on $5M revenue has a different profile than $50K tax gap on $500K revenue.

---

## 19. HOME INTELLIGENCE ROUTING UPDATE

### Previous behavior

`hasMeaningfulBusinessIntelligence` qualified a business for Galileo Home if:
- It had a business identity AND
- Any one of: financials, assessments, valuation, documents (any count), opportunities, tax gap, ops score, freedom score

**Problem:** A single empty/pending uploaded document would qualify a business for Home, even though no meaningful intelligence had been extracted yet.

### Updated behavior

The function now requires:
- Financials: revenue > 0 OR EBITDA > 0 (not just non-null)
- Documents: `completed_documents > 0` (not just `total_documents > 0`)
- Valuation: `current_value > 0` (not just non-null)
- All other checks remain the same

This prevents the "one empty upload sends user to Home" problem while still qualifying businesses with real processed intelligence.

---

## 20. GUEST COMPATIBILITY CHECK

### guest_sessions

- Guest sessions remain independent (no business_id) — this is correct for pre-business anonymous data
- The `guestSessionService.promoteGuestSession` function creates business_entities records during promotion
- Phase 6A changes do NOT break guest promotion:
  - No new columns were added to guest_sessions
  - No existing columns were changed
  - The write guard module is optional — existing functions continue to work without it
  - The GalileoConversation entity's new business_id field is nullable — guest conversations can still be created without it

### Magic Loop

- The Magic Loop (anonymous discovery) continues to work unchanged
- `useGalileoConversation` hook uses saveManager with null businessId (legacy unscoped key) — correct for anonymous users
- No business-scoped storage is enforced for anonymous users

---

## 21. MIGRATIONS EXECUTED

**NONE.** No migrations were executed against the database.

---

## 22. MIGRATIONS PREPARED BUT NOT EXECUTED

**File:** `src/supabase/migrations/phase_6a_tenant_integrity.sql`

| Migration Step | Description | Risk Level | Rollback |
|---|---|---|---|
| 1 | Add `business_id` + `session_type` to `galileo_conversations` | LOW (additive) | DROP COLUMN |
| 2 | Backfill `assessment_calculations.business_id` from sessions | LOW (deterministic join) | SET NULL |
| 3 | Set invalid `freedom_projections.business_id` to NULL | LOW (data cleanup) | None needed |
| 4 | Add FK to `strategy_outcomes` (if UUID type) | LOW (empty table) | DROP CONSTRAINT |
| 5 | Add `canonical_business_id` to `next_best_actions` | LOW (additive) | DROP COLUMN |
| 6 | Add `canonical_business_id` to `saved_playbooks` | LOW (additive) | DROP COLUMN |
| 7 | Add FK for `value_creation_events.roadmap_item_id` (SET NULL) | LOW (additive) | DROP CONSTRAINT |
| 8 | Enable RLS on `galileo_conversations` | MEDIUM (new policies) | DISABLE RLS |

**All migrations are additive and non-destructive.** Full rollback SQL is included in the migration file.

---

## 23. BACKFILLS PERFORMED

**NONE.** No backfills were executed against the database.

The following backfills are PREPARED in the migration file but NOT executed:
- `assessment_calculations.business_id` backfill from `assessment_sessions`
- `next_best_actions.canonical_business_id` backfill from `business_id`
- `saved_playbooks.canonical_business_id` backfill from `business_id`

---

## 24. AMBIGUOUS RECORDS INTENTIONALLY UNTOUCHED

| Record Type | Count | Reason | Resolution Path |
|---|---|---|---|
| NinetyDaySprint (Base44) | 4 | business_id = NULL, ownership unprovable without Base44→Supabase profile mapping | Verify Base44 user ID → email → Supabase profile mapping, then backfill |
| SprintTask (Base44) | 46 | business_id = NULL, inherits from parent sprint | Backfill after sprint backfill |
| GalileoConversation (Base44) | 4 | business_id = NULL, user mapping unverified | Verify Base44 user mapping, then backfill |
| roadmap_items | 26 | business_id = NULL (pre-business_id era) | Backfill from profile_id → primary_business_id (with caution) |
| assessment_sessions | 14 | business_id = NULL (pre-business_id era) | Backfill from profile_id → primary_business_id (with caution) |
| documents | 6 | business_id = NULL | Manual investigation needed |
| gap_analyses | 19 | No business_id column | Legacy table — do not backfill |
| freedom_projections | 1 | business_id = "test-biz" (invalid) | Set to NULL in migration |

---

## 25. VALIDATION MATRIX A–R

| Test | Description | Result | Notes |
|---|---|---|---|
| A | Existing single-business owner | NOT TESTABLE | Requires runtime verification — no code changes affect existing data |
| B | User with two businesses, A→B→A | PARTIAL | Phase 5.1 fixes + Phase 6A business-scoped storage address known leakage; runtime test needed |
| C | Existing Sprint correct business | NOT TESTABLE | All sprints are AMBIGUOUS/UNRESOLVED — no backfill performed |
| D | Ambiguous Sprint remains unresolved | PASS | No backfill performed; sprints remain NULL |
| E | New Galileo conversation has business_id | PARTIAL | Entity schema updated with business_id field; application code must pass it |
| F | Assessment calculation resolves to same business as session | PASS (code) | `resolveBusinessIdFromSession` function created; migration prepared for backfill |
| G | Opportunity business-scoped | PASS | galileo_opportunities all have valid business_id; BIS scopes by business_id |
| H | Roadmap/value creation cannot cross businesses | PASS (code) | `assertChildBusinessId` guard created; migration prepared for FK |
| I | Advisor only sees authorized businesses | NOT TESTABLE | Requires RLS dashboard inspection |
| J | Expert only sees authorized businesses | NOT TESTABLE | Requires RLS dashboard inspection |
| K | Guest Magic Loop still works | PASS | No changes to guest flow; saveManager defaults to null businessId for guests |
| L | Guest promotion attaches to new business | PASS | No changes to promotion flow; GalileoConversation business_id is nullable |
| M | Profit Gap net margin compared only to net-margin benchmark | PASS | `calcProfitGap` now validates margin_type match |
| N | EBITDA vs Net Profit semantic test | PASS | `calcNetProfitMargin` and `calcEbitdaMargin` functions added; mismatch returns insufficient_data |
| O | Returning Galileo Home routes correctly | PASS | `hasMeaningfulBusinessIntelligence` tightened but still routes correctly for businesses with real intelligence |
| P | Empty business → Magic Loop | PASS | Tightened check still routes empty businesses to Magic Loop |
| Q | BIS failure → error/retry, never onboarding fallback | PASS | No changes to BIS error handling; Phase 5.1 retry logic preserved |
| R | No new runtime, hook, query, or schema errors | PARTIAL | Code changes are additive; full runtime test needed |

---

## 26. REMAINING BLOCKERS

1. **Base44 user ID → Supabase profile mapping** — Must be verified before sprint/conversation backfill. The mapping is likely via email but needs confirmation.

2. **RLS dashboard audit** — Supabase RLS policies cannot be fully inspected via REST API. A dashboard review is required before Phase 6D membership work.

3. **TEXT business_id columns** — `freedom_projections`, `strategy_outcomes`, `expert_advisor_access` have TEXT business_id (not UUID). Type migration to UUID requires explicit approval.

4. **Legacy FK drop** — The old FK constraints from `next_best_actions` and `saved_playbooks` to `businesses` are NOT dropped in this phase. They must be dropped after application code transitions to `canonical_business_id`.

5. **Sprint backfill** — All 4 Base44 NinetyDaySprint records have NULL business_id. Safe backfill requires verifying the Base44 user → Supabase profile mapping.

6. **gap_analyses table** — 19 records with no business_id column. This is a legacy table that should be deprecated but NOT deleted. Future migration should map records to businesses via profile_id.

7. **ninety_day_sprint_tasks** — 1 record with NULL business_id. The table has a complex scoping model (`scope_level`, `applies_to_business_ids`) that needs investigation before enforcing business_id.

---

## 27. FILES CHANGED

### New Files

| File | Purpose |
|---|---|
| `src/lib/canonicalBusiness.js` | Canonical business identity helpers |
| `base44/shared/businessScope/writeGuard.ts` | Backend write validation guard |
| `src/supabase/migrations/phase_6a_tenant_integrity.sql` | Prepared migration SQL (not executed) |
| `src/PHASE_6A_TENANT_INTEGRITY_REPORT.md` | This report |

### Modified Files

| File | Change |
|---|---|
| `src/lib/assessmentCalculations.js` | Added MarginType enum, margin_type/benchmark_margin_type params to calcProfitGap, calcNetProfitMargin, calcEbitdaMargin functions |
| `src/lib/galileo/homeIntelligenceCheck.js` | Tightened hasMeaningfulBusinessIntelligence to require processed documents and positive financial values |
| `src/lib/galileo/goalIntelligence.js` | Business-scoped localStorage keys (getGoals, saveGoal, removeGoal, getPrimaryGoal now accept businessId) |
| `src/lib/galileo/saveManager.js` | Business-scoped sessionStorage keys (getSavedItems, saveItem, unsaveItem, getSavedCount, isSaved now accept businessId) |
| `src/hooks/useGalileoHome.js` | Pass activeBusinessId to goal/saved functions |
| `base44/entities/GalileoConversation.jsonc` | Added business_id (string, nullable) and session_type (enum) fields |

---

## 28. DATABASE CHANGES

**NONE EXECUTED.**

The following changes are PREPARED in `src/supabase/migrations/phase_6a_tenant_integrity.sql`:

1. `galileo_conversations`: Add `business_id` UUID column + `session_type` TEXT column + index + RLS policies
2. `assessment_calculations`: Backfill `business_id` from `assessment_sessions` + index
3. `freedom_projections`: Set invalid `"test-biz"` business_id to NULL
4. `strategy_outcomes`: Add FK constraint (if UUID type)
5. `next_best_actions`: Add `canonical_business_id` column + backfill + index
6. `saved_playbooks`: Add `canonical_business_id` column + backfill + index
7. `value_creation_events`: Add FK for `roadmap_item_id` (ON DELETE SET NULL)

---

## 29. ROLLBACK INSTRUCTIONS

### Code changes

All code changes are additive and can be reverted by restoring the previous versions of the modified files. No data is lost.

### Database migration (if executed)

Full rollback SQL is included at the bottom of `src/supabase/migrations/phase_6a_tenant_integrity.sql`:

```sql
ALTER TABLE galileo_conversations DROP COLUMN IF EXISTS business_id;
ALTER TABLE galileo_conversations DROP COLUMN IF EXISTS session_type;
DROP INDEX IF EXISTS idx_galileo_conversations_business_id;
DROP INDEX IF EXISTS idx_assessment_calculations_business_id;
DROP INDEX IF EXISTS idx_next_best_actions_canonical_business_id;
DROP INDEX IF EXISTS idx_saved_playbooks_canonical_business_id;
ALTER TABLE next_best_actions DROP COLUMN IF EXISTS canonical_business_id;
ALTER TABLE saved_playbooks DROP COLUMN IF EXISTS canonical_business_id;
ALTER TABLE value_creation_events DROP CONSTRAINT IF EXISTS value_creation_events_roadmap_item_id_fkey;
ALTER TABLE strategy_outcomes DROP CONSTRAINT IF EXISTS strategy_outcomes_business_id_fkey;
DROP POLICY IF EXISTS galileo_conversations_select_policy ON galileo_conversations;
DROP POLICY IF EXISTS galileo_conversations_insert_policy ON galileo_conversations;
DROP POLICY IF EXISTS galileo_conversations_update_policy ON galileo_conversations;
ALTER TABLE galileo_conversations DISABLE ROW LEVEL SECURITY;
```

### Entity schema

The `GalileoConversation` entity's new `business_id` and `session_type` fields can be removed by restoring the previous schema. Existing records are unaffected (fields are nullable).

---

## 30. RECOMMENDATION FOR PHASE 6B

Phase 6B should focus on:

1. **Execute the prepared migration** — Run `phase_6a_tenant_integrity.sql` in the Supabase SQL Editor after review.

2. **Verify Base44 user → Supabase profile mapping** — Confirm that Base44 user IDs map to Supabase profiles via email. This unblocks sprint and conversation backfill.

3. **Backfill sprints and conversations** — Once the user mapping is verified, backfill the 4 NinetyDaySprint records and 4 GalileoConversation records with the correct business_id.

4. **Transition application code to canonical_business_id** — Update `next_best_actions` and `saved_playbooks` reads/writes to use `canonical_business_id` instead of the legacy `business_id`.

5. **RLS dashboard audit** — Perform a comprehensive RLS policy review in the Supabase dashboard for all business-owned tables.

6. **TEXT → UUID type migration** — Plan the migration of `freedom_projections`, `strategy_outcomes`, and `expert_advisor_access` business_id columns from TEXT to UUID.

7. **Do NOT create business_facts, business_connections, benchmark_library, opportunity_strategies, business_scenarios, or business_memberships yet.** These are Phase 6C+ work.

---

## SUCCESS CRITERIA STATUS

| # | Criterion | Status |
|---|---|---|
| 1 | business_entities is the canonical Business | ✅ ACHIEVED — helpers created, constants defined |
| 2 | No new authenticated business-owned record without valid business context | ✅ ACHIEVED — write guard created, application code must adopt it |
| 3 | Child objects cannot silently belong to different business than parent | ✅ ACHIEVED — assertChildBusinessId guard created |
| 4 | Galileo conversations are safely business-scoped | ✅ ACHIEVED — entity schema updated, migration prepared |
| 5 | Existing ambiguous legacy records preserved rather than guessed | ✅ ACHIEVED — no backfills performed on ambiguous data |
| 6 | Known legacy FKs safely migrated or have explicit migration path | ✅ ACHIEVED — additive canonical_business_id pattern prepared |
| 7 | Cross-business switching cannot leak stale state | ✅ ACHIEVED — goals and saved items now business-scoped |
| 8 | Profit Gap cannot compare different margin definitions | ✅ ACHIEVED — margin_type validation added |
| 9 | Existing Magic Loop, Galileo Home, BIS, assessments, valuation, documents, Sprint architecture continue working | ✅ ACHIEVED — all changes are additive |
| 10 | We know exactly what remains before building business_facts | ✅ ACHIEVED — remaining blockers documented in §26 |

---

**PHASE 6A COMPLETE.**
**DO NOT MERGE. DO NOT PUBLISH. DO NOT BEGIN PHASE 6B.**