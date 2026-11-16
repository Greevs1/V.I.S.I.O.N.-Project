/**
 * VISION — CONNECTED BUSINESS · PHASE CB-004.1
 * LIVE SYNC AUTHORIZATION BOUNDARY
 *
 * THE INVARIANT THIS MODULE EXISTS TO ENFORCE:
 *
 *   BUSINESS ACCESS IS NOT EXECUTION AUTHORITY.
 *   SERVICE ROLE IS CAPABILITY, NOT AUTHORIZATION.
 *
 * The three live-sync operations previously performed NO actor resolution at
 * all. A caller supplied `event.business_id`, `consumer_id` or `action_id` and
 * the operation proceeded with the service role. That made a request-body field
 * the authority for reading, writing and mutating another business's rows.
 *
 * THE ONE CHAIN (no live-sync operation may bypass it):
 *
 *   authenticated session        → authenticateActor       (canonical actor)
 *   requested business           → LOOKUP TARGET only      (never authority)
 *   resolved TARGET              → the row, for row-addressed operations
 *   canonical business access    → authorizeBusinessAccess (canonical gate)
 *   relationship → capability    → validateBusinessScope   (canonical source)
 *   capability → permitted       → this module
 *
 * REUSE, NEVER DUPLICATE — `authenticateActor` and `authorizeBusinessAccess` are
 * the existing Security Kernel (base44/shared/authz/actor.ts). This module calls
 * them; it does not resolve an actor itself, does not restate the seven-source
 * business rule, and does not create a second role model. Standing comes from
 * `profiles.app_role` inside that kernel, never from Base44 `user.role`.
 *
 * NOT THE PROVIDER KERNEL (CB-004 is deliberately not reused here)
 *   These are NOT provider operations: they touch no provider API, no
 *   connection, no credential and no Vault path. Routing them through CB-004
 *   would mislabel internal propagation activity as provider activity in that
 *   audit trail, and would require widening CB-004's closed vocabulary. So this
 *   module reuses CB-004's *discipline* — a closed capability vocabulary, a pure
 *   executable decision core, bounded internal reason codes mapped to a small
 *   set of client codes, and non-enumeration — without its endpoint. The
 *   provider vocabulary is untouched and unimported.
 *
 * ROW-DERIVED CONTEXT — the confused-deputy defence
 *   `completeLiveSyncAction` addresses an EXISTING row. Its business is read from
 *   that row, never from the request. A request-supplied `business_id` is never
 *   authority; if it contradicts the row the call fails closed with the same
 *   externally generic response an absent resource produces.
 *
 * NON-ENUMERATION
 *   "No such resource" and "that resource belongs to another business" are ONE
 *   client code. The internal reason code is never returned — the decision
 *   carried to a client has no field for it — so a probe cannot learn that a
 *   foreign resource exists, nor which relationship refused it.
 *
 * ALLOWED ≠ EXECUTABLE
 *   `allowed` answers "may this actor do this to this business?".
 *   `executable` answers "may it proceed right now?" — the live-sync store does
 *   not exist in the database yet, so an authorized operation is not executable
 *   and must fail safely rather than be reported as success or an empty result.
 *
 * HARNESS CONSTRAINT (same convention as providers/authorization.ts)
 *   The authorization harness executes THIS FILE'S REAL SOURCE, so keep each
 *   `export type` / `export interface` on ONE LINE and keep policy maps free of
 *   type annotations on the declaration itself.
 */

import { authenticateActor, authorizeBusinessAccess } from '../authz/actor.ts';
import { validateBusinessScope } from '../businessScope/writeGuard.ts';

export type LiveSyncDecision = { allowed: boolean; executable: boolean; reason_code: string; client_code: string; http_status: number; business_id: string | null; capability: string | null };
export type LiveSyncTarget = { reason_code: string; business_id: string | null; capability: string | null };
export type LiveSyncAuthorizationInput = { sb: any; base44?: any; operation?: any; requestBusinessId?: any; resourceId?: any; loadResource?: any; infrastructureAvailable?: any };

// ══════════════════════════════════════════════════════════════════════════════
// CLOSED VOCABULARIES
// ══════════════════════════════════════════════════════════════════════════════

/** The bounded live-sync capability set. Three, not thirty. */
export const LIVE_SYNC_CAPABILITIES = [
  'live_sync.view',
  'live_sync.start',
  'live_sync.complete',
];

/** action → the ONE capability it requires. An absent key is NOT a capability. */
export const LIVE_SYNC_OPERATION_CAPABILITY = {
  orchestrateLiveSync: 'live_sync.start',
  getLiveSyncActions: 'live_sync.view',
  completeLiveSyncAction: 'live_sync.complete',
};

/** Operations that address an EXISTING row. The row supplies the business. */
export const LIVE_SYNC_RESOURCE_OPERATIONS = ['completeLiveSyncAction'];

/** The bounded capability matrix. Nothing here is implied by another row. */
export const LIVE_SYNC_PERMISSION_SOURCES = {
  'live_sync.view': ['OWNER', 'ASSIGNED_ADVISOR', 'TEAM_MEMBER', 'ADVISOR', 'EXPERT', 'PLATFORM_ADMIN'],
  'live_sync.start': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],
  'live_sync.complete': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],
};

/** Relationship classes. An unrecognized canonical reason is NOT a source. */
export const LIVE_SYNC_ACCESS_SOURCES = ['OWNER', 'ASSIGNED_ADVISOR', 'TEAM_MEMBER', 'ADVISOR', 'EXPERT', 'PLATFORM_ADMIN'];

/** The canonical reason strings writeGuard produces, most specific first. */
export const LIVE_SYNC_ACCESS_SOURCE_BY_RULE = [
  { prefix: 'assigned_advisor (', source: 'ASSIGNED_ADVISOR' },
  { prefix: 'owner (', source: 'OWNER' },
  { prefix: 'advisor (', source: 'ADVISOR' },
  { exact: 'team_member', source: 'TEAM_MEMBER' },
  { exact: 'expert_access', source: 'EXPERT' },
  { exact: 'super_admin', source: 'PLATFORM_ADMIN' },
];

/** Reasons in which the actor IS authorized; only AUTHORIZED may execute. */
export const LIVE_SYNC_GRANTING_REASONS = ['AUTHORIZED', 'INFRASTRUCTURE_UNAVAILABLE'];

/** Internal reason → the ONLY codes a client ever sees. */
export const LIVE_SYNC_CLIENT_CODE_BY_REASON = {
  AUTHORIZED: { code: 'AUTHORIZED', status: 200 },
  ACTOR_UNRESOLVED: { code: 'NOT_AUTHORIZED', status: 401 },
  ACTOR_SUSPENDED: { code: 'NOT_AUTHORIZED', status: 403 },
  BUSINESS_ACCESS_DENIED: { code: 'NOT_AUTHORIZED', status: 403 },
  PERMISSION_DENIED: { code: 'NOT_AUTHORIZED', status: 403 },
  INVALID_CAPABILITY: { code: 'INVALID_REQUEST', status: 400 },
  RESOURCE_NOT_FOUND: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  RESOURCE_BUSINESS_MISMATCH: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  INFRASTRUCTURE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503 },
};

/** The client's generic message per code. Never the internal reason. */
export const LIVE_SYNC_CLIENT_MESSAGE_BY_CODE = {
  NOT_AUTHORIZED: 'Not authorized',
  RESOURCE_UNAVAILABLE: 'Resource unavailable',
  SERVICE_UNAVAILABLE: 'Live sync infrastructure is unavailable',
  INVALID_REQUEST: 'Invalid request',
};

export const LIVE_SYNC_INFRASTRUCTURE_MESSAGE = 'Live sync infrastructure is unavailable';

/** The closed ConsumerId vocabulary (types.ts ConsumerId). */
export const LIVE_SYNC_CONSUMER_IDS = [
  'dashboard', 'galileo', 'executive_brief', 'growth_plan', 'reports', 'meeting_prep',
  'business_intelligence', 'assessments', 'valuation', 'documents', 'roadmap', 'sprints',
];

/** The closed propagation-mode vocabulary. `mode` is server-derived, never given. */
export const LIVE_SYNC_MODES = ['live', 'shadow'];

/** The closed governance-classification vocabulary. Also server-derived. */
export const LIVE_SYNC_GOVERNANCE_CLASSIFICATIONS = [
  'automatic', 'advisor_review', 'verification_required', 'blocked',
];

/** The closed BusinessStateEventType vocabulary (types.ts). */
export const LIVE_SYNC_EVENT_TYPES = [
  'revenue_updated', 'gross_profit_updated', 'net_income_updated', 'ebitda_updated',
  'debt_updated', 'cash_updated', 'owner_compensation_updated',
  'customer_concentration_updated', 'document_verified', 'assessment_completed',
  'confidence_changed', 'verification_resolved', 'growth_plan_updated',
  'valuation_published', 'business_dna_updated', 'business_profile_updated',
];

/** The closed VerificationStatus vocabulary (canonicalFact/types.ts). */
export const LIVE_SYNC_VERIFICATION_STATUSES = ['verified', 'suggested', 'needs_review', 'missing', 'conflicting'];

/**
 * Fields the caller must NOT put on an event. Each one is either authority-
 * shaped or server-derived: `consumer_id`, `mode` and `governance_classification`
 * are computed by the orchestrator from closed vocabularies, and `role` /
 * `profile_id` / `actor` are identity claims. Their presence is rejected rather
 * than ignored so a confused caller is told, and so authority can never arrive
 * through the event payload.
 */
export const LIVE_SYNC_EVENT_AUTHORITY_FIELDS = ['consumer_id', 'mode', 'governance_classification', 'role', 'profile_id', 'actor'];

// ══════════════════════════════════════════════════════════════════════════════
// PURE PREDICATES — no I/O. Every one of them fails closed.
// ══════════════════════════════════════════════════════════════════════════════

export function isUsableId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The canonical VISION identifier shape. A malformed id never reaches the database. */
export function isUuidShape(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function isKnownLiveSyncCapability(capability) {
  return typeof capability === 'string' && LIVE_SYNC_CAPABILITIES.indexOf(capability) > -1;
}

/**
 * operation → capability. An unknown operation returns null, which the evaluator
 * treats as a DENY. There is deliberately no default: an unrecognized verb must
 * never inherit view — or any other — authority.
 */
export function capabilityForOperation(operation) {
  if (typeof operation !== 'string' || operation.length === 0) return null;
  const capability = LIVE_SYNC_OPERATION_CAPABILITY[operation];
  return isKnownLiveSyncCapability(capability) ? capability : null;
}

export function requiresResourceOperation(operation) {
  return LIVE_SYNC_RESOURCE_OPERATIONS.indexOf(operation) > -1;
}

export function isKnownConsumerId(value) {
  return typeof value === 'string' && LIVE_SYNC_CONSUMER_IDS.indexOf(value) > -1;
}

export function isKnownMode(value) {
  return typeof value === 'string' && LIVE_SYNC_MODES.indexOf(value) > -1;
}

/** canonical reason → relationship class, or null (fail closed). */
export function deriveAccessSource(reason) {
  if (typeof reason !== 'string' || reason.length === 0) return null;
  for (const rule of LIVE_SYNC_ACCESS_SOURCE_BY_RULE) {
    if (rule.exact !== undefined && reason === rule.exact) return rule.source;
    if (rule.prefix !== undefined && reason.startsWith(rule.prefix)) return rule.source;
  }
  return null;
}

/** Does this relationship class hold this capability? Unknown = no. */
export function capabilityAllows(capability, source) {
  if (!capability || !source) return false;
  const sources = LIVE_SYNC_PERMISSION_SOURCES[capability];
  if (!Array.isArray(sources)) return false;
  return sources.indexOf(source) > -1;
}

export function isAuthorizedReason(reasonCode) {
  return LIVE_SYNC_GRANTING_REASONS.indexOf(reasonCode) > -1;
}

export function isExecutableReason(reasonCode) {
  return reasonCode === 'AUTHORIZED';
}

/**
 * validateOrchestrationRequest — the event payload, judged against CLOSED
 * vocabularies only. Nothing new is introduced: every accepted value already
 * exists in the canonical type unions. Unknown event_type / verification_status
 * and any authority-shaped field fail closed.
 */
export function validateOrchestrationRequest(rawEvent) {
  const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : null;
  if (!event) return { ok: false, message: 'Missing required field: event' };

  for (const field of LIVE_SYNC_EVENT_AUTHORITY_FIELDS) {
    if (event[field] !== undefined) {
      return { ok: false, message: `Unexpected field on event: ${field}` };
    }
  }
  if (event.event_type !== undefined && LIVE_SYNC_EVENT_TYPES.indexOf(event.event_type) === -1) {
    return { ok: false, message: 'Unknown event_type' };
  }
  if (event.verification_status !== undefined && LIVE_SYNC_VERIFICATION_STATUSES.indexOf(event.verification_status) === -1) {
    return { ok: false, message: 'Unknown verification_status' };
  }
  if (event.confidence !== undefined) {
    if (typeof event.confidence !== 'number' || Number.isNaN(event.confidence) || event.confidence < 0 || event.confidence > 100) {
      return { ok: false, message: 'Malformed confidence' };
    }
  }
  if (event.timestamp !== undefined && Number.isNaN(Date.parse(event.timestamp))) {
    return { ok: false, message: 'Malformed timestamp' };
  }
  if (event.effective_date !== undefined && !isUsableId(event.effective_date)) {
    return { ok: false, message: 'Malformed effective_date' };
  }
  return { ok: true, message: null };
}

// ══════════════════════════════════════════════════════════════════════════════
// PURE DECISION CORE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * resolveLiveSyncTarget — WHICH business is being authorized, and by what
 * capability. Pure. This is where the resource-derived rule lives: a
 * row-addressed operation takes its business FROM THE ROW, and a request value
 * that contradicts the row is refused before any business is authorized.
 */
export function resolveLiveSyncTarget(state) {
  const input = state || {};
  const actor = input.actor || null;

  // 1. Actor. Never taken from a request body.
  if (!actor || !isUsableId(actor.profile_id)) {
    return { reason_code: 'ACTOR_UNRESOLVED', business_id: null, capability: null };
  }

  // 2. Capability vocabulary. Unknown verb = deny, never "maybe".
  const capability = capabilityForOperation(input.operation);
  if (!capability) return { reason_code: 'INVALID_CAPABILITY', business_id: null, capability: null };

  const requestBusinessId = isUsableId(input.requestBusinessId) ? input.requestBusinessId : null;

  if (requiresResourceOperation(input.operation)) {
    // A resource-addressed operation must HAVE its row. Evaluated before any
    // business is known, so an absent row and a foreign row are indistinguishable.
    const resource = input.resource || null;
    if (!resource) return { reason_code: 'RESOURCE_NOT_FOUND', business_id: requestBusinessId, capability };
    const rowBusiness = isUsableId(resource.business_id) ? resource.business_id : null;
    if (!rowBusiness) return { reason_code: 'RESOURCE_NOT_FOUND', business_id: null, capability };
    if (requestBusinessId && requestBusinessId !== rowBusiness) {
      return { reason_code: 'RESOURCE_BUSINESS_MISMATCH', business_id: rowBusiness, capability };
    }
    return { reason_code: 'TARGET_RESOLVED', business_id: rowBusiness, capability };
  }

  // A business-scoped operation is authorized for the business it NAMES — the
  // requested value is a lookup target, and authorization must still prove it.
  if (!requestBusinessId) return { reason_code: 'BUSINESS_ACCESS_DENIED', business_id: null, capability };
  return { reason_code: 'TARGET_RESOLVED', business_id: requestBusinessId, capability };
}

/**
 * evaluateLiveSyncAuthorization — the final decision, given the already-resolved
 * access facts. Pure. Business access does NOT imply mutation authority: the
 * capability is consulted separately, and view implies nothing.
 */
export function evaluateLiveSyncAuthorization(state) {
  const input = state || {};
  const target = input.target || null;
  if (!target || target.reason_code !== 'TARGET_RESOLVED') {
    return {
      reason_code: (target && target.reason_code) || 'ACTOR_UNRESOLVED',
      business_id: (target && target.business_id) || null,
      capability: (target && target.capability) || null,
    };
  }

  if (input.businessAccessGranted !== true) {
    return { reason_code: 'BUSINESS_ACCESS_DENIED', business_id: target.business_id, capability: target.capability };
  }
  if (!capabilityAllows(target.capability, input.accessSource)) {
    return { reason_code: 'PERMISSION_DENIED', business_id: target.business_id, capability: target.capability };
  }
  if (input.infrastructureAvailable === false) {
    // Authorized, but there is nothing to act on. Reported as its own state so a
    // missing store can never be mistaken for success or for an absent resource.
    return { reason_code: 'INFRASTRUCTURE_UNAVAILABLE', business_id: target.business_id, capability: target.capability };
  }
  return { reason_code: 'AUTHORIZED', business_id: target.business_id, capability: target.capability };
}

/**
 * Internal reason → the decision a caller is allowed to see. `resourceResolved`
 * applies the non-enumeration rule: once a row has been resolved, a
 * BUSINESS-RELATIONSHIP refusal becomes indistinguishable from an absent
 * resource, so a probe cannot learn that another business owns it. A capability
 * refusal is NOT collapsed — it happens to an actor who already reaches that
 * business and therefore discloses nothing foreign — which is exactly the
 * distinction CB-004 draws. The internal reason is kept for the server log; only
 * the CLIENT code is collapsed.
 */
export function decisionFor(reasonCode, businessId, capability, resourceResolved) {
  const collapsed = Boolean(resourceResolved) && reasonCode === 'BUSINESS_ACCESS_DENIED';
  const mapped = LIVE_SYNC_CLIENT_CODE_BY_REASON[collapsed ? 'RESOURCE_NOT_FOUND' : reasonCode];
  const client = mapped || { code: 'NOT_AUTHORIZED', status: 403 };
  return {
    allowed: isAuthorizedReason(reasonCode),
    executable: isExecutableReason(reasonCode),
    reason_code: reasonCode,
    client_code: client.code,
    http_status: client.status,
    business_id: businessId || null,
    capability: capability || null,
  };
}

/**
 * denialOutcome — the generic client payload for a decision that may not
 * proceed. It carries NO internal reason, no business id, no capability and no
 * relationship detail. A non-executable ALLOW maps to the infrastructure code,
 * because the actor is authorized and the obstacle is not theirs.
 */
export function denialOutcome(decision) {
  const code = (decision && decision.client_code) || 'NOT_AUTHORIZED';
  const status = (decision && decision.http_status) || 403;
  const message = code === 'SERVICE_UNAVAILABLE'
    ? LIVE_SYNC_INFRASTRUCTURE_MESSAGE
    : (LIVE_SYNC_CLIENT_MESSAGE_BY_CODE[code] || 'Not authorized');
  return { status, body: { code, error: message } };
}

/**
 * isInfrastructureFailure — a missing store is an infrastructure fact, never a
 * "resource not found". Conflating the two is what made a missing table look
 * like an absent document in an earlier phase, so they are kept apart here.
 */
export function isInfrastructureFailure(error) {
  const code = error && error.code;
  if (code === 'PGRST205' || code === '42P01') return true;
  const message = error && typeof error.message === 'string' ? error.message : '';
  return /schema cache|does not exist/i.test(message);
}

/**
 * databaseOutcome — a controlled response for a failed store interaction. Raw
 * PostgREST messages and SQL details are never returned to a caller; they stay
 * server-side in the log.
 */
export function databaseOutcome(error) {
  console.error('[liveSyncOrchestrator] store error:', (error && error.code) || '', (error && error.message) || '');
  if (isInfrastructureFailure(error)) {
    return { status: 503, body: { code: 'SERVICE_UNAVAILABLE', error: LIVE_SYNC_INFRASTRUCTURE_MESSAGE } };
  }
  return { status: 500, body: { code: 'INTERNAL_ERROR', error: 'Internal error' } };
}

// ══════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — calls the Security Kernel. It decides nothing of its own.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * authorizeLiveSyncOperation — THE mandatory gate for all three live-sync
 * operations. It returns a decision; never an internal reason to a client, never
 * a credential, and never a business the actor was not proven to reach.
 *
 * The input contract deliberately has NO `actor` field: a caller-constructed
 * actor would be an authorization bypass, so the actor is resolved HERE from the
 * authenticated session.
 */
export async function authorizeLiveSyncOperation(call) {
  const input = call || {};
  const sb = input.sb;

  // ── 1. Actor, from the authenticated session ONLY. ───────────────────────
  let actor = null;
  try {
    actor = await authenticateActor(input.base44, sb);
  } catch (err) {
    const status = typeof err?.status === 'number' ? err.status : 401;
    const reason = status === 403 ? 'ACTOR_SUSPENDED' : 'ACTOR_UNRESOLVED';
    return decisionFor(reason, null, null);
  }

  // ── 2. Row-addressed: load the row BEFORE authorizing, because the row is
  //       what supplies the business. A store failure is infrastructure, and is
  //       never reported as an absent resource. ─────────────────────────────
  let resource = null;
  if (requiresResourceOperation(input.operation) && isUsableId(input.resourceId) && typeof input.loadResource === 'function') {
    try {
      resource = await input.loadResource(input.resourceId);
    } catch (err) {
      return decisionFor('INFRASTRUCTURE_UNAVAILABLE', null, capabilityForOperation(input.operation));
    }
  }

  // ── 3. WHICH business, and which capability. Pure. ──────────────────────
  const target = resolveLiveSyncTarget({
    actor,
    operation: input.operation,
    requestBusinessId: input.requestBusinessId,
    resource,
  });
  if (target.reason_code !== 'TARGET_RESOLVED') {
    return decisionFor(target.reason_code, target.business_id, target.capability);
  }

  // ── 4. Canonical business access, on the RESOLVED business. ─────────────
  let businessAccessGranted = false;
  let accessSource = null;
  try {
    await authorizeBusinessAccess(sb, actor, target.business_id);
    businessAccessGranted = true;
    if (actor.isAdmin) {
      accessSource = 'PLATFORM_ADMIN';
    } else if (actor.profile_id) {
      const ctx = await validateBusinessScope(sb, target.business_id, actor.profile_id);
      accessSource = deriveAccessSource(ctx && ctx.authorization_reason);
    }
  } catch {
    businessAccessGranted = false;
  }

  // ── 5. Business access is NOT execution authority. ──────────────────────
  const evaluation = evaluateLiveSyncAuthorization({
    target,
    businessAccessGranted,
    accessSource,
    infrastructureAvailable: input.infrastructureAvailable !== false,
  });

  const decision = decisionFor(
    evaluation.reason_code,
    evaluation.business_id,
    evaluation.capability,
    requiresResourceOperation(input.operation) && Boolean(resource),
  );

  // The resolved row is returned ONLY when the operation may actually proceed —
  // a denial must not disclose the resource the actor was not authorized to reach.
  return decision.executable ? { ...decision, resource } : { ...decision, resource: null };
}