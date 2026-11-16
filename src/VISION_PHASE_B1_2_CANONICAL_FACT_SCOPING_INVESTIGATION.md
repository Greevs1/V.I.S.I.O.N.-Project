# VISION — Phase B1.2: Canonical-Fact Loader Scoping Investigation (Read-Only)

**Status:** INVESTIGATION COMPLETE — GO/NO-GO at §9. No application source was modified. One offline investigation harness added: `scripts/b12CanonicalFactScoping.test.cjs`. No production, schema, migration, RLS, or Digital-Twin changes. All Phase B1.1 changes preserved (verified untouched — §7).

---

## 1. Call-path trace (Galileo → canonical-fact loader)

1. **Galileo UI** → POST `base44/functions/buildGalileoContext/entry.ts`
2. **Authorization (upstream):** `requireBusinessContext` (canonical business kernel) at `buildGalileoContext/entry.ts:107` resolves and authorizes the business; missing context → 400 at L123–124.
3. **Adapter call:** `loadCanonicalFactsForConsumer(galileoCtx, business_id, …)` at `buildGalileoContext/entry.ts:395` → `base44/shared/canonicalFact/consumerAdapter.ts:171`, which calls **`loadIntelligenceContext(ctx, businessId)`** at `consumerAdapter.ts:198`.
4. **The loader:** `base44/shared/canonicalFact/contextLoader.ts:44` (`loadIntelligenceContext`) performs the profile-wide reads (§2).
5. **Candidates:** `resolverHelpers.ts:26–48` runs `FIELD_REGISTRY` resolvers over the loaded context; the resolvers read `ctx.dashboardMetrics` (`valuationEngine/intelligenceMapping.ts:89`), `ctx.profileFinancials` (L148), `ctx.businessAssessments` (L194).
6. **Selection:** `resolver.ts:resolveFact` picks the authoritative candidate; `consumerAdapter.ts:215` stamps the chosen fact `business_id: businessId` (the REQUESTED business).
7. **Surfacing:** `buildGalileoContext/entry.ts:433–435` applies canonical values over `current_metrics.revenue/net_profit/ebitda`, and L438–469 publishes the `canonical_facts` domain in the response context (L1007) — consumed by the Galileo answer engine.

## 2. Read inventory — current filtering and authorization

All reads below are in `base44/shared/canonicalFact/contextLoader.ts` (one file), observed live in the harness against a two-business fixture:

| Lines | Table | Current filter | Verdict |
|---|---|---|---|
| 51–55 | `business_entities` | `eq('id', businessId)` | business-scoped ✓ |
| 58–63 | `business_owners` | `eq('business_id', businessId)`; **L63: `ownerProfileId = businessOwners?.[0]?.profile_id \|\| profileId`** | scoped ✓, but the fallback adopts the ACTING profile |
| 66–70 | `profiles` | `eq('id', ownerProfileId)` | display data only |
| 73–77 | `documents` | `eq('business_id', businessId)` | business-scoped ✓ |
| 80–84 | `extracted_fields` | `eq('business_id', businessId)` | business-scoped ✓ |
| 90–93 | `document_analysis` | `in('document_id', …)` from business documents | business-derived ✓ |
| **109–113** | **`business_assessments`** | **`eq('profile_id', ownerProfileId)`** | **profile-wide ✗** |
| **116–122** | **`dashboard_metrics`** | **`eq('profile_id', ownerProfileId)`**, most-recent limit 1 | **profile-wide ✗** |
| **125–129** | **`gap_analyses`** | **`eq('profile_id', ownerProfileId)`** | **profile-wide ✗** |
| **132–136** | **`profile_financials`** | **`eq('profile_id', ownerProfileId)`** | **profile-wide ✗** |
| 139–145 | `business_valuations` (+ valuation_* keyed by that valuation) | `eq('business_id', businessId)` | business-scoped ✓ |

**Authorization:** the loader itself performs none. Both production entries authorize upstream — `buildGalileoContext:107` (`requireBusinessContext`) and `canonicalFactService/entry.ts` (`requireBusinessAccess`, 7 occurrences covering `getCanonicalFact` L83, `getCanonicalFacts` L122, `getCanonicalFactHistory` L174, `getCanonicalFactCandidates` L213, `shadowCompare` L244). An unauthorized user cannot reach the loader through either entry — but the loader is one unguarded caller away from a leak (defense-in-depth absent; X8 evidence below).

## 3. Confirmed findings vs hypotheses

**CONFIRMED (behaviorally reproduced, §4):**

- **F1 — Cross-business financial exposure.** For a multi-business owner, Business B's Galileo canonical facts resolve from Business A's `dashboard_metrics`, `business_assessments`, `gap_analyses`, and `profile_financials` rows. In the harness, Business B's canonical `revenue` resolved to **2,100,000** (Business A's assessment answer, `source: Assessment: profit_gap`) — not Business B's 500,000 — and the fact was tagged `business_id: b-B`. The whole path reaches the user: `current_metrics.revenue` override + `canonical_facts` domain + answer-engine context.
- **F2 — Business switching is inert.** Switching b-A → b-B does not change the resolved revenue (same profile-wide rows feed both).
- **F3 — Reverse exposure via the L63 fallback.** An advisor acting on a business with no `business_owners` row gets `ownerProfileId = advisor's own profile` → the advisor's own `dashboard_metrics` (harness: 999,999) is presented as the client business's canonical fact. Client-side leakage of the advisor's personal financials.
- **F4 — No fail-closed guard.** The loader accepts an empty `businessId` and still queries profile-wide (X8). Harmless today only because both entries validate presence upstream.
- **F5 — The loader is the family outlier.** The sibling consumers it claims to mirror (`verificationQueueService/entry.ts:134–137`, `valuationService/entry.ts:1645–1648`) read all four tables **`eq('business_id', businessId)`** — all four tables carry the column. The loader's profile-wide reads are a divergence, not a constraint.

**HYPOTHESES — DISPROVEN / superseded:**

- ~~"RLS would block the cross-business reads"~~ — moot for the finding: even authorized, business-scoped reads return Business A rows because the filter itself is profile-wide.
- ~~"The exposure is limited to the adapter's Galileo path"~~ — the same loader backs five `canonicalFactService` actions. However, its only caller today (`livingIntelligence/entry.ts:70`) invokes action `resolveFacts`, which **does not exist** in the service — that path fails silently in `Promise.allSettled`. No frontend callers exist (grep-verified). So the *live* exposure surface is exactly the Galileo context path plus the dormant service actions.

**Also confirmed (scope):** the four affected reads load cross-business rows into the returned `IntelligenceContext` even where resolvers don't consume them (`gap_analyses`, `profile_financials` for non-pilot facts) — the leak surface includes the context object itself (`getCanonicalFactCandidates` returns candidate content derived from it).

## 4. Reproducible evidence

`scripts/b12CanonicalFactScoping.test.cjs` — offline, esbuild-bundles the REAL `canonicalFact` modules (current, and a patched COPY built in a temp dir; app files never written) against an in-memory PostgREST-shaped two-business database (multi-business owner `p-owner` of `b-A`/`b-B`, advisor `p-adv`, ownerless `b-C`).

```
node scripts/b12CanonicalFactScoping.test.cjs
checks : 15/15 PASS — EVIDENCE COMPLETE
```

- **X1–X8 (current):** Business B resolves Business A values in canonical facts (X1); its intel context holds `dm-A`, `ba-A`, `ga-A`, `pf-A` rows (X2–X5); switching changes nothing (X6); the advisor fallback surfaces the advisor's own revenue as a client fact (X7); the loader runs with an empty business id (X8).
- **P1–P6 (patched copy — minimal correction):** Business B resolves only its own values (P1–P3); advisor-on-ownerless gets honest-empty, never their own data (P4); switching resolves each business's own value (P5); every read of the four tables carries a `business_id` predicate (P6).
- **M1 (mutation):** reverting the `dashboard_metrics` filter in the patched copy reintroduces a foreign value in Business B's context (999,999) and the harness catches it.

## 5. Recommended minimal patch (NOT applied — awaiting approval)

**One file: `base44/shared/canonicalFact/contextLoader.ts`. Four filters, replace-not-append (mirrors B1.1 and the sibling consumers' canonical pattern):**

- L112 `business_assessments`: `.eq('profile_id', ownerProfileId)` → `.eq('business_id', businessId)`
- L119 `dashboard_metrics`: same replacement
- L128 `gap_analyses`: same replacement
- L135 `profile_financials`: same replacement

**Optional second hardening (separate decision, not required to close F1/F3):** resolve the owner strictly (drop the `|| profileId` fallback at L63) and/or add a fail-closed `businessId` guard mirroring B1.1's `requireAuthorizedBusinessId`. With all four reads business-scoped, the L63 fallback no longer feeds any fact value (only the `profiles` display lookup and the always-empty Base44 assessment path), so this is hardening, not exposure closure.

**Authorized file list for implementation:** `base44/shared/canonicalFact/contextLoader.ts` (only). The offline suites (`scripts/b12CanonicalFactScoping.test.cjs` — converted from patched-copy mode to a regression suite asserting real source — plus re-runs of the B1.1 battery) are test scaffolding.

## 6. Regression risks

1. **Honest-empty for un-scoped businesses:** businesses whose `dashboard_metrics`/`business_assessments` rows pre-date `business_id` population will resolve canonical facts as missing and fall back to legacy values (the adapter's documented fallback) instead of borrowing a sibling business's rows. This is the same honest-empty tradeoff accepted in B1.1 and matches the legacy null-business finding (7 documents, one profile, June–October 2026 — those documents are not in this loader's financial path, but the same data-hygiene class applies).
2. **P-S3 actor-binding payload-compat (G18/G19):** that suite's fixtures carry `dashboard_metrics`/`business_assessments` rows WITHOUT `profile_id`, so today the profile-wide reads match nothing there and `canonical_facts` resolve empty; after the patch the business-scoped reads will MATCH, changing the Galileo payload the compat assertions compare against. **Re-baseline G18/G19 is required test coverage, not optional.**
3. **`canonical_facts` telemetry/shadow comparisons** will classify differently (period/source-authority differences vanish). No consumer asserts on shadow internals today (grep-verified), but the `canonical_shadow`/`canonical_telemetry` fields in `_meta` will change content.
4. **No B1.1 interference:** `galileoBieConsumer`, `askGalileo`, and `buildGalileoContext` (B1.1's three files) do not import the loader — grep-verified independent. B1.1's business-scoped reads in `buildGalileoContext` L158–160 already use `business_id`, and the patched loader converges with them (removes a data-divergence between the same response's two metric sources).

## 7. Codex snapshot contract impact: NONE

`createSnapshotFromReviewedFields`, `canonicalActor.ts`, and the S4 snapshot surfaces have zero imports from `canonicalFact/*` (grep-verified). Snapshots are built from reviewed fields, never from canonical facts. `snapshotCallerContract` (102 PASS) is unaffected by construction.

## 8. Other affected consumers and dependencies

| Consumer | Exposure | Notes |
|---|---|---|
| `buildGalileoContext` (Galileo context + answer engine) | **LIVE** — primary surface | The only `loadCanonicalFactsForConsumer` caller. |
| `canonicalFactService` (5 actions) | Dormant | `requireBusinessAccess` authorizes each action, but no live caller reaches them today; the same leak would apply the moment one does (e.g., Dashboard consumer named in the adapter's header). |
| `livingIntelligence` | Dead path | Invokes nonexistent action `resolveFacts` (service actions are `getCanonicalFact(s)`, `getCanonicalFactHistory`, `getCanonicalFactCandidates`, `shadowCompare`, `getPilotFacts`) — fails silently in `Promise.allSettled`. Unrelated bug, reported for a later phase. |
| Frontend | None | No direct invocations (grep-verified). |
| Digital Twin / Codex snapshots | None | Registry-only imports; no loader usage. |

## 9. GO/NO-GO recommendation

**GO — implement B1.2 as the four-filter minimal patch in `base44/shared/canonicalFact/contextLoader.ts`**, gated on: (1) the B1.2 suite converted to assert the real source; (2) full B1.1 battery re-run green; (3) P-S3 G18/G19 re-baselining acknowledged; (4) the L63-fallback/guard hardening decided separately (recommended: yes, as a second commit after the minimal patch proves stable). The exposure is confirmed, live, and reaches the user's answer engine; the correction is four lines in one file, behaviorally validated by 15/15 harness checks, and provably independent of both B1.1 and the Codex snapshot contract.

*No changes made. Awaiting explicit approval.*