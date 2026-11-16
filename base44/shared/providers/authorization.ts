/**
 * VISION — CONNECTED BUSINESS
 * CB-004 — PROVIDER OPERATION AUTHORIZATION KERNEL
 *
 * THE PERMANENT INVARIANT THIS MODULE EXISTS TO ENFORCE:
 *
 *   SERVICE ROLE IS CAPABILITY, NOT AUTHORIZATION.
 *
 * A backend function holding the service-role key can reach every row. That is
 * capability. It is never permission. Possession of the key, of a business_id in
 * a request body, or of a connection id must not authorize anything.
 *
 * THE ONE CHAIN (no provider operation may bypass it):
 *
 *   authenticated session            → authenticateActor       (canonical actor)
 *   canonical business + access      → authorizeBusinessAccess (canonical gate)
 *   relationship → capability class  → validateBusinessScope   (canonical source)
 *   row-derived resource context     → this module            (never the request)
 *   operation → required permission  → this module
 *   resource state                   → this module
 *   append-only audit                → provider_operation_audit_record
 *
 * REUSE, NEVER DUPLICATE (CB-004 §2)
 *   `authenticateActor`, `authorizeBusinessAccess` and `validateBusinessScope`
 *   are the existing Security Kernel. This module calls them; it does not
 *   restate the seven-source business rule, does not resolve an actor itself,
 *   and does not create a second user or role model. The actor is resolved HERE,
 *   from the authenticated session, and a caller cannot supply one (CB-004 §5):
 *   a caller-constructed actor object would be an authorization bypass, so the
 *   input contract deliberately has no `actor` field.
 *
 * ROW-DERIVED CONTEXT (CB-004 §6) — the confused-deputy defence
 *   When a request names an existing resource, its business is read from the
 *   ROW. A request-supplied business_id is never authority for a row; if it
 *   contradicts the row, the call is denied as RESOURCE_BUSINESS_MISMATCH. The
 *   request body can therefore never redirect authorization to another business.
 *
 * NON-ENUMERATION (CB-004 §13)
 *   Two facts must be indistinguishable to a caller who does not own the row:
 *   "no such resource" and "that resource belongs to another business". They are
 *   therefore mapped to ONE client code. The internal reason_code is written to
 *   the audit and is NEVER returned — the kernel structurally cannot leak it,
 *   because the decision it returns has no field for it. On a denial the caller
 *   receives no resolved context at all (no business, no provider).
 *
 * AUTHORIZED ≠ EXECUTABLE (CB-004 §15)
 *   `allowed` answers "may this actor do this to this resource?".
 *   `executable` answers "may it proceed right now?" — a disconnected
 *   connection or an unusable credential is authorized but not executable. The
 *   AUDIT records the effective decision (allow only when executable), so an
 *   operation that did not proceed is never recorded as permitted.
 *
 * THE CREDENTIAL BOUNDARY (CB-004 §9)
 *   This module has no Vault access, no credential-resolution call and no
 *   plaintext field anywhere in its contract. It decides and it audits; only
 *   AFTER an ALLOW may trusted provider code invoke provider_credential_resolve.
 *   It also never consumes an authorization attempt — consumption belongs to the
 *   certified CB-003 function, which is why reauthorization necessarily precedes
 *   consumption (§16): the kernel cannot consume, so it cannot pre-empt.
 *
 * HARNESS CONSTRAINT (same convention as shared/authz/documentAccess.ts)
 *   The authorization harness executes THIS FILE'S REAL SOURCE, so keep each
 *   `export type` / `export interface` on ONE LINE, annotate only with `: any`,
 *   and keep policy maps free of type annotations on the declaration itself.
 *   A multi-line declaration would break the strip that makes the real logic
 *   testable, and an untested security module is not a security module.
 */

import { authenticateActor, authorizeBusinessAccess } from '../authz/actor.ts';
import { validateBusinessScope } from '../businessScope/writeGuard.ts';
import {
  PROVIDERS,
  PROVIDER_OPERATIONS,
  PROVIDER_RESOURCE_TYPES,
  PROVIDER_OPERATION_REASON_CODES,
  AUDIT_UNKNOWN_OPERATION,
  AUDIT_DECISIONS,
  SYSTEM_OPERATIONS,
  operationActorKind,
  isProviderOperation,
  EXECUTABLE_CONNECTION_STATES,
  CLIENT_CODES,
  assertSafeMetadata,
} from './vocabulary.ts';

export type ProviderOperationDecision = { allowed: boolean; executable: boolean; client_code: string; http_status: number; audit_id: string | null; context: any };
export type ProviderOperationInput = { sb: any; base44?: any; operation: any; actorKind?: any; businessId?: any; provider?: any; connectionId?: any; credentialId?: any; authorizationAttemptId?: any; resourceType?: any; resourceId?: any; requestCorrelationId?: any; metadata?: any; systemContext?: any; now?: any };

const isUsableId = (v) => typeof v === 'string' && v.trim().length > 0;
const isKnownProvider = (v) => typeof v === 'string' && (PROVIDERS as readonly string[]).includes(v);

// ── Relationship → capability class ─────────────────────────────────────────
//
// The canonical business rule already returns WHICH relationship authorized the
// actor (`validateBusinessScope().authorization_reason`). Mapping that one value
// to a capability class is the smallest permission model that is honest about
// what already exists: it invents no new role, no new table and no second
// authorization path. An unrecognized reason is NOT_ a source and grants
// nothing — the mapping fails closed in both directions.

/** The bounded capability set. Five permissions, not fifty. */
export const PROVIDER_PERMISSIONS = [
  'connections.view',
  'connections.manage',
  'credentials.manage',
  'financial_data.view',
  'financial_data.sync',
];

export const ACCESS_SOURCES = [
  'OWNER',
  'ASSIGNED_ADVISOR',
  'TEAM_MEMBER',
  'ADVISOR',
  'EXPERT',
  'PLATFORM_ADMIN',
];

/** The canonical reason strings this module understands, most specific first. */
export const ACCESS_SOURCE_BY_RULE = [
  { prefix: 'assigned_advisor (', source: 'ASSIGNED_ADVISOR' },
  { prefix: 'owner (', source: 'OWNER' },
  { prefix: 'advisor (', source: 'ADVISOR' },
  { exact: 'team_member', source: 'TEAM_MEMBER' },
  { exact: 'expert_access', source: 'EXPERT' },
  { exact: 'super_admin', source: 'PLATFORM_ADMIN' },
];

/**
 * Which relationship classes hold which capability. A team member or an expert
 * may see financial data through the connection; neither may rewire it or touch
 * credentials, which is what "do not broaden access" means here.
 */
export const PROVIDER_PERMISSION_SOURCES = {
  'connections.view': ['OWNER', 'ASSIGNED_ADVISOR', 'TEAM_MEMBER', 'ADVISOR', 'PLATFORM_ADMIN'],
  'connections.manage': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],
  'credentials.manage': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],
  'financial_data.view': ['OWNER', 'ASSIGNED_ADVISOR', 'TEAM_MEMBER', 'ADVISOR', 'EXPERT', 'PLATFORM_ADMIN'],
  'financial_data.sync': ['OWNER', 'ASSIGNED_ADVISOR', 'ADVISOR', 'PLATFORM_ADMIN'],
};

/** operation → the ONE permission it requires. null = system-only, no user permission. */
export const OPERATION_PERMISSION = {
  'connection.create': 'connections.manage',
  'connection.read': 'connections.view',
  'connection.update': 'connections.manage',
  'connection.disconnect': 'connections.manage',
  'authorization.begin': 'connections.manage',
  'authorization.complete': 'connections.manage',
  'authorization.cancel': 'connections.manage',
  'credential.create': 'credentials.manage',
  'credential.resolve': null,
  'credential.rotate': 'credentials.manage',
  'credential.revoke': 'credentials.manage',
  'accounts.read': 'financial_data.view',
  'balances.read': 'financial_data.view',
  'transactions.read': 'financial_data.view',
  'sync.start': 'financial_data.sync',
  'sync.read': 'financial_data.view',
  'sync.retry': 'financial_data.sync',
  'webhook.process': null,
  // CB-004.2 — a SYSTEM operation, and NOT a user permission. It deliberately maps
  // to no permission at all: no browser or user actor may reach it, and its
  // authority is the job resource, which is validated in its own right below.
  'sync.execute': null,
};

/** Operations that address an EXISTING connection. The row supplies the business. */
export const OPERATIONS_REQUIRING_CONNECTION = [
  // CB-004.2 — a job execution resolves its connection from the job's own row, so
  // it must satisfy the same connection requirement as every provider read.
  'sync.execute',
  'connection.read',
  'connection.update',
  'connection.disconnect',
  'credential.create',
  'credential.resolve',
  'credential.rotate',
  'credential.revoke',
  'accounts.read',
  'balances.read',
  'transactions.read',
  'sync.start',
  'sync.read',
  'sync.retry',
  'webhook.process',
];

/** Operations that may only proceed while the connection is genuinely usable. */
export const OPERATIONS_REQUIRING_USABLE_CONNECTION = [
  // CB-004.2 — an execution against an unusable connection is authorized but not
  // executable. Job execution obeys exactly the rule provider reads obey.
  'sync.execute',
  'credential.create',
  'credential.resolve',
  'accounts.read',
  'balances.read',
  'transactions.read',
  'sync.start',
  'sync.read',
  'sync.retry',
  'webhook.process',
];

/**
 * CB-004.2 — operations that authorize execution of a SPECIFIC already-created
 * job resource. The resource IS the authorization boundary: the operation carries
 * no provider-read authority of its own, and the exact provider operation is bound
 * permanently by the immutable job row.
 */
export const OPERATIONS_REQUIRING_JOB_RESOURCE = ['sync.execute'];

/** The ONE resource type a job execution may name. */
export const JOB_RESOURCE_TYPE = 'sync_job';

/**
 * CB-005B — operations that additionally require a USABLE credential for the job's
 * ROTATION UNIT. `sync.execute` is the only member: a job that cannot present a live
 * credential must not be executed, even when the actor and the connection are fine.
 *
 * The check is addressed by the UNIT (connection + credential_type), not by a
 * credential id, because that is how CB-002/CB-002.1 address credentials — so a
 * rotated successor satisfies the rule, while a revoked, expired or mismatched unit
 * fails it. Only a job execution is reachable here; no existing operation changes.
 */
export const OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL = ['sync.execute'];

/** Operations that consume/act on an authorization attempt, which must be live. */
export const OPERATIONS_REQUIRING_LIVE_ATTEMPT = ['authorization.complete', 'authorization.cancel'];

/** credential → the statuses in which that operation may act on it. */
export const CREDENTIAL_ACTIONABLE_STATUSES = {
  'credential.rotate': ['active'],
  'credential.revoke': ['active', 'pending', 'superseded'],
};

/** Reasons in which the actor IS authorized; only AUTHORIZED may execute. */
export const AUTHORIZATION_GRANTING_REASONS = ['AUTHORIZED', 'CONNECTION_INACTIVE', 'CREDENTIAL_UNAVAILABLE'];

/**
 * The non-enumeration rule, in one table. RESOURCE_NOT_FOUND and
 * RESOURCE_BUSINESS_MISMATCH are deliberately the SAME client code: a caller who
 * does not own the row cannot tell "absent" from "not yours".
 */
export const CLIENT_CODE_BY_REASON = {
  AUTHORIZED: { code: 'AUTHORIZED', status: 200 },
  ACTOR_UNRESOLVED: { code: 'NOT_AUTHORIZED', status: 401 },
  PROVIDER_AUTHENTICITY_FAILED: { code: 'NOT_AUTHORIZED', status: 401 },
  BUSINESS_ACCESS_DENIED: { code: 'NOT_AUTHORIZED', status: 403 },
  PERMISSION_DENIED: { code: 'NOT_AUTHORIZED', status: 403 },
  OPERATION_NOT_ALLOWED: { code: 'NOT_AUTHORIZED', status: 403 },
  SYSTEM_CONTEXT_UNRESOLVED: { code: 'NOT_AUTHORIZED', status: 403 },
  RESOURCE_NOT_FOUND: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  RESOURCE_BUSINESS_MISMATCH: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  AUTHORIZATION_ATTEMPT_INVALID: { code: 'RESOURCE_UNAVAILABLE', status: 404 },
  INVALID_OPERATION: { code: 'INVALID_REQUEST', status: 400 },
  CONNECTION_INACTIVE: { code: 'NOT_EXECUTABLE', status: 409 },
  CREDENTIAL_UNAVAILABLE: { code: 'NOT_EXECUTABLE', status: 409 },
};

// ════════════════════════════════════════════════════════════════════════════
// PURE DECISION CORE — no I/O, no database, no network.
// Every security-critical decision lives here so it can be executed and mutated
// in the harness. The orchestrator below only loads rows and appends the audit.
// ════════════════════════════════════════════════════════════════════════════

/** canonical reason → relationship class, or null (fail closed). */
export function deriveAccessSource(reason) {
  if (typeof reason !== 'string' || reason.length === 0) return null;
  for (const rule of ACCESS_SOURCE_BY_RULE) {
    if (rule.exact !== undefined && reason === rule.exact) return rule.source;
    if (rule.prefix !== undefined && reason.startsWith(rule.prefix)) return rule.source;
  }
  return null;
}

/** Does this relationship class hold this capability? Unknown = no. */
export function permissionAllows(permission, source) {
  if (!permission || !source) return false;
  const sources = PROVIDER_PERMISSION_SOURCES[permission];
  if (!Array.isArray(sources)) return false;
  return sources.indexOf(source) > -1;
}

/** Is the system context an explicit, well-formed claim? */
export function isWellFormedSystemContext(systemContext) {
  if (!systemContext || typeof systemContext !== 'object') return false;
  if (systemContext.kind !== 'webhook' && systemContext.kind !== 'sync_worker') return false;
  return isUsableId(systemContext.evidence_id);
}

/**
 * evaluateProviderOperation — THE decision. Pure: every fact it needs is an
 * argument, including the already-resolved access facts. Returns the internal
 * reason code, which is written to the audit and never returned to a caller.
 */
export function evaluateProviderOperation(input) {
  const state = input || {};
  const actorKind = state.actorKind === 'system' ? 'system' : 'user';
  const actor = state.actor || null;
  const operation = state.operation;
  const now = typeof state.now === 'number' ? state.now : Date.now();

  const connection = state.connection || null;
  const credential = state.credential || null;
  const attempt = state.attempt || null;

  // ── 1. Actor context. Never taken from a request body (§5). ──────────────
  if (actorKind === 'user') {
    if (!actor || !isUsableId(actor.profile_id)) return denyWith('ACTOR_UNRESOLVED');
  } else {
    if (!state.systemContext || state.systemContext.authenticity !== 'verified') {
      return denyWith('PROVIDER_AUTHENTICITY_FAILED');
    }
    if (!isWellFormedSystemContext(state.systemContext)) return denyWith('SYSTEM_CONTEXT_UNRESOLVED');
  }

  // ── 2. Operation vocabulary. Unknown verb = deny, never "maybe". ─────────
  const requestProvider = isKnownProvider(state.requestProvider) ? state.requestProvider : null;
  if (!isProviderOperation(operation)) return denyWith('INVALID_OPERATION', null, requestProvider);

  // ── 3. Actor kind ↔ operation legality (system is narrower, never broader).
  if (operationActorKind(operation) !== actorKind) return denyWith('OPERATION_NOT_ALLOWED', null, requestProvider);

  // ── 4. ROW-DERIVED resource context. The request cannot name the business. ─
  const rowBusiness = (credential && credential.business_id)
    || (attempt && attempt.business_id)
    || (connection && connection.business_id)
    || null;
  const rowProvider = (connection && connection.provider)
    || (attempt && attempt.provider)
    || requestProvider;
  const connectionState = (connection && connection.status) || null;

  const requestBusinessId = isUsableId(state.businessId) ? state.businessId : null;

  // ── 4b. CB-004.2 — an operation that authorizes execution of a SPECIFIC job
  //        must NAME that job. The resource is the authorization boundary, so a
  //        missing or differently-shaped resource is refused BEFORE any row is
  //        probed: a caller cannot substitute another resource class for the one
  //        the operation is scoped to. The job's own binding (which business, which
  //        connection, which provider operation) is re-verified by the execution
  //        verifier, which owns the job table; this kernel only proves that the
  //        request named the resource the operation requires.
  if (OPERATIONS_REQUIRING_JOB_RESOURCE.indexOf(operation) > -1) {
    if (state.resourceType !== JOB_RESOURCE_TYPE || !isUsableId(state.resourceId)) {
      return denyWith('RESOURCE_NOT_FOUND', rowBusiness || requestBusinessId, rowProvider);
    }
  }

  // ── 5. A resource-addressed operation must actually HAVE its row. ────────
  //      Evaluated BEFORE the business is resolved, so a call naming a resource
  //      that does not exist fails as RESOURCE_NOT_FOUND — the same client code a
  //      foreign resource produces — and never as a business refusal that would
  //      tell the caller which of the two it was.
  const needsConnection = OPERATIONS_REQUIRING_CONNECTION.indexOf(operation) > -1;
  if (needsConnection && !connection) {
    return denyWith('RESOURCE_NOT_FOUND', rowBusiness || requestBusinessId, rowProvider);
  }
  if (state.needsCredential && !credential) {
    return denyWith('RESOURCE_NOT_FOUND', rowBusiness || requestBusinessId, rowProvider);
  }

  // ── 6. Contradiction between the request and the row: hard deny. ────────
  if (requestBusinessId && rowBusiness && requestBusinessId !== rowBusiness) {
    return denyWith('RESOURCE_BUSINESS_MISMATCH', rowBusiness, rowProvider);
  }

  const businessId = rowBusiness || requestBusinessId;
  if (!businessId) return denyWith('BUSINESS_ACCESS_DENIED');

  // ── 7. The audit requires a provider whenever an ALLOW is recorded. ──────
  if (!isKnownProvider(rowProvider)) return denyWith('INVALID_OPERATION', businessId, null);

  // ── 8. Canonical business access (user actors only; system is row-scoped). ─
  if (actorKind === 'user') {
    if (state.businessAccessGranted !== true) return denyWith('BUSINESS_ACCESS_DENIED', businessId, rowProvider);
    const permission = OPERATION_PERMISSION[operation];
    if (!permissionAllows(permission, state.accessSource)) {
      return denyWith('PERMISSION_DENIED', businessId, rowProvider);
    }
  }

  // ── 9. Authorization attempt must be live, and must be this actor's. ─────
  if (OPERATIONS_REQUIRING_LIVE_ATTEMPT.indexOf(operation) > -1) {
    if (!attempt) return denyWith('AUTHORIZATION_ATTEMPT_INVALID', businessId, rowProvider);
    if (attempt.status !== 'pending') return denyWith('AUTHORIZATION_ATTEMPT_INVALID', businessId, rowProvider);
    const expiresAt = attempt.expires_at ? Date.parse(attempt.expires_at) : null;
    if (expiresAt !== null && !(expiresAt > now)) {
      return denyWith('AUTHORIZATION_ATTEMPT_INVALID', businessId, rowProvider);
    }
    if (actorKind === 'user' && isUsableId(attempt.initiated_by_profile_id)
      && attempt.initiated_by_profile_id !== actor.profile_id) {
      return denyWith('AUTHORIZATION_ATTEMPT_INVALID', businessId, rowProvider);
    }
  }

  // ── 10. Resource STATE. Authorized is not executable (§15). ──────────────
  if (OPERATIONS_REQUIRING_USABLE_CONNECTION.indexOf(operation) > -1) {
    if (!connectionState || (EXECUTABLE_CONNECTION_STATES as readonly string[]).indexOf(connectionState) === -1) {
      return denyWith('CONNECTION_INACTIVE', businessId, rowProvider);
    }
  }

  const actionable = CREDENTIAL_ACTIONABLE_STATUSES[operation];
  if (actionable && (!credential || actionable.indexOf(credential.status) === -1)) {
    return denyWith('CREDENTIAL_UNAVAILABLE', businessId, rowProvider);
  }

  if (operation === 'credential.resolve') {
    if (!credential || credential.status !== 'active' || credential.superseded_by_credential_id) {
      return denyWith('CREDENTIAL_UNAVAILABLE', businessId, rowProvider);
    }
    const credExpiry = credential.expires_at ? Date.parse(credential.expires_at) : null;
    if (credExpiry !== null && !(credExpiry > now)) {
      return denyWith('CREDENTIAL_UNAVAILABLE', businessId, rowProvider);
    }
  }

  // ── 10b. CB-005B — a job execution needs a LIVE credential for its unit. ─
  //      The same facts credential.resolve asks for, asked of a different
  //      operation: active, not superseded, not expired, and belonging to the
  //      connection being used. Reachable for sync.execute only.
  if (OPERATIONS_REQUIRING_ACTIVE_CREDENTIAL.indexOf(operation) > -1) {
    if (!credential || credential.status !== 'active' || credential.superseded_by_credential_id) {
      return denyWith('CREDENTIAL_UNAVAILABLE', businessId, rowProvider);
    }
    const unitExpiry = credential.expires_at ? Date.parse(credential.expires_at) : null;
    if (unitExpiry !== null && !(unitExpiry > now)) {
      return denyWith('CREDENTIAL_UNAVAILABLE', businessId, rowProvider);
    }
    if (connection && isUsableId(credential.business_connection_id)
      && credential.business_connection_id !== connection.id) {
      return denyWith('CREDENTIAL_UNAVAILABLE', businessId, rowProvider);
    }
  }

  return {
    reason_code: 'AUTHORIZED',
    business_id: businessId,
    provider: rowProvider,
    connection_state: connectionState,
  };
}

function denyWith(reasonCode, businessId, provider) {
  return {
    reason_code: reasonCode,
    business_id: businessId || null,
    provider: provider || null,
    connection_state: null,
  };
}

/** Is the actor authorized (as opposed to merely not-yet-executable)? */
export function isAuthorizedReason(reasonCode) {
  return AUTHORIZATION_GRANTING_REASONS.indexOf(reasonCode) > -1;
}

/** Is the operation permitted to PROCEED right now? Only AUTHORIZED is. */
export function isExecutableReason(reasonCode) {
  return reasonCode === 'AUTHORIZED';
}

/**
 * Internal reason code → client-safe code. `resourceResolved` applies the
 * non-enumeration rule: when the request addressed a row that exists, a business
 * refusal becomes indistinguishable from an absent resource, so a probe cannot
 * learn that another business owns it.
 */
export function mapReasonToClient(reasonCode, opts) {
  const resolved = Boolean(opts && opts.resourceResolved);
  if (resolved && reasonCode === 'BUSINESS_ACCESS_DENIED') {
    return { code: 'RESOURCE_UNAVAILABLE', status: 404 };
  }
  const mapped = CLIENT_CODE_BY_REASON[reasonCode];
  if (!mapped) return { code: 'NOT_AUTHORIZED', status: 403 };
  return { code: mapped.code, status: mapped.status };
}

/**
 * The audit decision. An operation that could not proceed is recorded as a
 * DENY, and the reason code says whether the obstacle was permission or state.
 */
export function auditDecisionFor(reasonCode) {
  return isExecutableReason(reasonCode) ? 'allow' : 'deny';
}

// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — loads rows, calls the Security Kernel, appends the audit.
// It makes NO authorization decision of its own.
// ════════════════════════════════════════════════════════════════════════════

/**
 * authorizeProviderOperation — THE mandatory gate for every Connected Business
 * provider operation. Returns a decision; never a credential, never a plaintext
 * value, and never an internal reason code.
 */
export async function authorizeProviderOperation(input) {
  const call = input || {};
  const sb = call.sb;
  const actorKind = call.actorKind === 'system' ? 'system' : 'user';
  const operation = call.operation;
  const correlationId = isUsableId(call.requestCorrelationId) ? call.requestCorrelationId : null;

  let actor = null;
  let businessAccessGranted = null;
  let accessSource = null;
  let connection = null;
  let credential = null;
  let attempt = null;

  // ── Actor: resolved from the authenticated session ONLY (§5). ────────────
  if (actorKind === 'user') {
    try {
      actor = await authenticateActor(call.base44, sb);
    } catch {
      return await conclude({ reason: 'ACTOR_UNRESOLVED', actorKind, actorProfileId: null, call, provider: null, businessId: null, connection: null, attempt: null, correlationId });
    }
  }

  const knownOperation = isProviderOperation(operation);

  // ── Rows. Each is addressed by id; the business is read FROM the row. ───
  if (isUsableId(call.connectionId)) connection = await loadRow(sb, 'business_connections', call.connectionId);
  if (isUsableId(call.credentialId)) credential = await loadRow(sb, 'provider_credentials', call.credentialId);
  if (isUsableId(call.authorizationAttemptId)) attempt = await loadRow(sb, 'provider_authorization_attempts', call.authorizationAttemptId);

  // A credential named as a resource is the credential under authorization, so
  // a credential operation must resolve it even when only resourceId was given.
  if (!credential && call.resourceType === 'credential' && isUsableId(call.resourceId)) {
    credential = await loadRow(sb, 'provider_credentials', call.resourceId);
  }
  if (!connection && credential) connection = await loadRow(sb, 'business_connections', credential.business_connection_id);

  // ── Canonical business access, on the ROW-DERIVED business (§7). ────────
  const derivedBusiness = (credential && credential.business_id)
    || (attempt && attempt.business_id)
    || (connection && connection.business_id)
    || (isUsableId(call.businessId) ? call.businessId : null);

  if (actorKind === 'user' && actor && derivedBusiness) {
    try {
      await authorizeBusinessAccess(sb, actor, derivedBusiness);
      businessAccessGranted = true;
      if (actor.isAdmin) {
        accessSource = 'PLATFORM_ADMIN';
      } else if (actor.profile_id) {
        const ctx = await validateBusinessScope(sb, derivedBusiness, actor.profile_id);
        accessSource = deriveAccessSource(ctx && ctx.authorization_reason);
      }
    } catch {
      businessAccessGranted = false;
    }
  }

  const evaluation = evaluateProviderOperation({
    actorKind,
    actor,
    operation,
    businessId: call.businessId,
    requestProvider: call.provider,
    systemContext: call.systemContext,
    connection,
    credential,
    attempt,
    businessAccessGranted,
    accessSource,
    resourceType: call.resourceType,
    resourceId: call.resourceId,
    needsCredential: operation === 'credential.resolve' || call.resourceType === 'credential',
    now: typeof call.now === 'number' ? call.now : Date.now(),
  });

  return await conclude({
    reason: evaluation.reason_code,
    actorKind,
    actorProfileId: actor ? actor.profile_id : null,
    call,
    provider: evaluation.provider,
    businessId: evaluation.business_id,
    connection,
    attempt,
    correlationId,
    connectionState: evaluation.connection_state,
    resourceResolved: Boolean(connection || credential || attempt),
    knownOperation,
    metadata: call.metadata,
    systemContext: call.systemContext,
  });
}

/**
 * conclude — the single exit. It maps the internal reason to a client code,
 * appends the audit row (ALLOW and DENY alike), and returns the decision. If the
 * audit cannot be appended the call FAILS: an authorization that cannot be
 * recorded must not proceed (§12).
 */
async function conclude(args) {
  const reason = args.reason;
  const executable = isExecutableReason(reason);
  const allowed = isAuthorizedReason(reason);
  const client = mapReasonToClient(reason, { resourceResolved: args.resourceResolved });

  const meta = typeof args.metadata === 'object' && args.metadata !== null ? args.metadata : {};
  if (args.systemContext) {
    meta.system = {
      kind: args.systemContext.kind || null,
      authenticity: args.systemContext.authenticity || null,
      evidence_id: args.systemContext.evidence_id || null,
    };
  }
  assertSafeMetadata(meta, 'provider_operation_audit.safe_metadata');

  const auditId = await appendProviderOperationAudit(args.call.sb, {
    actor_kind: args.actorKind,
    actor_profile_id: args.actorProfileId,
    business_id: args.businessId,
    provider: args.provider,
    operation: args.knownOperation === false ? AUDIT_UNKNOWN_OPERATION : args.call.operation,
    business_connection_id: args.connection ? args.connection.id : null,
    authorization_attempt_id: args.attempt ? args.attempt.id : null,
    resource_type: PROVIDER_RESOURCE_TYPES.indexOf(args.call.resourceType) > -1 ? args.call.resourceType : null,
    resource_id: isUsableId(args.call.resourceId) ? args.call.resourceId : null,
    decision: auditDecisionFor(reason),
    reason_code: reason,
    request_correlation_id: args.correlationId,
    safe_metadata: meta,
  });

  return {
    allowed,
    executable,
    client_code: client.code,
    http_status: client.status,
    audit_id: auditId,
    // Context is returned ONLY when the operation may proceed. A denial must not
    // disclose the resolved business or provider of a row the actor does not own.
    context: executable
      ? {
          actor_kind: args.actorKind,
          actor_profile_id: args.actorProfileId,
          business_id: args.businessId,
          provider: args.provider,
          operation: args.call.operation,
          business_connection_id: args.connection ? args.connection.id : null,
          authorization_attempt_id: args.attempt ? args.attempt.id : null,
          resource_type: args.call.resourceType || null,
          resource_id: args.call.resourceId || null,
          connection_state: args.connectionState || null,
        }
      : null,
  };
}

/** One row, by id, from the table that owns it. Never a request-supplied business. */
async function loadRow(sb, table, id) {
  const { data } = await sb.from(table).select('*').eq('id', id).maybeSingle();
  return data || null;
}

/**
 * appendProviderOperationAudit — the ONLY writer of the audit trail. The database
 * function validates the vocabularies, rejects credential-shaped metadata and
 * inserts; no role holds INSERT/UPDATE/DELETE on the table itself.
 */
export async function appendProviderOperationAudit(sb, row) {
  const { data, error } = await sb.rpc('provider_operation_audit_record', {
    p_actor_kind: row.actor_kind,
    p_actor_profile_id: row.actor_profile_id,
    p_business_id: row.business_id,
    p_provider: row.provider,
    p_operation: row.operation,
    p_business_connection_id: row.business_connection_id,
    p_authorization_attempt_id: row.authorization_attempt_id,
    p_resource_type: row.resource_type,
    p_resource_id: row.resource_id,
    p_decision: row.decision,
    p_reason_code: row.reason_code,
    p_request_correlation_id: row.request_correlation_id,
    p_safe_metadata: row.safe_metadata || {},
  });
  if (error) {
    throw new Error(`provider_operation_audit_record failed: ${error.message}`);
  }
  return data || null;
}