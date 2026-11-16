/**
 * liveSyncOrchestrator — Phase 14.3B · hardened in CB-004.1
 *
 * Controlled Live Synchronization Pilot backend function.
 *
 * Actions:
 *   - orchestrateLiveSync: Process a BusinessStateEvent through the live sync pipeline
 *   - getLiveSyncActions: Get pending live sync actions for a consumer+business
 *   - completeLiveSyncAction: Mark an action as completed/failed (records circuit breaker state)
 *   - getPilotStatus: Get the current pilot status (kill switch, matrix, businesses, breakers)
 *   - toggleKillSwitch: Enable/disable the global kill switch
 *   - addPilotBusiness / removePilotBusiness: Manage the pilot business cohort
 *   - tripBreaker / resetBreaker: Reset or trip a circuit breaker manually
 *
 * CRITICAL: This function does NOT push values into consumer state.
 * It creates LiveSyncAction records that the frontend subscribes to.
 * The frontend invalidates its own cache and re-reads from the canonical resolver.
 *
 * ── CB-004.1 — THE AUTHORIZATION BOUNDARY ───────────────────────────────────
 * The three live-sync operations previously executed with NO actor resolution:
 * a request-body `business_id`, `consumer_id` or `action_id` WAS the authority,
 * and the service role supplied the capability. That is now inverted:
 *
 *   authenticateActor(base44, sb)      who is calling (profiles.app_role)
 *     → requested business             a LOOKUP TARGET, never authority
 *     → the ROW's business             for row-addressed operations
 *     → authorizeBusinessAccess        may this actor touch that business?
 *     → live_sync.view|start|complete  does this relationship hold that capability?
 *     → and only then                  orchestrate, read, record, persist
 *
 * Control-plane standing is canonical too: `actor.isAdmin`, derived from
 * `profiles.app_role` by the Security Kernel. Base44 `user.role` is no longer
 * consulted for application standing anywhere in this file.
 *
 * Every decision lives in shared/businessStateSync/liveSyncAuthorization.ts so
 * it can be executed and mutation-tested; this file only parses, gates and acts.
 * Nothing here is written to the live-sync store until the gate above has passed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

import { normalizeSupabaseProjectUrl } from "../../shared/supabase/projectUrl.ts";
import { authenticateActor } from "../../shared/authz/actor.ts";
import {
  authorizeLiveSyncOperation,
  denialOutcome,
  databaseOutcome,
  isUsableId,
  isUuidShape,
  isKnownConsumerId,
  isKnownMode,
  validateOrchestrationRequest,
  LIVE_SYNC_INFRASTRUCTURE_MESSAGE,
} from "../../shared/businessStateSync/liveSyncAuthorization.ts";

// The project URL is normalized through the ONE canonical implementation: the
// stored value carries an API path and a trailing slash, and a client built from
// it raw asks for /rest/v1/rest/v1/... which PostgREST rejects (PGRST125).
// The service-role key stays backend-only and is never logged or returned.
const supabaseUrl = normalizeSupabaseProjectUrl(Deno.env.get("VITE_SUPABASE_URL"));
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// ── In-memory state (persists across warm invocations) ──────────────────────
// Live sync policy and circuit breaker state are module-level.
// On cold start, they reset to defaults (safe).

import {
  isLiveSyncEnabled,
  getLiveSyncMode,
  getPilotStatus,
  setGlobalLiveSyncEnabled,
  isGlobalLiveSyncEnabled,
  addPilotBusiness,
  removePilotBusiness,
  getPilotBusinessIds,
} from "../../shared/businessStateSync/liveSyncPolicy.ts";

import {
  isTripped,
  recordSuccess,
  recordFailure,
  tripBreaker,
  resetBreaker,
  getBreakerState,
  getAllBreakerStates,
  resetAllBreakers,
} from "../../shared/businessStateSync/circuitBreaker.ts";

import {
  qualifyEvent,
} from "../../shared/businessStateSync/eventQualification.ts";

import {
  orchestrateLiveSync,
  recordLiveActionResult,
} from "../../shared/businessStateSync/liveOrchestrator.ts";

import {
  createBusinessStateEvent,
  getEventTypeForFact,
  validateEvent,
} from "../../shared/businessStateSync/events.ts";

import {
  deduplicateEvents,
} from "../../shared/businessStateSync/deduplication.ts";

const LIVE_SYNC_TABLE = "live_sync_actions";

const CONTROL_PLANE_ACTIONS = new Set([
  "getPilotStatus", "toggleKillSwitch", "addPilotBusiness", "removePilotBusiness",
  "getBreakerState", "tripBreaker", "resetBreaker", "resetAllBreakers",
]);

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const action = url.searchParams.get("action") || body?.action;

  const base44 = createClientFromRequest(req);

  // ── CONTROL-PLANE AUTHORIZATION ─────────────────────────────────────────────
  // These actions mutate pilot policy: the global kill switch, the pilot cohort
  // and the circuit breakers. Standing is the CANONICAL application role
  // (`profiles.app_role`, resolved by authenticateActor), never Base44
  // `user.role`. No capability is widened here — only the authority source is
  // corrected. An unresolvable actor fails closed.
  if (CONTROL_PLANE_ACTIONS.has(action)) {
    let actor = null;
    try {
      actor = await authenticateActor(base44, supabase);
    } catch {
      actor = null;
    }
    if (!actor) return json({ code: "NOT_AUTHORIZED", error: "Unauthorized" }, 401);
    if (!actor.isAdmin) {
      return json({ code: "NOT_AUTHORIZED", error: "Forbidden: admin access required" }, 403);
    }
  }

  try {
    switch (action) {
      case "orchestrateLiveSync":
        return await handleOrchestrateLiveSync(body, base44);
      case "getLiveSyncActions":
        return await handleGetLiveSyncActions(body, base44);
      case "completeLiveSyncAction":
        return await handleCompleteLiveSyncAction(body, base44);
      case "getPilotStatus":
        return handleGetPilotStatus();
      case "toggleKillSwitch":
        return await handleToggleKillSwitch(body);
      case "addPilotBusiness":
        return await handleAddPilotBusiness(body);
      case "removePilotBusiness":
        return await handleRemovePilotBusiness(body);
      case "getBreakerState":
        return await handleGetBreakerState(body);
      case "tripBreaker":
        return await handleTripBreaker(body);
      case "resetBreaker":
        return await handleResetBreaker(body);
      case "resetAllBreakers":
        return handleResetAllBreakers();
      default:
        return json({ code: "INVALID_REQUEST", error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[liveSyncOrchestrator] unhandled error:", err?.message || err);
    return json({ code: "INTERNAL_ERROR", error: "Internal error" }, 500);
  }
}

/**
 * loadLiveSyncAction — one row, by id, for the resource-derived boundary. A
 * store failure is THROWN so it can never be mistaken for an absent row.
 */
async function loadLiveSyncAction(actionId: string) {
  if (!supabase) {
    throw Object.assign(new Error("live sync store unavailable"), { code: "PGRST205" });
  }
  const { data, error } = await supabase
    .from(LIVE_SYNC_TABLE)
    .select("*")
    .eq("id", actionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * gate — run the authorization boundary and turn a refusal into the ONE generic
 * client response. A refusal carries no internal reason, no business id and no
 * resource identity.
 */
async function gate(input: any): Promise<{ denied: Response | null; decision: any }> {
  const decision = await authorizeLiveSyncOperation({
    ...input,
    sb: supabase,
    infrastructureAvailable: supabase !== null,
  });
  if (!decision.allowed || !decision.executable) {
    const outcome = denialOutcome(decision);
    return { denied: json(outcome.body, outcome.status), decision };
  }
  return { denied: null, decision };
}

// ── Orchestrate a live sync event ────────────────────────────────────────────
async function handleOrchestrateLiveSync(body: any, base44: any): Promise<Response> {
  const rawEvent = body?.event;
  const canonicalFact = body?.canonical_fact;

  if (!rawEvent || typeof rawEvent !== "object") {
    return json({ code: "INVALID_REQUEST", error: "Missing required field: event" }, 400);
  }
  if (!isUuidShape(rawEvent.business_id)) {
    return json({ code: "INVALID_REQUEST", error: "Missing or malformed field: event.business_id" }, 400);
  }
  if (!isUsableId(rawEvent.fact_key)) {
    return json({ code: "INVALID_REQUEST", error: "Missing required field: event.fact_key" }, 400);
  }

  // Closed-vocabulary validation of the payload. `consumer_id`, `mode` and
  // `governance_classification` are NOT part of the event contract — they are
  // derived server-side by the orchestrator — so their presence is rejected
  // rather than trusted.
  const validation = validateOrchestrationRequest(rawEvent);
  if (!validation.ok) {
    return json({ code: "INVALID_REQUEST", error: validation.message }, 400);
  }

  const event = buildEvent(rawEvent);
  if (!event) {
    return json({ code: "INVALID_REQUEST", error: "Missing required field: event.event_type" }, 400);
  }
  const eventErrors = validateEvent(event);
  if (eventErrors.length > 0) {
    return json({ code: "INVALID_REQUEST", error: `Malformed event: ${eventErrors[0]}` }, 400);
  }

  // ── THE GATE. `event.business_id` is the business being REQUESTED; the actor's
  //    authorization is what establishes whether the operation may proceed. ──
  const { denied, decision } = await gate({
    base44,
    operation: "orchestrateLiveSync",
    requestBusinessId: rawEvent.business_id,
  });
  if (denied) return denied;

  // ── Only now does orchestration run. ───────────────────────────────────────
  const result = orchestrateLiveSync(event, canonicalFact);

  // Persist LiveSyncAction records (for the frontend subscription). The business
  // written is the AUTHORIZED business, never a caller-supplied value.
  const actionsToInsert = result.live_actions.map((action) => ({
    event_id: action.event_id,
    business_id: decision.business_id,
    fact_key: action.fact_key,
    consumer_id: action.consumer_id,
    mode: action.mode,
    action_type: action.action_type,
    qualification_result: action.qualification_result || null,
    governance_classification: action.governance_classification,
    circuit_breaker_tripped: action.circuit_breaker_tripped,
    circuit_breaker_reason: action.circuit_breaker_reason || null,
    status: action.status,
    reason: action.reason,
    timestamp: action.timestamp,
  }));

  if (actionsToInsert.length === 0) {
    return json({ status: "ok", orchestration: result, inserted_actions: 0 });
  }

  const { data, error } = await supabase
    .from(LIVE_SYNC_TABLE)
    .insert(actionsToInsert)
    .select();

  // A missing store is an infrastructure failure, never a successful empty write.
  if (error) {
    const outcome = databaseOutcome(error);
    return json(outcome.body, outcome.status);
  }

  return json({
    status: "ok",
    orchestration: result,
    inserted_actions: (data || []).length,
  });
}

/**
 * buildEvent — construct the canonical event from VALIDATED, whitelisted fields.
 * An under-specified event is completed with canonical conservative values so it
 * can only ever degrade to shadow: confidence 0 can never qualify for a live
 * propagation. Extra payload fields never reach the orchestrator.
 */
function buildEvent(rawEvent: any) {
  if (isUsableId(rawEvent.event_id)) return rawEvent;

  const eventType = isUsableId(rawEvent.event_type)
    ? rawEvent.event_type
    : getEventTypeForFact(rawEvent.fact_key);
  if (!isUsableId(eventType)) return null;

  return createBusinessStateEvent({
    event_type: eventType,
    business_id: rawEvent.business_id,
    fact_key: rawEvent.fact_key,
    previous_value: rawEvent.previous_value,
    new_value: rawEvent.new_value,
    effective_date: isUsableId(rawEvent.effective_date) ? rawEvent.effective_date : new Date().toISOString(),
    reporting_period: rawEvent.reporting_period,
    confidence: typeof rawEvent.confidence === "number" ? rawEvent.confidence : 0,
    verification_status: isUsableId(rawEvent.verification_status) ? rawEvent.verification_status : "missing",
    evidence_reference: rawEvent.evidence_reference,
    source_authority: isUsableId(rawEvent.source_authority) ? rawEvent.source_authority : "owner_estimate",
    reason: isUsableId(rawEvent.reason) ? rawEvent.reason : "Live sync event",
    timestamp: isUsableId(rawEvent.timestamp) ? rawEvent.timestamp : undefined,
  });
}

// ── Get pending live sync actions for a consumer+business ───────────────────
async function handleGetLiveSyncActions(body: any, base44: any): Promise<Response> {
  const { consumer_id, business_id, mode } = body || {};

  if (!isUuidShape(business_id)) {
    return json({ code: "INVALID_REQUEST", error: "Missing or malformed field: business_id" }, 400);
  }
  // `consumer_id` narrows the result; it NEVER substitutes for business
  // authorization, and it is validated against the closed vocabulary.
  if (!isKnownConsumerId(consumer_id)) {
    return json({ code: "INVALID_REQUEST", error: "Missing or malformed field: consumer_id" }, 400);
  }
  if (mode !== undefined && !isKnownMode(mode)) {
    return json({ code: "INVALID_REQUEST", error: "Malformed field: mode" }, 400);
  }

  const { denied, decision } = await gate({
    base44,
    operation: "getLiveSyncActions",
    requestBusinessId: business_id,
  });
  if (denied) return denied;

  let query = supabase
    .from(LIVE_SYNC_TABLE)
    .select("*")
    .eq("consumer_id", consumer_id)
    .eq("business_id", decision.business_id)
    .order("timestamp", { ascending: false })
    .limit(50);

  if (mode) query = query.eq("mode", mode);

  const { data, error } = await query;
  if (error) {
    const outcome = databaseOutcome(error);
    return json(outcome.body, outcome.status);
  }

  return json({ actions: data || [] });
}

// ── Complete a live sync action (records circuit breaker state) ──────────────
async function handleCompleteLiveSyncAction(body: any, base44: any): Promise<Response> {
  const { action_id, success, error_class, refresh_duration_ms } = body || {};

  if (!isUsableId(action_id)) {
    return json({ code: "INVALID_REQUEST", error: "Missing required field: action_id" }, 400);
  }
  // A malformed id is reported EXACTLY like an absent one, so the shape of an
  // identifier cannot be probed, and it never reaches the database as a raw cast.
  if (!isUuidShape(action_id)) {
    return json({ code: "RESOURCE_UNAVAILABLE", error: "Resource unavailable" }, 404);
  }

  // ── THE GATE. The row is loaded first because the ROW supplies the business:
  //    a request-supplied business_id is never authority here, and a conflict
  //    between the two fails closed as RESOURCE_UNAVAILABLE. ────────────────
  const { denied, decision } = await gate({
    base44,
    operation: "completeLiveSyncAction",
    requestBusinessId: body?.business_id,
    resourceId: action_id,
    loadResource: loadLiveSyncAction,
  });
  if (denied) return denied;

  const row = decision.resource;
  if (!row) {
    return json({ code: "RESOURCE_UNAVAILABLE", error: "Resource unavailable" }, 404);
  }

  // ── Circuit breaker state. Reachable ONLY after the boundary above has
  //    authorized this actor for this business, so an unauthorized completion
  //    attempt has ZERO breaker side effects on any business. ───────────────
  if (row.mode === "live") {
    recordLiveActionResult(row.consumer_id, success, error_class);
  }

  const updateData = {
    status: success ? "completed" : "failed",
    error_class: error_class || null,
    refresh_duration_ms: refresh_duration_ms || null,
  };

  const { error: updateError } = await supabase
    .from(LIVE_SYNC_TABLE)
    .update(updateData)
    .eq("id", row.id);

  if (updateError) {
    const outcome = databaseOutcome(updateError);
    return json(outcome.body, outcome.status);
  }

  return json({
    status: "ok",
    action_id: row.id,
    new_status: updateData.status,
    circuit_breaker_state: getBreakerState(row.consumer_id),
  });
}

// ── Get pilot status ────────────────────────────────────────────────────────
function handleGetPilotStatus(): Response {
  return json({
    status: "ok",
    pilot: {
      ...getPilotStatus(),
      breaker_states: getAllBreakerStates(),
    },
  });
}

// ── Toggle the global kill switch ────────────────────────────────────────────
async function handleToggleKillSwitch(body: any): Promise<Response> {
  const { enabled } = body || {};

  if (typeof enabled !== 'boolean') {
    return json({ error: "Missing required field: enabled (boolean)" }, 400);
  }

  setGlobalLiveSyncEnabled(enabled);

  return json({
    status: "ok",
    global_live_sync_enabled: enabled,
    message: enabled
      ? "Live sync ENABLED. Pilot consumers will receive live propagation."
      : "Live sync DISABLED. ALL propagation returns to shadow-only.",
  });
}

// ── Add a pilot business ────────────────────────────────────────────────────
async function handleAddPilotBusiness(body: any): Promise<Response> {
  const { business_id } = body || {};

  if (!business_id) {
    return json({ error: "Missing required field: business_id" }, 400);
  }

  addPilotBusiness(business_id);

  return json({
    status: "ok",
    business_id,
    pilot_businesses: getPilotBusinessIds(),
  });
}

// ── Remove a pilot business ──────────────────────────────────────────────────
async function handleRemovePilotBusiness(body: any): Promise<Response> {
  const { business_id } = body || {};

  if (!business_id) {
    return json({ error: "Missing required field: business_id" }, 400);
  }

  removePilotBusiness(business_id);

  return json({
    status: "ok",
    business_id,
    pilot_businesses: getPilotBusinessIds(),
  });
}

// ── Get breaker state ────────────────────────────────────────────────────────
async function handleGetBreakerState(body: any): Promise<Response> {
  const { consumer_id } = body || {};

  if (!consumer_id) {
    return json({ error: "Missing required field: consumer_id" }, 400);
  }

  return json({
    status: "ok",
    consumer_id,
    breaker_state: getBreakerState(consumer_id),
  });
}

// ── Trip a breaker manually ──────────────────────────────────────────────────
async function handleTripBreaker(body: any): Promise<Response> {
  const { consumer_id, reason } = body || {};

  if (!consumer_id) {
    return json({ error: "Missing required field: consumer_id" }, 400);
  }

  tripBreaker(consumer_id, reason || 'Manual trip');

  return json({
    status: "ok",
    consumer_id,
    breaker_state: getBreakerState(consumer_id),
  });
}

// ── Reset a breaker manually ────────────────────────────────────────────────
async function handleResetBreaker(body: any): Promise<Response> {
  const { consumer_id } = body || {};

  if (!consumer_id) {
    return json({ error: "Missing required field: consumer_id" }, 400);
  }

  resetBreaker(consumer_id);

  return json({
    status: "ok",
    consumer_id,
    breaker_state: getBreakerState(consumer_id),
  });
}

// ── Reset all breakers ───────────────────────────────────────────────────────
function handleResetAllBreakers(): Response {
  resetAllBreakers();
  return json({
    status: "ok",
    breaker_states: getAllBreakerStates(),
  });
}

// ── Helper: JSON response ───────────────────────────────────────────────────
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
