/**
 * VISION — CONNECTED BUSINESS
 * CB-001 — Provider vocabulary: the single source of truth for provider-neutral
 * vocabulary shared by backend functions.
 *
 * WHY THIS EXISTS
 *   The database enforces the same vocabulary as CHECK constraints
 *   (phase_cb_001_connection_credential_foundation.sql). This module is the
 *   application-side twin of those constraints, so application code never
 *   invents a third spelling of "quickbooks". Adding a provider means: update
 *   the CHECK constraints in the next provider migration AND add the value here.
 *   Keeping the two in step is asserted by
 *   scripts/connectedBusinessFoundation.test.cjs (drift detection).
 *
 * EXTENDING (documented procedure — deliberately not automatic)
 *   1. Add the provider to PROVIDERS and PROVIDER_CATEGORY.
 *   2. Add its credential types to CREDENTIAL_TYPES.
 *   3. Ship a migration that swaps the corresponding CHECK constraint
 *      (drop constraint + add constraint) — one line each, no redesign.
 *   A Postgres ENUM is deliberately NOT used: ADD VALUE is awkward inside
 *   transactions and values cannot be removed.
 *
 * NO CREDENTIAL VALUE EVER PASSES THROUGH THIS MODULE. It handles vocabulary and
 * the safe-metadata guard only.
 */

export const PROVIDERS = ['quickbooks', 'plaid'] as const;

export const CONNECTION_CATEGORIES = ['accounting', 'banking', 'payroll', 'crm', 'other'] as const;

export const CONNECTION_STATUSES = [
  'connecting',
  'active',
  'syncing',
  'needs_attention',
  'error',
  'disconnected',
  'revoked',
] as const;

/** Sync status is deliberately separate from connection status. NULL = no sync has happened yet. */
export const SYNC_STATUSES = ['idle', 'running', 'failed', 'needs_reauth'] as const;

export const CREDENTIAL_TYPES = [
  'plaid_access',
  'quickbooks_refresh',
  'quickbooks_access',
  'xero_refresh',
  'xero_access',
  'wave_access',
  'wave_refresh',
  'payroll_access',
  'crm_access',
] as const;

/** Expiration is not revocation. */
export const CREDENTIAL_STATUSES = [
  'pending',
  'active',
  'rotating',
  'superseded',
  'revoked',
  'expired',
  'error',
] as const;

export type Provider = (typeof PROVIDERS)[number];
export type ConnectionCategory = (typeof CONNECTION_CATEGORIES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/** Category is a property of the provider, declared once. Capabilities are separate. */
export const PROVIDER_CATEGORY: Record<Provider, ConnectionCategory> = {
  quickbooks: 'accounting',
  plaid: 'banking',
};

/**
 * Which provider a credential type belongs to. This is what stops a plaid
 * credential being attached to a quickbooks connection — the database cannot see
 * this relationship (provider is derived through the connection), so the
 * application layer must enforce it here. This mapping is the mechanism.
 */
export const CREDENTIAL_TYPE_PROVIDER: Record<CredentialType, Provider> = {
  plaid_access: 'plaid',
  quickbooks_refresh: 'quickbooks',
  quickbooks_access: 'quickbooks',
  xero_refresh: 'quickbooks', // placeholder provider binding — xero is not yet admitted
  xero_access: 'quickbooks',
  wave_access: 'quickbooks',
  wave_refresh: 'quickbooks',
  payroll_access: 'quickbooks',
  crm_access: 'quickbooks',
};

// ── Secret-shaped metadata guard ────────────────────────────────────────────
//
// The PRIMARY invariant is architectural: credential plaintext never enters
// business_connections / provider_credentials at all. This guard is a defensive
// second line so the safe-metadata columns cannot casually become a credential
// dumping ground. It is intentionally precise rather than a fuzzy content
// scanner — a brittle pattern matcher that rejects legitimate metadata would be
// worse than useless.
//
// Matching is equality on a normalised key, OR a suffix match against names that
// are unambiguous even as a suffix ("my_access_token" → "myaccesstoken").

/** Exact matches after normalisation. */
export const FORBIDDEN_METADATA_KEYS = [
  'accesstoken',
  'refreshtoken',
  'publictoken',
  'linktoken',
  'authorizationcode',
  'clientsecret',
  'secret',
  'password',
  'credential',
  'privatekey',
  'apikey',
  'token',
] as const;

/** Unambiguous even as a suffix of a longer key. */
export const FORBIDDEN_METADATA_SUFFIXES = [
  'accesstoken',
  'refreshtoken',
  'publictoken',
  'authorizationcode',
  'clientsecret',
  'privatekey',
] as const;

const MAX_DEPTH = 6;

/** Lowercase and strip everything that is not alphanumeric. */
export function normalizeMetadataKey(key: string): string {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenKey(key: string): boolean {
  const n = normalizeMetadataKey(key);
  if (!n) return false;
  if ((FORBIDDEN_METADATA_KEYS as readonly string[]).includes(n)) return true;
  return (FORBIDDEN_METADATA_SUFFIXES as readonly string[]).some((s) => n.endsWith(s));
}

/**
 * Returns the paths of any credential-shaped keys found. Empty array = safe.
 * Recurses into objects and arrays with a bounded depth.
 */
export function findUnsafeMetadataKeys(value: unknown, path = '', depth = 0): string[] {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, i) => {
      found.push(...findUnsafeMetadataKeys(entry, `${path}[${i}]`, depth + 1));
    });
    return found;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (isForbiddenKey(key)) found.push(here);
    found.push(...findUnsafeMetadataKeys(entry, here, depth + 1));
  }
  return found;
}

/**
 * Throws if the value contains a credential-shaped key. Call before writing any
 * *_safe column. Never silently strips — a rejected write must be visible.
 */
export function assertSafeMetadata(value: unknown, label = 'metadata'): void {
  const unsafe = findUnsafeMetadataKeys(value);
  if (unsafe.length > 0) {
    throw new Error(
      `Credential-shaped key(s) rejected in ${label}: ${unsafe.join(', ')}. ` +
        'Credential plaintext must never be written to a *_safe column; it belongs in Vault only.'
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CB-004 — PROVIDER OPERATION AUTHORIZATION VOCABULARY
//
// These are the application-side twins of the CHECK constraints in
// phase_cb_004_provider_operation_authorization.sql. Adding an operation or a
// reason code means: change the CONSTRAINT in the next migration AND this list.
// The drift between them is asserted by scripts/cb004AuthorizationKernel.test.cjs.
//
// WHY A CLOSED VOCABULARY
//   Authorization must never receive "a string that happens to be valid". An
//   operation outside this list is refused, so a typo, a renamed action or a
//   caller-invented verb can never silently become an authorized operation.
// ════════════════════════════════════════════════════════════════════════════

export const PROVIDER_OPERATIONS = [
  'connection.create',
  'connection.read',
  'connection.update',
  'connection.disconnect',
  'authorization.begin',
  'authorization.complete',
  'authorization.cancel',
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
  // CB-004.2 — the ONE system-side execution operation. Its meaning is "authorize
  // the system worker to execute THIS SPECIFIC already-created, immutable provider
  // sync job" — never "authorize generic provider sync". The job resource is the
  // authorization boundary, so this operation grants no provider-read authority of
  // its own: the read it eventually performs is bound by the immutable job row.
  'sync.execute',
] as const;

export type ProviderOperation = (typeof PROVIDER_OPERATIONS)[number];

/**
 * The ONE value the audit may record for a request whose operation is NOT in the
 * vocabulary above. The requested string is deliberately NOT stored: an audit
 * column must never become an unbounded sink for caller-supplied text. The row
 * records THAT an out-of-vocabulary operation was attempted, and with which
 * actor, which is the security-relevant fact.
 */
export const AUDIT_UNKNOWN_OPERATION = 'unknown';

/** An operation is known only by exact membership. Anything else fails closed. */
export function isProviderOperation(value: unknown): boolean {
  return (PROVIDER_OPERATIONS as readonly string[]).includes(String(value));
}

/** The two actor kinds the audit distinguishes. A system path never names a profile. */
export const AUDIT_ACTOR_KINDS = ['user', 'system'] as const;

export const AUDIT_DECISIONS = ['allow', 'deny'] as const;

/**
 * actor-kind ↔ operation legality, declared ONCE. `user` performs everything an
 * interactive actor may ask for. `system` is NARROWER, never broader: only the
 * three operations that genuinely have no interactive actor — resolving a
 * credential for provider execution, processing a provider webhook, and
 * executing one specific already-created job (CB-004.2). A background worker
 * that needed more would have to extend this table deliberately (and ship a
 * migration), not inherit it.
 *
 * The database mirrors this rule: actor_kind='system' is recordable only for
 * these operations (or as a deny). The mirror is drift-checked by the harness.
 */
export const SYSTEM_OPERATIONS = ['credential.resolve', 'webhook.process', 'sync.execute'] as const;

export function operationActorKind(operation: unknown): 'user' | 'system' | null {
  if (!isProviderOperation(operation)) return null;
  return (SYSTEM_OPERATIONS as readonly string[]).includes(String(operation)) ? 'system' : 'user';
}

/** The bounded reason-code vocabulary. Deterministic auditing depends on it. */
export const PROVIDER_OPERATION_REASON_CODES = [
  'AUTHORIZED',
  'ACTOR_UNRESOLVED',
  'BUSINESS_ACCESS_DENIED',
  'PERMISSION_DENIED',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_BUSINESS_MISMATCH',
  'CONNECTION_INACTIVE',
  'OPERATION_NOT_ALLOWED',
  'INVALID_OPERATION',
  'AUTHORIZATION_ATTEMPT_INVALID',
  'CREDENTIAL_UNAVAILABLE',
  'PROVIDER_AUTHENTICITY_FAILED',
  'SYSTEM_CONTEXT_UNRESOLVED',
] as const;

export type ProviderOperationReasonCode = (typeof PROVIDER_OPERATION_REASON_CODES)[number];

/** Resource types the audit may record. Bounded, like every other vocabulary here. */
export const PROVIDER_RESOURCE_TYPES = [
  'connection',
  'credential',
  'authorization_attempt',
  'sync_job',
  'webhook_event',
  'account',
  'balance',
  'transaction',
] as const;

/**
 * Connection states in which a provider operation may actually EXECUTE.
 * Authorization and execution are different questions (CB-004 §15): an actor may
 * be fully authorized while the connection is unusable.
 */
export const EXECUTABLE_CONNECTION_STATES = ['active', 'syncing'] as const;

/** Client-safe codes. Small on purpose — see the non-enumeration rule below. */
export const CLIENT_CODES = [
  'AUTHORIZED',
  'NOT_AUTHORIZED',
  'RESOURCE_UNAVAILABLE',
  'NOT_EXECUTABLE',
  'INVALID_REQUEST',
] as const;

export type ClientCode = (typeof CLIENT_CODES)[number];