# Shared Supabase Intelligence Contract — Phase C Certification

## Status: CERTIFIED ✅

**Date:** 2026-08-13
**Contract Version:** 1.0.0
**Authority:** `base44/shared/intelligenceContract/businessIntelligenceContract.ts`

---

## 1. Purpose

The Shared Supabase Intelligence Contract is the **single certified owner** of all
current-business intelligence state. Every consumer — Dashboard, Galileo, Executive
Brief, Living Intelligence — reads from the same contract. No consumer resolves
persistent business truth independently.

## 2. Contract Authority

### Owner
`buildBusinessIntelligenceContract(sb, business_id, profile_id)`

### Location
`base44/shared/intelligenceContract/businessIntelligenceContract.ts`

### Embedding
The contract is embedded in the assessment summary returned by
`supabaseUserData.getAssessmentSummary`:
```
summary.intelligence_contract = { ...full contract... }
```

### Consumer Access
- **Dashboard:** `assessmentSummary.intelligence_contract` (via `bis._sources.assessmentSummary`)
- **BIE Engine:** `as?.intelligence_contract` (preferred over legacy resolution)
- **Executive Brief:** `bis._sources.assessmentSummary.intelligence_contract.assessments[type].completed`
- **Galileo:** `contract` (built directly via `buildBusinessIntelligenceContract`)
- **Living Intelligence:** `bis._canonicalMeta` + contract fields via BIE

## 3. Certified Fields

### Valuation
| Field | Owner | Source Priority |
|-------|-------|-----------------|
| `current_value` | Value Gap assessment_calculations | calc → dashboard_metrics → business_assessments |
| `potential_value` | Value Gap assessment_calculations | calc → dashboard_metrics |
| `value_gap` | Value Gap assessment_calculations | calc → dashboard_metrics → derived formula |
| `baseline_value` | `baselineResolver.ts` | assessment_calculations (primary) → dashboard_metrics (secondary) |
| `verified_value_created` | Contract VCE sum | verified VCEs only (status='verified', confidence_level='verified') |

### Profitability
| Field | Owner | Source Priority |
|-------|-------|-----------------|
| `revenue` | extracted_fields → dashboard_metrics → snapshot | document-derived preferred |
| `net_profit` | extracted_fields → dashboard_metrics → snapshot | document-derived preferred |
| `reported_ebitda` | extracted_fields → dashboard_metrics → snapshot | document-derived preferred |
| `profit_gap` | Profit Gap assessment_calculations | calc → dashboard_metrics → business_assessments |

### Tax
| Field | Owner | Source Priority |
|-------|-------|-----------------|
| `annual_tax_gap` | Tax Gap assessment_calculations | calc → dashboard_metrics → business_assessments |
| `ten_year_tax_gap` | Derived | `annual_tax_gap × 10` |

### Operations
| Field | Owner | Source Priority |
|-------|-------|-----------------|
| `operations_score` | Operations Gap assessment_calculations | calc → dashboard_metrics → business_assessments |
| `monthly_value_of_time_freed` | Operations Gap assessment_calculations | calc → dashboard_metrics |
| `hours_freed_per_week` | Operations Gap assessment_calculations | calc → dashboard_metrics |

### Freedom
| Field | Owner | Source Priority |
|-------|-------|-----------------|
| `freedom_score` | Freedom assessment_calculations | calc → dashboard_metrics → business_assessments |

### Assessment Completion
| Field | Owner | Rule |
|-------|-------|------|
| `assessments[type].completed` | Contract | `hasResult (calc.result_json) OR hasBaScore (ba.score/ba.estimated_opportunity_value)` |

**Critical Rule:** A completed assessment with a zero result is still `completed: true`.
Consumers MUST NOT infer completion from a truthy metric value.

## 4. Consumer Conformance Matrix

| Consumer | Reads Contract | Independent Resolution Removed | Status |
|----------|:---:|:---:|:---:|
| Dashboard | ✅ | Baseline (now from contract) | ✅ Certified |
| BIE Engine | ✅ | — (prefers contract, legacy fallback) | ✅ Certified |
| Executive Brief | ✅ | `isAssessmentCompleted()` reads contract `completed` flag | ✅ Certified |
| Galileo | ✅ | Profile-scoped queries → business-scoped; baseline from contract; verified_value_created from contract | ✅ Certified |
| Living Intelligence | ✅ | — (enriches, does not resolve) | ✅ Certified |

## 5. Phase C Changes

### 5.1 Galileo Cross-Business Leakage Repair
- All profile-scoped queries (`dashboard_metrics`, `business_assessments`, `business_metric_snapshots`, `documents`, `extracted_fields`) now use `business_id` filter
- `current_metrics` consumes contract values instead of independent resolution
- `completedAssessments` uses contract's explicit `completed` flag (not row presence)
- Baseline read from contract (removed independent `resolveBaselineBusinessValue` call)
- `verified_value_created` total read from contract (event breakdown kept for AI reasoning)

### 5.2 Executive Brief Completion Flag
- Added `isAssessmentCompleted(bis, type)` helper to `executiveNarrativeEngine.js`
- Reads `contract.assessments[type].completed` (explicit flag, not metric inference)
- All six assessment narratives (Profit, Value, Tax, Operations, Recast, Freedom) now:
  - Show "not yet completed" ONLY when `completed === false`
  - Show "complete, no significant gap" when `completed === true` but result is zero/null
  - Show the data-rich narrative when `completed === true` and result is non-zero
- **Rule enforced:** If `completed = true`, the Executive Brief NEVER says "Not assessed"

### 5.3 Baseline Immutability
- `baselineResolver.ts` queries `assessment_sessions` by `business_id` (primary)
- Falls back to `profile_id` lookup (for pre-migration data)
- Secondary path: `dashboard_metrics` + `business_assessments` (transition)
- Baseline does NOT move when Current Value changes
- Each business has its own independent baseline

### 5.4 Materiality Policy
- `src/lib/bie/materialityPolicy.js` suppresses immaterial numeric drift (<$1000 or <0.1%)
- Applied upstream in `snapshots.js` `createSnapshot` — before journal entries are generated
- `HeroStoryCard.jsx` is presentation-only — reads certified contract props, no journal scanning

## 6. Business Isolation Guarantee

All contract queries are `business_id` scoped:
- `business_entities.eq('id', business_id)`
- `dashboard_metrics.eq('business_id', business_id)`
- `assessment_sessions.eq('business_id', business_id)`
- `business_assessments.eq('business_id', business_id)`
- `value_creation_events.eq('business_id', business_id)`
- `documents.eq('business_id', business_id)`
- `business_metric_snapshots.eq('business_id', business_id)`
- `extracted_fields.eq('business_id', business_id)`

Access control: owners can only access their own `primary_business_id`. Advisors/admins
can access any business.

## 7. Null Semantics

- `null` = no data available (NOT zero)
- `0` = explicitly zero (a real result)
- `verified_value_created: null` = no verified events (NOT 0)
- `baseline_value: null` = baseline not established

Consumers MUST distinguish `null` from `0`. A completed assessment with a zero result
is `completed: true` with `result: 0`, not `result: null`.

---

## Certification

This document certifies that the Shared Supabase Intelligence Contract is the sole
authoritative owner of current-business intelligence state across the V.I.S.I.O.N.
Platform. All consumers read from the contract. No consumer resolves persistent
business truth independently.

**Contract Owner:** `base44/shared/intelligenceContract/businessIntelligenceContract.ts`
**Baseline Owner:** `base44/shared/intelligenceContract/baselineResolver.ts`
**Materiality Owner:** `src/lib/bie/materialityPolicy.js