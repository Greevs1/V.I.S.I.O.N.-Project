# Shared Intelligence Contract — Enforcement (Phase C.1)

> **Status: CERTIFIED ✅** — Architecture freeze enforced as of Phase C.1.
> Run `node scripts/certify-intelligence-contract.cjs` to re-verify.

## Purpose

This document codifies the architectural boundary that protects the Shared
Supabase Intelligence Contract as the **single certified authoritative owner**
for all current-business intelligence.

Phase C.1 retires the Base44 `Assessment` and `Document` entities as
**persistence authorities**. Supabase is now the sole system of record. All
presentation consumers (Dashboard, Galileo, Executive Brief, Living
Intelligence) and all backend functions read current-business truth from the
contract — never directly from legacy persistence.

## The Dependency Direction (Immutable)

```
Supabase Persistence
    ↓
Certified Domain Owners (baselineResolver, businessIntelligenceContract, assessmentLoader)
    ↓
Shared Business Intelligence Contract
    ↓
Synthesis (executiveNarrativeEngine, buildGalileoContext, BIS)
    ↓
Presentation (Dashboard, Galileo, Executive Brief, Living Intelligence)
```

No layer may bypass the layer above it. Presentation never reads persistence
directly. Synthesis never reads persistence directly — it reads the contract.

## What Was Retired in Phase C.1

### Base44 Assessment Entity

| Role | Before Phase C.1 | After Phase C.1 |
|------|-----------------|-----------------|
| **Writes** | 6 functions wrote assessment results to Base44 Assessment | **0 writes** — all writes go to Supabase (`assessment_sessions`, `assessment_calculations`, `business_assessments`) |
| **Reads** | 8 backend functions read from `base44.entities.Assessment` | **0 reads** — all reads go to Supabase via `assessmentLoader.ts` |
| **Frontend** | AssessmentContext mirrored results to Base44 Assessment | Mirror writes **frozen**; Supabase is sole authority |

**Migrated functions (reads):**
- `generateOpportunities` — now uses `loadAssessmentResults()`
- `generateAdvisorCommandCenter` — now reads Supabase `business_assessments`
- `ninetyDaySprint` (generatePaths) — now uses `loadAssessmentResults()`
- `knowledgeBaseEngine` (ingestFromInsights) — now uses `loadBusinessAssessmentSummaries()`
- `valuationService` (3 call sites) — now uses `loadAssessmentResults()` + `loadBusinessAssessmentSummaries()`
- `verificationQueueService` — now uses `loadAssessmentResults()`
- `debugAssessmentFlow` — rewritten to compare 3 Supabase layers (was Base44 vs Supabase)

**Frozen writes:**
- `AssessmentContext.jsx` — Supabase-only persistence
- `hydrateDashboardFromJourney` — Supabase-only
- `profitBenchmark` — cache retired, computed fresh
- `valueBenchmark` — cache retired, computed fresh

### Base44 Document Entity

| Role | Status |
|------|--------|
| **Persistent consumers** | **0** — Supabase `documents` table is the sole authority |
| **Transient uses** | None — all document access is backend-mediated via Supabase |

## The Shared Helper

`base44/shared/intelligenceContract/assessmentLoader.ts` provides the canonical
read path for assessment data. All backend functions that need assessment
results import from here — never copy the session-join logic.

```typescript
import { loadAssessmentResults, loadBusinessAssessmentSummaries } from
  '../../shared/intelligenceContract/assessmentLoader.ts';

// Computed results (full calculation output) — business-scoped
const { byType, list } = await loadAssessmentResults(sb, businessId);

// Summary rows (score, opportunity level, findings) — business-scoped
const summaries = await loadBusinessAssessmentSummaries(sb, businessId);
```

## Enforcement Mechanisms

### 1. Architecture Guard (`scripts/architectureGuard.cjs`)

Static analysis that detects forbidden dependencies:
- Presentation layer importing persistence directly
- Base44 Assessment/Document entity usage outside allowed zones
- Cross-layer boundary violations

### 2. Certification Test (`scripts/certify-intelligence-contract.cjs`)

8 checks, all must pass:

1. ✅ Architecture Guard — no forbidden direct dependencies
2. ✅ Contract Field Registry exists
3. ✅ Contract Field Registry — has all 8 domains
4. ✅ Base44 Assessment — no authoritative writes (frozen)
5. ✅ Base44 Assessment — no authoritative reads (migrated to Supabase)
6. ✅ Base44 Document — zero persistent consumers
7. ✅ Cache keys — business-scoped queries include business_id
8. ✅ Contract consumer registration — certified owners exist

### 3. Contract Field Registry (`base44/shared/intelligenceContract/contractFieldRegistry.ts`)

Machine-readable registry of all contract-exposed fields with domain, owner,
nullability, and scoping metadata. Consumers validate against this registry
to ensure they only read certified fields.

## Null Semantics (Permanent Rule)

| Value | Meaning |
|-------|---------|
| `null` | unknown / unavailable |
| `0` | measured zero |
| `undefined` | treated as `null` (never as `0`) |
| `false` | ≠ missing |

## Business Scoping (Permanent Rule)

All current-business intelligence is **business_id scoped**. No function may
return cross-business results. The contract builder enforces this at
construction time; consumers receive only their authorized business's state.

## Adding New Intelligence Fields

1. Add the field to `businessIntelligenceContract.ts` (the contract builder).
2. Register it in `contractFieldRegistry.ts` with domain, owner, nullability.
3. Add the Supabase source query to the builder.
4. Consumers read it from the contract — never directly from Supabase.

Never bypass the contract for current-business truth. If a field is missing,
extend the contract.