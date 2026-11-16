# S4 Gate B · DELIVERABLE 1 of 4 — Consolidated Base44 Implementation Specification
## PROPOSAL — NOT APPLIED · **Gate B NOT AUTHORIZED**

**Supersedes** the Base44 sections of Revision 5, 5.1, 5.2 and the final reconciliation. Where they disagreed, **this file is the resolved text**; the earlier alternatives are withdrawn, not carried forward.
**Scope of this deliverable:** one file replaced, one UI line changed. Nothing else.

**Current deployment status — verified by source inspection (read-only, nothing changed).** The file this specification proposes to replace does **not** implement it. The deployed `createSnapshotFromReviewedFields/entry.ts` does not import `base44/shared/authz/actor.ts` (`0` matches) and never mentions `base44_user_id`; it swallows a failed `auth.me()` into `user = null` (L18–24); it skips its role check entirely when `user` is null (L60); it tests the **document owner's** `profiles.app_role` rather than the caller's (L45–53, L60); it writes `created_by: user?.id || profile.id` (L240); and it bypasses the RPC by writing the table directly and demoting `is_latest` in a **separate** statement (L243–249, L304–311). §3 below is therefore a **proposal to be verified after deployment**, not a description of running behaviour. Everything in this file is proposed until that verification runs; the evidence and the blockers are in `VISION_S4_GATE_B_EXECUTION_SAFETY_PLAN.md` §5.5 (B9) and Appendix B (B10 — the shared module resolves a profile by `base44_user_id` **and then falls back to an email match**, which T-102 does not expect; that conflict is unresolved and is the owner's decision).

---

## 1. What is being changed

| File | Change |
|---|---|
| `base44/functions/createSnapshotFromReviewedFields/entry.ts` | **Replaced in full** with §3 below |
| `src/components/admin/ExtractedFieldsReviewQueue.jsx` (line 424) | **One line** — §4 below |

No shared module changes. No new function. `base44/shared/authz/actor.ts` is used as-is and is **not** modified.

---

## 2. Corrections folded in (traceability)

| # | Correction | Source | Where |
|---|---|---|---|
| 1 | Infrastructure failures distinguished from denials; 404 only for a denial; 500 for a failed lookup; never a fall-through | 5.1 C-1 | `loadAuthorizedDocument` |
| 2 | Exactly **one** profile bound by `base44_user_id`; **no email-only authorization**; missing/duplicate/inconsistent all fail closed | 5.2 §1 | `assertCanonicalActorIdentity` |
| 3 | Advisor authority **disabled** — and in Revision 7 the caller has **no advisor branch at all**: an advisor falls through to the terminal 404 | Rev 5 D-4; **D6 §4** (Revision 7) | the D1 constant `ADVISOR_AUTHORITY_ENABLED` is **retained only in the withdrawn §3 text** and does **not** appear in D6 §4 |
| 4 | Required reporting year, no `CURRENT_DATE` fallback | Rev 5 D-17 | step 3b |
| 5 | `projection` is the only projected value (not `projected`) | Rev 5 D-18 | `SNAPSHOT_TYPES` |
| 6 | Dashboard projection **disabled at both layers**; reason reported | 5.1 C-4 | `DASHBOARD_PROJECTION_ENABLED` + the gated argument |
| 7 | Attribution via the **audit table**; `created_by` never echoed by tests | reconciliation §1 | trust-boundary header |
| 8 | `SNAPSHOT_CONFIDENCE_UNAVAILABLE` **withdrawn** | 5.1 C-3 | `RPC_ERROR_STATUS` |
| 9 | Exact authority policy (no label/prefix matching) | 5.1 C-1/§3 | `assertSnapshotAuthority` |
| 10 | Deterministic field ordering | 5.1 C-3 | `orderedFields` |
| 11 | **`applied` is a JSON object, never an array** — `Array.isArray` on it was always false, so `fields_mapped` was empty and the message read "0 fields" on every success | Final C-1 | `applied` / `metadataTargets` / `mapped` |
| 12 | `fields_skipped` echoes the SQL's `{field_id, reason}` elements instead of collapsing both slots to the reason | Final C-1 | the response block |
| 13 | The message states the dedupe case honestly and pluralizes correctly ("1 field skipped", "N fields skipped") | Final C-1 | `plural` / `message` |
| 14 | `actor.isAdmin` verified canonical-only in `shared/authz/actor.ts`; **no change and no broadening** | Final C-2 | `assertSnapshotAuthority` (unchanged) |
| 15 | Existing-row claims narrowed: promotion changes `is_latest` on existing rows; financial content is never rewritten | Final C-6 | §5 |

**Deliberately NOT adopted:** the optional parameter rename to `p_claimed_actor_profile_id` (5.2 §3.2). It is a naming improvement, not an approved decision; the boundary is instead stated in the comments. See deliverable 4, §3.

---

## 3. The file

> **WITHDRAWN as the authoritative caller text — Revision 5.** The implementation below is **superseded by `VISION_S4_GATE_B_06_STRICT_IDENTITY.md` §4**. **Do not deploy the code in this section.** It is retained only as the record of what Revisions 3–4 reviewed and of the two defects that review did not catch:
>
> | # | Defect in the text below | Corrected in D6 |
> |---|---|---|
> | **F-1** | `p_skipped` entries are sent as `{ field_id, reason }`, but D2 §3 step 1.1 (V-12) permits **only** `{ field, reason }`. Deployed as written, **every snapshot with at least one unconsumed field** would fail with `SNAPSHOT_INVALID_SKIPPED`. The two artifacts disagreed and neither was wrong on its own | D6 §4.1 **C-3** — the entry key is `field` (carrying the field **id**, because V-15 refuses duplicate `field` values and a field *name* may legitimately repeat); the response still reports `field_id` |
> | **F-2** | Identity is delegated to `authenticateActor`, whose id branch uses `.maybeSingle()` — so a **duplicated** `base44_user_id` is masked and the **email** fallback then decides. `assertCanonicalActorIdentity` cannot detect this, because the resolver has already returned one row | D6 §2.3/§3 — a **list** read in a separate strict resolver: `length > 1` → **403**, no email predicate in the file at all |
>
> Everything else in this section is carried forward unchanged into D6 §4: the mapping mirror, the authority policy, the document chokepoint, the selection/determinism logic, the response mapping, and the disabled dashboard projection. **§4 and §5 of this document remain valid.**

```ts
/**
 * createSnapshotFromReviewedFields — Phase S4 Gate B (consolidated).
 *
 * WHAT WAS WRONG (audit):
 *   1. `auth.me()` failures were swallowed into `user = null` and execution continued.
 *   2. The role check read the DOCUMENT OWNER's app_role, not the authenticated caller's.
 *   3. No authorization against the document's business; any documentId reached the write path.
 *   4. Authorization failures — including infrastructure failures — were collapsed into 404.
 *
 * TRUST BOUNDARY — read this before changing anything here:
 *   The RPC this function calls is invoked with the service-role key. `p_actor_profile_id` is a
 *   CLAIM by whoever holds that key: it does NOT prove end-user identity, and any holder could
 *   pass any profile id. THIS FUNCTION is the authentication boundary — it derives the actor from
 *   the trusted Base44 session via authenticateActor(), and requires that actor to be the SINGLE
 *   profile bound to that session through `profiles.base44_user_id`. The RPC independently
 *   validates the CLAIMED profile and its STATUS and its authorized RELATIONSHIP to the business,
 *   and pins the tenant to the document. It does not, and must never be described as,
 *   authenticating the end user. A leaked service key permits asserting any authorized profile's
 *   identity; key custody is the control that matters.
 *
 *   ATTRIBUTION lives in the append-only submission audit (one row per accepted submission) and in
 *   `metadata.created_by_base44_user_id`. `business_metric_snapshots.created_by` is NOT written.
 *
 * SOURCE INTEGRITY — no financial VALUE is sent from here. This file decides which accepted
 * fields feed which targets (the mapping contract mirror, below); the database reads the numbers
 * from extracted_fields inside the transaction and refuses any field that is not an accepted or
 * corrected field of this document AND this business AND this target's declared source field.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateActor, errorResponse, HttpError } from '../../shared/authz/actor.ts';

/** The mapping contract version. Any change to FIELD_CONTRACT requires a new version string. */
const MAPPING_VERSION = 's4.mapping.v1';

/**
 * The DEPLOYED snapshot_type vocabulary is ('current','prior','historical','before_strategy',
 * 'after_strategy','projection','tax_year','quarter','month'). This is the strict subset the
 * review path may request. 'projection' — NOT 'projected'
 * (business_metric_snapshots_snapshot_type_check).
 */
const SNAPSHOT_TYPES = ['historical', 'tax_year', 'projection'];

/** Metadata keys owned by the writer. A contract target may never collide with one. */
const RESERVED_METADATA_KEYS = [
  'mapping_contract', 'basis', 'content_hash', 'provenance', 'created_by_base44_user_id',
];

/**
 * Active-status allowlist for SNAPSHOT AUTHORITY — stricter than the platform-wide gate in
 * authenticateActor (which refuses only `suspended`). The declared vocabulary is
 * ('invited','active','incomplete','suspended'); `invited` and `suspended` are denied here, and
 * any unobserved value fails closed. `incomplete` is the column DEFAULT and means "never
 * advanced", so the RELATIONSHIP is the grant and status only removes eligibility.
 */
const ACTIVE_PROFILE_STATUSES = ['active', 'incomplete'];

/**
 * D-4 — DISABLED. `business_entities.assigned_advisor_id` is the certified column, but neither
 * assignment creation nor revocation is evidenced: no writer exists in this repository, 0 of 9
 * businesses are assigned, and the `advisor_assignments` table does not exist. Until both are
 * evidenced, an `advisor` app_role grants NO snapshot authority. Flipping this constant is the
 * ONLY change needed to re-enable it.
 */
const ADVISOR_AUTHORITY_ENABLED = false;

/**
 * D-19 — DASHBOARD PROJECTION DISABLED for this Gate B implementation, which runs in the
 *        existing shared test project (NOT an isolated project) under a synthetic-only
 *        write boundary.
 *
 * `dashboard_metrics` is written by ten application paths with no arbitration, so projecting a
 * snapshot into it would put snapshot-sourced and assessment-sourced values in the same row with
 * no way to tell them apart. Snapshot persistence and latest-snapshot promotion are UNAFFECTED:
 * only the projection into dashboard_metrics is withheld. The RPC re-checks its own copy of this
 * constant, so a direct RPC call with p_update_dashboard => true cannot write the dashboard
 * either. Flipping BOTH constants, in one change-set, is the only change needed to enable it.
 */
const DASHBOARD_PROJECTION_ENABLED = false;

/** A snapshot must be dated by its document's reporting period, never by the day it was created. */
const MIN_REPORTING_YEAR = 1900;
const MAX_REPORTING_YEAR = 2100;

/**
 * Controlled SQL outcomes → safe HTTP outcomes. Unknown codes are logged and returned as a
 * generic 500; no database message ever reaches the caller.
 */
const RPC_ERROR_STATUS: Record<string, number> = {
  SNAPSHOT_FIELD_NOT_CONTRACTED: 409,            // reviewed fields changed under the request
  SNAPSHOT_CONTRIBUTOR_DRIFT: 409,               // the same, for the contributor set
  SNAPSHOT_YEAR_REQUIRED: 409,
  SNAPSHOT_YEAR_IMPLAUSIBLE: 409,
  SNAPSHOT_MAPPING_VERSION_UNSUPPORTED: 400,
  SNAPSHOT_DOCUMENT_TYPE_UNSUPPORTED: 400,
  SNAPSHOT_BASIS_MISMATCH: 400,
  SNAPSHOT_DUPLICATE_TARGET: 400,
  SNAPSHOT_DUPLICATE_FIELD: 400,
  SNAPSHOT_TARGET_NOT_IN_CONTRACT: 400,
  SNAPSHOT_RESERVED_METADATA_KEY: 400,
  SNAPSHOT_INVALID_TARGET: 400,
  SNAPSHOT_INVALID_TYPE: 400,
  SNAPSHOT_INVALID_INPUT: 400,
  SNAPSHOT_OP_MISMATCH: 400,
  SNAPSHOT_CARDINALITY_VIOLATION: 400,
  SNAPSHOT_FIELD_VALUE_MISSING: 400,
  SNAPSHOT_NO_CONTRIBUTORS: 400,
  SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH: 404,     // non-disclosure (D-1)
  SNAPSHOT_FORBIDDEN: 404,                      // non-disclosure (D-1)
  SNAPSHOT_ACTOR_UNKNOWN: 403,
  SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE: 403,
  SNAPSHOT_DEDUPE_TYPE_MISMATCH: 500,           // internal invariant breach
  SNAPSHOT_IDENTITY_LOST: 500,                  // internal invariant breach
};

const RPC_ERROR_MESSAGES: Record<string, string> = {
  SNAPSHOT_YEAR_REQUIRED:
    'This document has no reporting year, so it cannot be dated. Set the document year and try again.',
  SNAPSHOT_YEAR_IMPLAUSIBLE:
    'This document reporting year falls outside the supported range.',
  SNAPSHOT_FIELD_NOT_CONTRACTED:
    'The reviewed fields changed while this snapshot was being created. Reload and try again.',
  SNAPSHOT_CONTRIBUTOR_DRIFT:
    'The reviewed fields changed while this snapshot was being created. Reload and try again.',
};

function mapRpcError(error: any): HttpError {
  const text = String(error?.message || '');
  const code = Object.keys(RPC_ERROR_STATUS).find((k) => text.includes(k));
  if (!code) return new HttpError(500, 'Internal server error');
  const status = RPC_ERROR_STATUS[code];
  if (status >= 500) return new HttpError(500, 'Internal server error');
  return new HttpError(status, RPC_ERROR_MESSAGES[code] || 'Request rejected');
}

/**
 * FIELD_CONTRACT — a MIRROR of the authoritative contract, which lives in the database
 * (`public.s4_mapping_contract(version)`). This copy exists only to build the selection.
 * The database re-validates every entry against its own copy and refuses anything that does
 * not match, so a drift between the two FAILS CLOSED — it can never produce a wrong value.
 * Parity is asserted by test T-01.
 *
 * `from`        the ONLY extracted_fields.field_name permitted to feed this target
 * `op`          direct (exactly one row) | sum | mean (one or more rows)
 * `cardinality` one | many — enforced server-side
 */
type TargetSpec = { target: string; op: 'direct' | 'sum' | 'mean'; from: string; cardinality: 'one' | 'many' };

const FIELD_CONTRACT: Record<string, { basis: string; targets: TargetSpec[] }> = {
  profit_and_loss: {
    basis: 'book',
    targets: [
      { target: 'annual_revenue', op: 'direct', from: 'annual_revenue', cardinality: 'one' },
      { target: 'gross_profit', op: 'direct', from: 'gross_profit', cardinality: 'one' },
      { target: 'net_profit', op: 'direct', from: 'net_profit', cardinality: 'one' },
      { target: 'total_expenses', op: 'direct', from: 'total_expenses', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'owner_compensation', cardinality: 'one' },
    ],
  },
  balance_sheet: {
    basis: 'book',
    targets: [
      { target: 'total_assets', op: 'direct', from: 'total_assets', cardinality: 'one' },
      { target: 'cash_on_hand', op: 'direct', from: 'cash_on_hand', cardinality: 'one' },
      { target: 'total_debt', op: 'direct', from: 'total_debt', cardinality: 'one' },
      { target: 'metadata.total_equity', op: 'direct', from: 'total_equity', cardinality: 'one' },
      // No column exists for total_liabilities; it persists in metadata under this exact key.
      { target: 'metadata.total_liabilities', op: 'direct', from: 'total_liabilities', cardinality: 'one' },
    ],
  },
  business_tax_return: {
    basis: 'tax',
    targets: [
      { target: 'annual_revenue', op: 'direct', from: 'gross_receipts', cardinality: 'one' },
      { target: 'net_profit', op: 'direct', from: 'ordinary_business_income', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'officer_compensation', cardinality: 'one' },
      { target: 'payroll', op: 'direct', from: 'wages', cardinality: 'one' },
      { target: 'total_expenses', op: 'direct', from: 'deductions', cardinality: 'one' },
      { target: 'metadata.taxable_income', op: 'direct', from: 'taxable_income', cardinality: 'one' },
    ],
  },
  debt_schedule: {
    basis: 'schedule',
    targets: [
      { target: 'total_debt', op: 'sum', from: 'loan_balance', cardinality: 'many' },
      { target: 'metadata.monthly_debt_payment', op: 'sum', from: 'monthly_payment', cardinality: 'many' },
      { target: 'metadata.mean_interest_rate', op: 'mean', from: 'interest_rate', cardinality: 'many' },
    ],
  },
  payroll_report: {
    basis: 'payroll',
    targets: [
      { target: 'payroll', op: 'direct', from: 'total_payroll', cardinality: 'one' },
      { target: 'owner_compensation', op: 'direct', from: 'owner_payroll', cardinality: 'one' },
      { target: 'metadata.employee_count', op: 'direct', from: 'employee_count', cardinality: 'one' },
      { target: 'metadata.payroll_tax', op: 'direct', from: 'payroll_tax', cardinality: 'one' },
    ],
  },
};

/**
 * assertCanonicalActorIdentity — the S4 identity rule. EXACTLY ONE canonical profile must be
 * bound to the authenticated Base44 session through `profiles.base44_user_id = user.id`.
 *
 * The email fallback the shared resolver offers is DELIBERATELY NOT ACCEPTED on this path: an
 * email address is a mutable, non-unique attribute, and a financial write must rest on the
 * immutable binding. This function performs its OWN strict lookup rather than trusting the
 * resolver's result, then requires the two to AGREE — so a resolver that fell back to email
 * cannot smuggle a different profile past the check.
 *
 * Nothing here derives from the request body.
 */
async function assertCanonicalActorIdentity(sb: any, actor: any) {
  const sessionUserId = actor?.user?.id;
  if (!sessionUserId) throw new HttpError(401, 'Unauthorized');

  // A LIST read, never `.maybeSingle()`: a duplicated binding must be OBSERVED and refused,
  // not collapsed into an error nor silently resolved to one of the two rows.
  const { data: bindings, error } = await sb
    .from('profiles')
    .select('id')
    .eq('base44_user_id', sessionUserId);

  if (error) {
    console.error('[snapshot] identity lookup failed');
    throw new HttpError(500, 'Internal server error');
  }
  if (!Array.isArray(bindings) || bindings.length === 0) {
    console.error('[snapshot] no profile bound to the session identity');
    throw new HttpError(403, 'Forbidden');
  }
  if (bindings.length > 1) {
    console.error('[snapshot] duplicate profile binding for the session identity');
    throw new HttpError(403, 'Forbidden');
  }
  if (!actor.profile || actor.profile.id !== bindings[0].id || actor.profile_id !== bindings[0].id) {
    console.error('[snapshot] resolved profile does not match the session binding');
    throw new HttpError(403, 'Forbidden');
  }
}

function assertActiveProfile(actor: any) {
  const status = actor?.profile?.profile_status;
  if (!ACTIVE_PROFILE_STATUSES.includes(String(status))) {
    throw new HttpError(403, 'Forbidden');
  }
}

/**
 * assertSnapshotAuthority — the EXACT approved policy. No label matching, no borrowed rule.
 *   platform admin : app_role admin | super_admin
 *   business owner : business_entities.profile_id  OR an active business_owners row
 *   everything else: denied — including advisors (D-4 disabled), team members and experts (D-2)
 */
async function assertSnapshotAuthority(sb: any, actor: any, businessId: string): Promise<string> {
  if (!actor.profile_id) throw new HttpError(403, 'Forbidden');
  if (actor.isAdmin) return 'platform_admin';

  const { data: entity, error: entityError } = await sb
    .from('business_entities')
    .select('id, profile_id, assigned_advisor_id')
    .eq('id', businessId)
    .maybeSingle();

  // A FAILED LOOKUP IS NOT A MISSING RELATIONSHIP. It is an infrastructure failure, it is
  // logged, and it returns 500 — never a 403 that would hide a database problem as a policy
  // decision, and never a path that falls through to a write.
  if (entityError) {
    console.error('[snapshot] authority lookup failed (business_entities)');
    throw new HttpError(500, 'Internal server error');
  }
  if (!entity) throw new HttpError(403, 'Forbidden');

  if (entity.profile_id && entity.profile_id === actor.profile_id) return 'business_owner';

  // D-4 DISABLED — see ADVISOR_AUTHORITY_ENABLED.
  if (ADVISOR_AUTHORITY_ENABLED
      && actor.role === 'advisor'
      && entity.assigned_advisor_id === actor.profile_id) {
    return 'assigned_advisor';
  }

  const { data: ownerRow, error: ownerError } = await sb
    .from('business_owners')
    .select('id, end_date')
    .eq('business_id', businessId)
    .eq('profile_id', actor.profile_id)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString().slice(0, 10))
    .maybeSingle();

  if (ownerError) {
    console.error('[snapshot] authority lookup failed (business_owners)');
    throw new HttpError(500, 'Internal server error');
  }
  if (ownerRow) return 'business_owner_record';

  throw new HttpError(403, 'Forbidden');
}

/**
 * loadAuthorizedDocument — the single chokepoint. The tenant comes from the DOCUMENT ROW;
 * the caller comes from the SESSION. Denials are indistinguishable from absence.
 */
async function loadAuthorizedDocument(sb: any, actor: any, documentId: any) {
  if (!documentId || typeof documentId !== 'string') throw new HttpError(400, 'documentId required');

  const { data: doc, error } = await sb
    .from('documents')
    .select('id, name, document_type, year, business_id, profile_id')
    .eq('id', documentId)
    .maybeSingle();

  if (error) {
    console.error('[snapshot] document lookup failed');
    throw new HttpError(500, 'Internal server error');
  }
  if (!doc) throw new HttpError(404, 'Not found');
  if (!doc.business_id) throw new HttpError(409, 'This document is not attached to a business');
  if (!doc.profile_id) throw new HttpError(409, 'This document is not attached to an owner');

  try {
    await assertSnapshotAuthority(sb, actor, doc.business_id);
  } catch (error) {
    // A DENIAL is a policy verdict: report it exactly as absence, so a caller cannot use the
    // response to discover that a tenant or document exists (D-1).
    // EVERYTHING ELSE — a failed query, a timeout, a configuration fault — is an infrastructure
    // failure. It is logged and reported as a generic 500. It is NEVER converted into a 404,
    // because that would disguise an outage as a policy decision, and it NEVER falls through.
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
    if (status === 403) throw new HttpError(404, 'Not found');
    console.error('[snapshot] authority check failed');
    throw new HttpError(500, 'Internal server error');
  }
  return doc;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[snapshot] supabase not configured');
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. IDENTITY — the real boundary: session, canonical profile, unique binding. ──
    const actor = await authenticateActor(base44, sb);
    await assertCanonicalActorIdentity(sb, actor);   // missing / duplicate / inconsistent → 403
    assertActiveProfile(actor);                      // status allowlist

    // ── 2. REQUEST BODY — may describe WHAT is requested, never WHO may act, never a VALUE. ──
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid request body');
    }
    const {
      documentId,
      snapshotType = null,
      isLatest = false,
      updateDashboard = false,
    } = body || {};

    if (snapshotType !== null && snapshotType !== undefined && !SNAPSHOT_TYPES.includes(snapshotType)) {
      throw new HttpError(400, 'snapshotType must be one of historical, tax_year, projection');
    }
    if (typeof isLatest !== 'boolean' || typeof updateDashboard !== 'boolean') {
      throw new HttpError(400, 'isLatest and updateDashboard must be booleans');
    }

    // ── 3. AUTHORIZE — document row → tenant → exact approved policy. ──
    const document = await loadAuthorizedDocument(sb, actor, documentId);
    const businessId = document.business_id;
    const documentType = document.document_type;

    if (documentType === 'personal_tax_return') {
      return Response.json({
        error: 'Personal tax returns are not yet supported for snapshot creation',
        message: 'This will be available in a later phase for profile_financials',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    const contract = FIELD_CONTRACT[documentType];
    if (!contract) {
      return Response.json({
        error: `Unsupported document type: ${documentType}`,
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    // ── 3b. REPORTING YEAR — REQUIRED. The snapshot is dated by its document's own period. ──
    // A friendly pre-check; the RPC enforces the same rule authoritatively.
    const year = Number(document.year);
    if (!document.year || !Number.isInteger(year)) {
      throw new HttpError(409, 'This document has no reporting year, so it cannot be dated. Set the document year and try again.');
    }
    if (year < MIN_REPORTING_YEAR || year > MAX_REPORTING_YEAR) {
      throw new HttpError(409, 'This document reporting year falls outside the supported range.');
    }

    // ── 4. RESOLVE — accepted/corrected fields, tenant-pinned. No values leave this function. ──
    const { data: fields, error: fieldsError } = await sb
      .from('extracted_fields')
      .select('id, field_name, reviewed_at, created_at')
      .eq('document_id', documentId)
      .eq('business_id', businessId)
      .in('review_status', ['accepted', 'corrected'])
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (fieldsError) {
      console.error('[snapshot] field read failed');
      throw new HttpError(500, 'Internal server error');
    }
    if (!fields || fields.length === 0) {
      return Response.json({
        error: 'No accepted or corrected fields found for this document',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }

    /**
     * Deterministic review-recency ordering: reviewed_at (NULLs first) → created_at → id.
     * The winner is explicit and reproducible, so the same inputs always select the same value.
     */
    const recency = (v: any) => (v ? Date.parse(v) : Number.NEGATIVE_INFINITY);
    const orderedFields = [...fields].sort((a: any, b: any) => {
      const byReview = recency(a.reviewed_at) - recency(b.reviewed_at);
      if (byReview !== 0) return byReview;
      const byCreated = recency(a.created_at) - recency(b.created_at);
      if (byCreated !== 0) return byCreated;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // Built from the ORDERED list, so `.slice(-1)` is the latest-reviewed row of that name.
    const idsByName = new Map<string, string[]>();
    for (const field of orderedFields as any[]) {
      const list = idsByName.get(field.field_name) || [];
      list.push(field.id);
      idsByName.set(field.field_name, list);
    }

    // ── SELECTION ONLY: targets and the field ids that fill them, in CONTRACT order. ──
    const fieldMap: any[] = [];
    const used = new Set<string>();

    for (const spec of contract.targets) {
      const all = idsByName.get(spec.from) || [];
      const selected = spec.cardinality === 'one' ? all.slice(-1) : all;
      // A target with no contributing row is OMITTED — never written as 0.
      if (!selected.length) continue;
      fieldMap.push({ target: spec.target, op: spec.op, field_ids: selected });
      selected.forEach((id: string) => used.add(id));
    }

    const skipped = (orderedFields as any[])
      .filter((f: any) => !used.has(f.id))
      .map((f: any) => ({ field_id: f.id, reason: `No destination in contract ${MAPPING_VERSION}` }));

    // ── 5. WRITE — one atomic, idempotent, serialized RPC. Values are read inside it. ──
    const { data: result, error: rpcError } = await sb.rpc('create_reviewed_fields_snapshot', {
      p_business_id: businessId,
      p_source_document_id: documentId,
      p_actor_profile_id: actor.profile_id,
      p_actor_base44_user_id: actor.user?.id ?? null,   // attribution only — never authorization
      p_mapping_version: MAPPING_VERSION,
      p_basis: contract.basis,
      p_snapshot_type: snapshotType,                    // null ⇒ default applied in the database
      p_field_map: fieldMap,
      p_skipped: skipped,
      p_is_latest: isLatest,
      // The request may ASK; the constant decides. The RPC re-checks its own copy, so a direct
      // RPC call cannot bypass this either.
      p_update_dashboard: updateDashboard === true && DASHBOARD_PROJECTION_ENABLED,
    });

    if (rpcError) {
      console.error('[snapshot] atomic write failed:', rpcError.message);
      throw mapRpcError(rpcError);
    }

    // `applied` is a JSON OBJECT from the database (`v_metrics || v_meta_metrics`), never an array.
    // `Array.isArray` on it is always false — asserting that shape silently produced an empty
    // `fields_mapped` and a "0 fields" message on every successful call.
    const applied = (result?.applied && typeof result.applied === 'object' && !Array.isArray(result.applied))
      ? (result.applied as Record<string, unknown>)
      : null;

    // The database merges the metric columns and the metadata targets into ONE flat object, so a
    // metadata target arrives as its BARE key (`total_equity`, not `metadata.total_equity`). The
    // contract mirror already distinguishes the two, and contract parity is asserted by T-301, so
    // the destination is reported accurately rather than flattened.
    const metadataTargets = new Set(
      contract.targets
        .filter((t) => t.target.startsWith('metadata.'))
        .map((t) => t.target.slice('metadata.'.length)),
    );

    const mapped = applied
      ? Object.keys(applied).map((k) => ({
          field: k,
          mapped_to: metadataTargets.has(k) ? `metadata.${k}` : k,
        }))
      : [];

    // The SQL's `skipped` elements are `{ field_id, reason }`; echo those two keys faithfully
    // rather than collapsing both slots to the reason.
    const skippedApplied = Array.isArray(result?.skipped) ? result.skipped : skipped;

    // Message grammar: "1 field" / "N fields", and the dedupe case stated honestly — on a
    // deduplicated submission no snapshot is created, so the message must not claim one was.
    const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const message = result?.deduplicated === true
      ? `Snapshot already existed with ${plural(mapped.length, 'field')}; this submission was recorded.`
      : skippedApplied.length > 0
        ? `Snapshot created with ${plural(mapped.length, 'field')}. ${plural(skippedApplied.length, 'field')} skipped (partial snapshot).`
        : `Snapshot created successfully with ${plural(mapped.length, 'field')}.`;

    return Response.json({
      success: true,
      snapshot_id: result?.snapshot_id ?? null,
      snapshot_type: result?.snapshot_type ?? null,
      is_latest: result?.is_latest === true,
      fields_mapped: mapped,
      fields_skipped: skippedApplied.map((s: any) => ({
        field_id: s?.field_id ?? null,
        reason: s?.reason ?? null,
      })),
      dashboard_metrics_updated: result?.dashboard_metrics_updated === true,   // always false while disabled
      dashboard_skipped_reason: result?.dashboard_skipped_reason
        ?? (updateDashboard === true && !DASHBOARD_PROJECTION_ENABLED ? 'projection_disabled' : null),
      promoted_over_newer: result?.promoted_over_newer === true,
      deduplicated: result?.deduplicated === true,
      confidence_score: result?.confidence_score ?? null,
      message,
    });

  } catch (error) {
    // HttpError carries an explicit safe status; anything else is logged and returned as a
    // generic 500. No database message ever reaches the caller.
    return errorResponse(error);
  }
});
```

---

## 4. The one-line UI change (same change-set)

```jsx
// src/components/admin/ExtractedFieldsReviewQueue.jsx:424
-  <SelectItem value="projected">Projected</SelectItem>
+  <SelectItem value="projection">Projection</SelectItem>
```

Without it the screen offers a value the deployed `business_metric_snapshots_snapshot_type_check` rejects, and this path's own `SNAPSHOT_TYPES` allowlist would refuse on the RPC.

---

## 5. Invariants this file must never break

| Invariant | Enforced by |
|---|---|
| Identity comes only from the session | `resolveCanonicalActor` (D6 §3); no body field is ever assigned to `actor` |
| One binding, no email fallback | `resolveCanonicalActor` — list read, exactly one row, **no email predicate anywhere** in the helper (T-905) |
| Infrastructure failure ≠ denial | `loadAuthorizedDocument`'s typed catch — **superseded by Revision 7 (D6 §4 + §4.1 C-2)** |
| No value crosses from client to snapshot | `p_field_map` carries targets and **field ids only** |
| `created_by` never written | This file passes no such parameter; the migration omits the column and asserts NULL |
| Dashboard untouched | `p_update_dashboard` is `false` while `DASHBOARD_PROJECTION_ENABLED` is false |
| Attribution is a claim | Header text + audit row; never presented as verified authorship |
| The response mirrors the SQL's real shapes | `applied` read as an **object**; `skipped` elements read as `{field_id, reason}` |
| Promotion may change existing rows' `is_latest`, never their content | §5 of this file · D2 §4 · T-807 |