/**
 * createSnapshotFromReviewedFields — Phase S4 Gate B (strict canonical identity).
 *
 * WHAT WAS WRONG (audit, five defects A-1…A-5 in `…_EXECUTION_SAFETY_PLAN.md` §5.5):
 *   1. `auth.me()` failures were swallowed into `user = null` and execution continued.
 *   2. The authorization gate was skipped entirely when `user` was null.
 *   3. The role check read the DOCUMENT OWNER's app_role, not the caller's.
 *   4. `created_by` fell back to the document owner when there was no session.
 *   5. The snapshot was written directly, bypassing the RPC, with `is_latest` demoted
 *      in a SEPARATE statement.
 *
 * TRUST BOUNDARY — read before changing anything here:
 *   The RPC is invoked with the service-role key. Service role is database capability,
 *   NOT identity: `p_actor_profile_id` is a CLAIM by whoever holds that key and does not
 *   prove who called. THIS FILE is the authentication boundary. It derives the actor
 *   from the trusted Base44 session through resolveCanonicalActor(), which binds the
 *   caller to exactly ONE profile by `profiles.base44_user_id` EQUALITY and refuses every
 *   other case — no email match, no body field, no fallback. The RPC then independently
 *   re-validates the CLAIMED profile, its STATUS and its authorized RELATIONSHIP to the
 *   business, and pins the tenant to the document. A leaked service key still permits
 *   asserting any authorized profile's identity; key custody is the control that matters.
 *
 *   ATTRIBUTION lives in the append-only submission audit (one row per accepted
 *   submission) and in `metadata.created_by_base44_user_id`. It records who was CLAIMED.
 *   `business_metric_snapshots.created_by` is never written.
 *
 * SOURCE INTEGRITY — no financial VALUE is sent from here. This file decides which
 * accepted fields feed which targets (the mirror below); the database reads the numbers
 * from extracted_fields inside the transaction and refuses any field that is not an
 * accepted or corrected field of THIS document AND this business AND this target's
 * declared source field.
 *
 * PERSISTENCE — exactly one writer: `sb.rpc('create_reviewed_fields_snapshot')`. This
 * file contains no insert, no update and no delete against any table.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, HttpError } from '../../shared/authz/actor.ts';
import { resolveCanonicalActor } from '../../shared/authz/canonicalActor.ts';

/** The mapping contract version. Any change to FIELD_CONTRACT requires a new version string. */
const MAPPING_VERSION = 's4.mapping.v1';

/**
 * The DEPLOYED snapshot_type vocabulary is ('current','prior','historical','before_strategy',
 * 'after_strategy','projection','tax_year','quarter','month'). This is the strict subset the
 * review path may request. 'projection' — NOT 'projected'
 * (business_metric_snapshots_snapshot_type_check).
 */
const SNAPSHOT_TYPES = ['historical', 'tax_year', 'projection'];

/**
 * D-19 — DASHBOARD PROJECTION DISABLED.
 *
 * `dashboard_metrics` is written by ten application paths with no arbitration, so projecting
 * a snapshot into it would mix snapshot-sourced and assessment-sourced values in one row with
 * no way to tell them apart. Snapshot persistence and promotion are UNAFFECTED. The RPC
 * re-checks its own copy of this constant, so a direct RPC call cannot write the dashboard
 * either. Flipping BOTH constants in one change-set is the only change needed to enable it.
 */
const DASHBOARD_PROJECTION_ENABLED = false;

/** A snapshot must be dated by its document's reporting period, never by the day it was created. */
const MIN_REPORTING_YEAR = 1900;
const MAX_REPORTING_YEAR = 2100;

/**
 * A snapshot identifier, as the database returns it (`uuid`). Revision 7, R7-3: the response is
 * only built when the RPC actually gave us one — never defaulted to `null`.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // PAYLOAD-SHAPE CODES (D2 §3 step 1.1). This file BUILDS the payload, so no caller can
  // reach these; a hit is an internal defect and is reported as such, never as a 400.
  SNAPSHOT_INVALID_FIELD_MAP: 500,
  SNAPSHOT_INVALID_SKIPPED: 500,
  SNAPSHOT_DOCUMENT_BUSINESS_MISMATCH: 404,     // non-disclosure (D-1)
  SNAPSHOT_FORBIDDEN: 404,                      // non-disclosure (D-1)
  SNAPSHOT_ACTOR_UNKNOWN: 403,
  SNAPSHOT_ACTOR_STATUS_NOT_ACTIVE: 403,
  SNAPSHOT_DEDUPE_TYPE_MISMATCH: 500,           // internal invariant breach
  SNAPSHOT_IDENTITY_LOST: 500,                  // internal invariant breach
  // POPULATION CLOSURE (B14, Design B — approved direction, OD-7). A data condition, not a
  // code fault and not a caller-shape fault: the eligible population moved, or the skip list
  // named rows that are not eligible. Recoverable by reloading, exactly like
  // FIELD_NOT_CONTRACTED.
  SNAPSHOT_POPULATION_INCOMPLETE: 409,
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
  // REQUIRED, not optional (D7A R2 §4 C-2): without it the new 409 reaches the user as the
  // literal string "Request rejected".
  SNAPSHOT_POPULATION_INCOMPLETE:
    'The reviewed fields changed while this snapshot was being prepared. Reload and try again.',
};

function mapRpcError(error: any): HttpError {
  const text = String(error?.message || '');
  const code = Object.keys(RPC_ERROR_STATUS).find((k) => text.includes(k));
  if (!code) {
    console.error('[snapshot] unmapped RPC failure');
    return new HttpError(500, 'Internal server error');
  }
  const status = RPC_ERROR_STATUS[code];
  if (status >= 500) {
    console.error('[snapshot] RPC invariant failure: ' + code);
    return new HttpError(500, 'Internal server error');
  }
  return new HttpError(status, RPC_ERROR_MESSAGES[code] || 'Request rejected');
}

/**
 * FIELD_CONTRACT — a MIRROR of the authoritative contract, which lives in the database
 * (`public.s4_mapping_contract(version)`). This copy exists only to build the selection.
 * The database re-validates every entry against its own copy and refuses anything that does
 * not match, so a drift between the two FAILS CLOSED — it can never produce a wrong value.
 * Parity is asserted by T-301.
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
 * assertBusinessAuthority — the EXACT approved policy. No label matching, no borrowed rule,
 * and no use of the document owner's role.
 *   platform admin : the CALLER's canonical `app_role` is admin | super_admin
 *   business owner : business_entities.profile_id  OR a non-ended business_owners row
 *   everything else: denied — including advisors (D-4 disabled), team members and experts (D-2)
 *
 * A DENIAL and an ABSENT BUSINESS are the same 404, so a caller cannot use the response to
 * learn that a tenant exists. A failed QUERY is a 500: it is an infrastructure failure and is
 * never disguised as a policy verdict. Neither outcome writes anything.
 */
async function assertBusinessAuthority(sb: any, actor: any, businessId: string): Promise<string> {
  const { data: entity, error: entityError } = await sb
    .from('business_entities')
    .select('id, profile_id, assigned_advisor_id')
    .eq('id', businessId)
    .maybeSingle();

  if (entityError) {
    console.error('[snapshot] authority lookup failed (business_entities)');
    throw new HttpError(500, 'Internal server error');
  }
  if (!entity) throw new HttpError(404, 'Not found');

  if (actor.isAdmin) return 'platform_admin';

  if (entity.profile_id && entity.profile_id === actor.profile_id) return 'business_owner';

  // A LIST read with limit(1), NOT `.maybeSingle()` (Revision 6, finding 2a).
  // The deployed constraint is UNIQUE (profile_id, business_id, ownership_type) —
  // three columns — so one owner holding two ownership types in one business has TWO
  // rows. `.maybeSingle()` answers a two-row result with an error and a null body and
  // would throw 500 for an unambiguously authorized caller; D2's `limit 1` succeeds.
  //
  // The end_date predicate is D2's (`bo.end_date is null or bo.end_date >=
  // current_date`), reproduced here as a PRE-CHECK. Two deliberate limitations:
  //   · it uses the UTC date while D2 uses the database's `current_date`, so near
  //     midnight the two can name different days. D2 is authoritative and runs inside
  //     the transaction, so a looser endpoint can only produce SNAPSHOT_FORBIDDEN →
  //     404 at the RPC. This pre-check may REFUSE a caller D2 would have allowed; it
  //     can never PERMIT one D2 refuses.
  //   · it does not filter `ownership_role`, so any ownership row counts (V-8). That
  //     is the approved policy; role- or percentage-scoped ownership authority would
  //     be a D2 + D6 change with its own authorization.
  const { data: ownerRows, error: ownerError } = await sb
    .from('business_owners')
    .select('id, end_date')
    .eq('business_id', businessId)
    .eq('profile_id', actor.profile_id)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString().slice(0, 10))
    .limit(1);

  if (ownerError) {
    console.error('[snapshot] authority lookup failed (business_owners)');
    throw new HttpError(500, 'Internal server error');
  }
  if (!Array.isArray(ownerRows)) {
    console.error('[snapshot] authority response is not an array (business_owners)');
    throw new HttpError(500, 'Internal server error');
  }
  if (ownerRows.length > 0) return 'business_owner_record';

  // D-4 — advisor authority is disabled in both layers; a bare advisor role reaches here.
  throw new HttpError(404, 'Not found');
}

/**
 * loadAuthorizedDocument — the single chokepoint. The tenant comes from the DOCUMENT ROW;
 * the caller comes from the SESSION; the body only names which document.
 *
 * THREE INDEPENDENT CHECKS, not one derived from another:
 *   (a) the document exists                       → 404 (indistinguishable from denial)
 *   (b) the document has an owner of record       → 409
 *   (c) the document has a business association   → 409
 *   (d) that business exists AND is reachable by this caller → 404 / 500
 * Each fails on its own, so a document that is missing an owner cannot borrow authority
 * from a valid business, and a valid business cannot supply a tenant to an orphan document.
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

  if (!doc.profile_id) throw new HttpError(409, 'This document is not attached to an owner');
  if (!doc.business_id) throw new HttpError(409, 'This document is not attached to a business');

  // No try/catch: assertBusinessAuthority already throws the correct status, and catching
  // it is how a 500 would get reclassified as a 404.
  await assertBusinessAuthority(sb, actor, doc.business_id);

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

    // ── 1. IDENTITY — the real boundary, before the body is even parsed. ──────
    // 401 no session · 403 no binding / duplicate binding / ineligible status · 500 lookup fault.
    // Everything below is unreachable without a single verified canonical actor.
    const actor = await resolveCanonicalActor(base44, sb);

    // ── 2. REQUEST BODY — may describe WHAT is requested, never WHO may act, never a VALUE. ──
    // `profile_id`, `actor_profile_id`, `target_profile_id`, `_router_user_email`, `role`,
    // `email`, `created_by`, `business_id` are neither read nor needed: identity and tenant are
    // established above and below from persisted rows. They are inert, not rejected, so an
    // unused key cannot break a legitimate caller.
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

    // ── 3. AUTHORIZE — document row → tenant → exact approved policy. ─────────
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

    // ── 4. RESOLVE — accepted/corrected fields, read COMPLETELY or not at all ──
    // (Revision 7, finding R7-2.) Revision 6 paged this read to remove one silent-truncation
    // path and left two others open:
    //   · a page SHORTER than requested was read as "exhausted". If the project's PostgREST
    //     `db-max-rows` cap (Supabase default 1000 — NOT VERIFIED for this project) is below
    //     the page size, the first page comes back short and the loop stops after ONE partial
    //     page: exactly the failure the paging was added to prevent;
    //   · offset windows (`range(from, to)`) shift when rows are inserted or deleted between
    //     pages, so a row can be read twice or skipped entirely.
    // D2 catches neither: both of its guards prove "what I sent is real"
    // (SNAPSHOT_FIELD_NOT_CONTRACTED, SNAPSHOT_CONTRIBUTOR_DRIFT), never "I sent everything".
    //
    // The read is therefore CLOSED BY AN EXPECTATION, not by a short page:
    //   4a. an exact server-side COUNT over the same predicate (no rows returned);
    //   4b. exactly the pages that expectation implies, each required to return its own
    //       expected length — short or long is a REFUSAL, never exhaustion;
    //   4c. duplicate-id detection across pages — a shifted offset shows up as a repeat;
    //   4d. a second COUNT after the read that must equal the first;
    //   4e. hard ceilings on the population and on the skipped list.
    // Any deviation refuses (409) before the RPC, so no partial basis can be published as a
    // complete figure.
    //
    // RESIDUAL, stated rather than papered over: a NET-ZERO concurrent change between the two
    // counts (one accepted row inserted, another deleted) is invisible to this method.
    // Eliminating it requires the population to be counted inside the RPC's transaction —
    // proposed as B14 (§10), NOT adopted here, because it changes D2.
    const FIELD_PAGE_SIZE = 200;
    const MAX_FIELD_PAGES = 20;                         // 4,000 rows
    const MAX_FIELDS = FIELD_PAGE_SIZE * MAX_FIELD_PAGES;
    const MAX_SKIPPED = 1000;                           // D2 V-10's own limit on p_skipped

    const countReviewedFields = async (): Promise<number> => {
      const { count, error } = await sb
        .from('extracted_fields')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .eq('business_id', businessId)
        .in('review_status', ['accepted', 'corrected']);

      if (error) {
        console.error('[snapshot] reviewed-field count failed');
        throw new HttpError(500, 'Internal server error');
      }
      // A count we could not read is NOT a zero. Refuse rather than page against a guess.
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        console.error('[snapshot] reviewed-field count is not a usable integer');
        throw new HttpError(500, 'Internal server error');
      }
      return count;
    };

    const expected = await countReviewedFields();

    if (expected === 0) {
      return Response.json({
        error: 'No accepted or corrected fields found for this document',
        skipped_fields: [],
        mapped_fields: [],
      }, { status: 400 });
    }
    if (expected > MAX_FIELDS) {
      // The ceiling is stated, not discovered. Above it the set cannot be read and proven in
      // one request, and a partial contributor set is exactly what must not be published.
      console.error('[snapshot] reviewed-field population above the supported ceiling');
      throw new HttpError(409, 'This document has too many reviewed fields to snapshot in one request');
    }

    const fields: any[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < MAX_FIELD_PAGES; page++) {
      const offset = page * FIELD_PAGE_SIZE;
      const want = Math.min(FIELD_PAGE_SIZE, expected - offset);
      if (want <= 0) break;

      const { data: pageRows, error: fieldsError } = await sb
        .from('extracted_fields')
        .select('id, field_name, reviewed_at, created_at')
        .eq('document_id', documentId)
        .eq('business_id', businessId)
        .in('review_status', ['accepted', 'corrected'])
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + want - 1);

      if (fieldsError) {
        console.error('[snapshot] field read failed');
        throw new HttpError(500, 'Internal server error');
      }
      if (!Array.isArray(pageRows)) {
        console.error('[snapshot] field response is not an array');
        throw new HttpError(500, 'Internal server error');
      }
      if (pageRows.length !== want) {
        // Short ⇒ truncated by a cap, or rows deleted mid-read. Long ⇒ rows inserted ahead of
        // the window. Either way the population is not proven, and a partial snapshot is worse
        // than a refusal.
        console.error('[snapshot] reviewed-field page does not match the expected population');
        throw new HttpError(409, 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.');
      }

      for (const row of pageRows as any[]) {
        if (typeof row?.id !== 'string' || row.id.length === 0) {
          console.error('[snapshot] reviewed-field row carries no usable id');
          throw new HttpError(500, 'Internal server error');
        }
        if (seenIds.has(row.id)) {
          // The same row on two pages: the offset window moved under the read. Also the
          // property the comparator's final tie-break depends on — ids must be unique.
          console.error('[snapshot] duplicate reviewed-field id across pages');
          throw new HttpError(409, 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.');
        }
        seenIds.add(row.id);
        fields.push(row);
      }
    }

    // 4d. CLOSE THE SET — a second independent count over the same predicate.
    const expectedAfter = await countReviewedFields();
    if (expectedAfter !== expected || fields.length !== expected) {
      console.error('[snapshot] reviewed-field population moved during the read');
      throw new HttpError(409, 'The reviewed fields changed while this snapshot was being prepared. Reload and try again.');
    }

    /**
     * TOTAL ORDER over (reviewed_at, created_at, id) — relational comparisons only.
     *
     * (Revision 7, finding R7-1.) Revision 6 mapped every absent or malformed timestamp to
     * `Number.NEGATIVE_INFINITY` and then compared with SUBTRACTION:
     *     recency(a) - recency(b)  →  -Infinity - (-Infinity)  →  NaN
     * `NaN !== 0` is true, so the comparator returned NaN; `Array.prototype.sort` treats a
     * NaN result as +0 ("equal"), so the `created_at` and `id` tie-breaks were NEVER
     * consulted — the same nondeterministic-winner defect the guard was written to remove,
     * reintroduced through arithmetic instead of parsing. It fires whenever two rows each
     * lack a usable `reviewed_at`, which after the guard is every malformed value.
     *
     * The fix removes arithmetic from the comparison, not merely the NaN:
     *   · a timestamp is CLASSIFIED first — `{ ok: true, ms }` or `{ ok: false }` — so an
     *     unparseable or absent value is never represented as a number at all;
     *   · every comparison is `<` / `>` / kind-equality, returning only -1, 0 or 1;
     *   · absent and malformed are the SAME kind and sort OLDEST, so a row with a real
     *     review timestamp always beats one without;
     *   · the last tie-break is the unique `id` (uniqueness is enforced in step 4c), which
     *     makes the order TOTAL: two distinct rows can never compare equal, so the winner is
     *     a function of the set alone — independent of input order and of sort stability.
     */
    type Stamp = { ok: boolean; ms: number };

    const stamp = (v: any): Stamp => {
      if (typeof v !== 'string' || v.length === 0) return { ok: false, ms: 0 };
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? { ok: true, ms } : { ok: false, ms: 0 };
    };

    const compareStamps = (a: Stamp, b: Stamp): number => {
      if (a.ok !== b.ok) return a.ok ? 1 : -1;   // a real timestamp sorts LATER than none
      if (!a.ok) return 0;                       // both absent/malformed: equal at THIS key
      if (a.ms < b.ms) return -1;
      if (a.ms > b.ms) return 1;
      return 0;
    };

    const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

    const orderedFields = fields
      .map((field: any) => ({
        field,
        review: stamp(field.reviewed_at),
        created: stamp(field.created_at),
      }))
      .sort((x: any, y: any) => {
        const byReview = compareStamps(x.review, y.review);
        if (byReview !== 0) return byReview;
        const byCreated = compareStamps(x.created, y.created);
        if (byCreated !== 0) return byCreated;
        return compareIds(String(x.field.id), String(y.field.id));
      })
      .map((entry: any) => entry.field);

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

    /**
     * A skipped entry is `{ field, reason }` — the KEY SET D2 V-12 permits. The `field` value
     * is the field's ID, not its name, because V-15 refuses two entries naming the same
     * `field`, and a NAME can legitimately repeat: a `cardinality: 'one'` target consumes only
     * the latest-reviewed row of its name, leaving earlier same-name rows unconsumed. An id is
     * unique by construction, so this can never trip V-15.
     */
    const skipped = (orderedFields as any[])
      .filter((f: any) => !used.has(f.id))
      // The reason must be TRUE for every cause of a skip, not only the uncontracted one: a
      // superseded duplicate CAN have a destination it was simply not selected for, so
      // "no destination in contract" would misstate it (D7B P-5). The reason is
      // caller-declared metadata — never adjudicated by D2, and no test asserts its text.
      .map((f: any) => ({ field: f.id, reason: `Not selected for mapping (${MAPPING_VERSION})` }));

    // D2 V-1 refuses an empty `p_field_map`; say so in words rather than letting the RPC say it.
    if (fieldMap.length === 0) {
      return Response.json({
        error: 'No accepted or corrected field maps to a snapshot target',
        skipped_fields: skipped.map((s: any) => ({ field_id: s.field, reason: s.reason })),
        mapped_fields: [],
      }, { status: 400 });
    }

    // 4e. SKIPPED BOUND — D2 V-10 refuses more than 1,000 entries, which would otherwise
    // surface as an opaque 500 ("SNAPSHOT_INVALID_SKIPPED" → internal defect). Refuse in
    // words instead, before the write. Revision 7, R7-2: the bound is stated, not implicit.
    if (skipped.length > MAX_SKIPPED) {
      console.error('[snapshot] skipped-field list above the contract limit');
      throw new HttpError(409, 'This document has too many reviewed fields that map to no snapshot target');
    }

    // ── 5. WRITE — one atomic, idempotent, serialized RPC. Values are read inside it. ──
    // The ONLY persistence in this file. No insert, no update, no is_latest demotion here.
    const { data: result, error: rpcError } = await sb.rpc('create_reviewed_fields_snapshot', {
      p_business_id: businessId,
      p_source_document_id: documentId,
      p_actor_profile_id: actor.profile_id,            // verified session identity — never the body
      p_actor_base44_user_id: actor.user.id,           // verified session identity — attribution only
      p_mapping_version: MAPPING_VERSION,
      p_basis: contract.basis,
      p_snapshot_type: snapshotType,                   // null ⇒ default applied in the database
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

    // ── 6. VALIDATE THE RESULT — before any success is claimed ────────────────
    // (Revision 7, finding R7-3.) A 200 from PostgREST with no `error` says the RPC RETURNED.
    // It says nothing about WHAT it returned. The Revision 6 code read every field with
    // `?? null` / `=== true` fallbacks, so a null or partial body produced
    // `success: true, snapshot_id: null` — a success claim built from nothing — and a
    // malformed `skipped` silently reported the REQUEST back as if it were the echo.
    //
    // ⚠ COMMIT UNCERTAINTY — read this before retrying. `create_reviewed_fields_snapshot`
    // writes the snapshot, the audit row and (when enabled) the dashboard row inside ONE
    // transaction that COMMITS BEFORE IT RETURNS. A malformed result therefore does NOT mean
    // nothing was written: the transaction may already have committed, and this endpoint
    // cannot tell. The safe answer is a generic 500 carrying no snapshot id — and a retry is
    // NOT automatically safe: it must first be reconciled against snapshot_submission_audit.
    // (An identical-content retry is idempotent through dedupe; different content is a second
    // snapshot.)
    const resultFault = (why: string): HttpError => {
      console.error('[snapshot] RPC result is unusable: ' + why);
      return new HttpError(500, 'Internal server error');
    };

    if (!result || typeof result !== 'object' || Array.isArray(result)) throw resultFault('not an object');
    const rpcResult = result as Record<string, any>;

    // A snapshot identifier is the one thing a caller cannot work without.
    const snapshotId = rpcResult.snapshot_id;
    if (typeof snapshotId !== 'string' || !UUID_PATTERN.test(snapshotId)) throw resultFault('snapshot_id');

    // NOT validated against SNAPSHOT_TYPES: on the dedupe path D2 echoes the EXISTING row's
    // type (`coalesce(v_existing_type, v_snapshot_type)`), and a pre-existing row may carry
    // any value the column's own CHECK permits (`current`, `prior`, `quarter`). Refusing it
    // would break a legitimate retry.
    if (typeof rpcResult.snapshot_type !== 'string' || rpcResult.snapshot_type.length === 0) {
      throw resultFault('snapshot_type');
    }

    for (const key of ['deduplicated', 'dashboard_metrics_updated', 'promoted_over_newer', 'is_latest']) {
      if (typeof rpcResult[key] !== 'boolean') throw resultFault(key);
    }

    // `applied` is a JSON OBJECT from the database (`v_metrics || v_meta_metrics`), never an
    // array — and never empty, because V-1 refuses an empty field map and V-14 refuses a
    // contributor set that yields no value. An empty object here contradicts accepted inputs.
    const appliedRaw = rpcResult.applied;
    if (!appliedRaw || typeof appliedRaw !== 'object' || Array.isArray(appliedRaw)) throw resultFault('applied');
    const applied = appliedRaw as Record<string, unknown>;
    if (Object.keys(applied).length === 0) throw resultFault('applied is empty');

    // The SQL echoes `{ field, reason }`; the API reports `{ field_id, reason }` (T-806/T-811).
    // Taken ONLY from the validated echo — the request is never substituted for a result.
    const echoedRaw = rpcResult.skipped;
    if (!Array.isArray(echoedRaw)) throw resultFault('skipped');
    const skippedApplied: Array<{ field: string; reason: string | null }> = [];
    for (const entry of echoedRaw as any[]) {
      if (!entry || typeof entry !== 'object' || typeof entry.field !== 'string') throw resultFault('skipped entry');
      skippedApplied.push({ field: entry.field, reason: typeof entry.reason === 'string' ? entry.reason : null });
    }

    const confidence = rpcResult.confidence_score;
    if (confidence !== null && confidence !== undefined) {
      if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
        throw resultFault('confidence_score');
      }
    }

    const dashboardReason = rpcResult.dashboard_skipped_reason;
    if (dashboardReason !== null && dashboardReason !== undefined && typeof dashboardReason !== 'string') {
      throw resultFault('dashboard_skipped_reason');
    }

    // The database merges the metric columns and the metadata targets into ONE flat object, so a
    // metadata target arrives as its BARE key (`total_equity`, not `metadata.total_equity`).
    const metadataTargets = new Set(
      contract.targets
        .filter((t) => t.target.startsWith('metadata.'))
        .map((t) => t.target.slice('metadata.'.length)),
    );

    const mapped = Object.keys(applied).map((k) => ({
      field: k,
      mapped_to: metadataTargets.has(k) ? `metadata.${k}` : k,
    }));

    const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    const message = rpcResult.deduplicated === true
      ? `Snapshot already existed with ${plural(mapped.length, 'field')}; this submission was recorded.`
      : skippedApplied.length > 0
        ? `Snapshot created with ${plural(mapped.length, 'field')}. ${plural(skippedApplied.length, 'field')} skipped (partial snapshot).`
        : `Snapshot created successfully with ${plural(mapped.length, 'field')}.`;

    return Response.json({
      success: true,
      snapshot_id: snapshotId,
      snapshot_type: rpcResult.snapshot_type,
      is_latest: rpcResult.is_latest,
      fields_mapped: mapped,
      fields_skipped: skippedApplied.map((s) => ({
        field_id: s.field,
        reason: s.reason,
      })),
      dashboard_metrics_updated: rpcResult.dashboard_metrics_updated,   // always false while disabled
      dashboard_skipped_reason: dashboardReason
        ?? (updateDashboard === true && !DASHBOARD_PROJECTION_ENABLED ? 'projection_disabled' : null),
      promoted_over_newer: rpcResult.promoted_over_newer,
      deduplicated: rpcResult.deduplicated,
      confidence_score: confidence ?? null,
      message,
    });

  } catch (error) {
    // HttpError carries an explicit safe status; anything else is logged and returned as a
    // generic 500. No database message ever reaches the caller.
    return errorResponse(error);
  }
});