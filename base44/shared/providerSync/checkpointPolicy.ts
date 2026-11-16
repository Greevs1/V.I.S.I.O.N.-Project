/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — CHECKPOINT POLICY
 *
 * A checkpoint is a promise: "everything before this cursor is persisted". That
 * promise is only safe because of two rules this module states and the database
 * enforces:
 *
 *   1. A checkpoint is advanced ONLY inside the same transaction as the
 *      observations that justify it (there is no standalone advance function).
 *   2. Advance is a COMPARE-AND-SWAP on cursor_version, and for an ordered cursor
 *      it is additionally STRICTLY MONOTONIC.
 *
 * WHY TWO CURSOR KINDS
 *   ordered — the provider exposes a value with real ordering (an epoch, a
 *             sequence, a page ordinal). "Next must be greater than current" is a
 *             meaningful, checkable claim, so it is enforced numerically. A cursor
 *             that could move backwards would re-fetch or, worse, silently skip.
 *   opaque  — the provider hands back a token that must not be interpreted at all
 *             ("v2:abc…"). Lexical comparison of such a token is meaningless and
 *             would be a bug dressed as a guard, so no ordering is asserted; the
 *             expected cursor_version is what makes the advance safe and explicit.
 *
 * The kind is IMMUTABLE per scope: switching a scope from ordered to opaque (or
 * back) mid-flight would silently discard the guarantee that was in force, so the
 * database refuses it and this module never proposes it.
 */

export const CURSOR_KINDS = ['ordered', 'opaque'] as const;

/** The bounded, closed set of scopes. A scope is never composed from caller free text. */
export const CHECKPOINT_SCOPE_PATTERN = /^(accounts|balances|transactions|statement|invoices|journal)(:[A-Za-z0-9_.-]{1,64}){0,2}$/;

export type CursorKind = (typeof CURSOR_KINDS)[number];

export type CommittedCheckpoint = {
  checkpoint_scope: string;
  cursor_kind: CursorKind;
  cursor_ordinal: number | null;
  cursor_token: string | null;
  cursor_version: number;
};

export type PageCursor =
  | { cursor_kind: 'ordered'; cursor_ordinal: number }
  | { cursor_kind: 'opaque'; cursor_token: string };

export function isValidCheckpointScope(scope: unknown): boolean {
  return typeof scope === 'string' && CHECKPOINT_SCOPE_PATTERN.test(scope);
}

export function isCursorKind(value: unknown): boolean {
  return (CURSOR_KINDS as readonly string[]).includes(String(value));
}

/**
 * The advance the worker should propose for a committed (or absent) checkpoint.
 * `expected_version` is ALWAYS sent: the database refuses an advance without it,
 * so there is no code path here that could produce a blind write.
 */
export function makeAdvance(input: {
  scope: string;
  committed: CommittedCheckpoint | null;
  next: PageCursor;
}): Record<string, unknown> {
  const expectedVersion = input.committed ? input.committed.cursor_version : 0;
  const base: Record<string, unknown> = {
    scope: input.scope,
    cursor_kind: input.next.cursor_kind,
    expected_version: expectedVersion,
  };
  if (input.next.cursor_kind === 'ordered') {
    base.cursor_ordinal = input.next.cursor_ordinal;
  } else {
    base.cursor_token = input.next.cursor_token;
  }
  return base;
}

/**
 * validateAdvance — the pure rules, so the worker refuses locally what the database
 * would refuse remotely. An advance is only ever proposed for a page that was
 * actually persisted, which the caller establishes by ingesting first.
 */
export function validateAdvance(input: { committed: CommittedCheckpoint | null; advance: any }): { ok: boolean; code?: string } {
  const advance = input?.advance;
  if (!advance || typeof advance !== 'object') return { ok: false, code: 'advance_missing' };
  if (!isValidCheckpointScope(advance.scope)) return { ok: false, code: 'invalid_checkpoint_scope' };
  if (!isCursorKind(advance.cursor_kind)) return { ok: false, code: 'invalid_cursor_kind' };
  if (!Number.isInteger(advance.expected_version) || advance.expected_version < 0) {
    return { ok: false, code: 'invalid_expected_version' };
  }

  const committed = input.committed;

  if (!committed) {
    if (advance.expected_version !== 0) return { ok: false, code: 'checkpoint_missing_requires_version_zero' };
  } else {
    if (committed.cursor_kind !== advance.cursor_kind) return { ok: false, code: 'cursor_kind_is_immutable' };
    if (committed.cursor_version !== advance.expected_version) return { ok: false, code: 'checkpoint_stale' };
  }

  if (advance.cursor_kind === 'ordered') {
    const ordinal = advance.cursor_ordinal;
    if (typeof ordinal !== 'number' || !Number.isFinite(ordinal) || ordinal < 0) {
      return { ok: false, code: 'ordered_cursor_requires_non_negative_ordinal' };
    }
    if (committed && typeof committed.cursor_ordinal === 'number' && !(ordinal > committed.cursor_ordinal)) {
      return { ok: false, code: 'checkpoint_not_monotonic' };
    }
    if (advance.cursor_token !== undefined && advance.cursor_token !== null) {
      return { ok: false, code: 'ordered_cursor_must_not_carry_token' };
    }
    return { ok: true };
  }

  const token = advance.cursor_token;
  if (typeof token !== 'string' || token.length < 1 || token.length > 4096) {
    return { ok: false, code: 'opaque_cursor_requires_bounded_token' };
  }
  if (advance.cursor_ordinal !== undefined && advance.cursor_ordinal !== null) {
    return { ok: false, code: 'opaque_cursor_must_not_carry_ordinal' };
  }
  return { ok: true };
}

/**
 * defaultScopeForOperation — the bounded fallback scope, derived from the JOB's
 * operation rather than from anything the worker was told.
 *
 * The scope must be known BEFORE the first page is fetched, otherwise a resumed
 * attempt could not tell the provider where to continue from. An adapter that walks
 * several entities names its scope per page; the scope is fixed for the execution and
 * a page that tried to change it is a protocol violation, not a silent re-scope.
 *
 * 'sync.start' begins at the outermost entity (accounts); an adapter walking further
 * entities must name those scopes explicitly.
 */
export function defaultScopeForOperation(operation: unknown): string {
  const op = String(operation || '');
  if (op === 'balances.read') return 'balances';
  if (op === 'transactions.read') return 'transactions';
  return 'accounts';
}

/**
 * nextCursorFromPage — the adapter's page cursor, normalised. A page with no next
 * cursor simply has no advance: the job is at its end, which is a completion, not a
 * checkpoint with a null value.
 */
export function nextCursorFromPage(page: any): PageCursor | null {
  const next = page?.next;
  if (!next || typeof next !== 'object') return null;
  if (next.cursor_kind === 'ordered') {
    const ordinal = next.cursor_ordinal;
    if (typeof ordinal !== 'number' || !Number.isFinite(ordinal) || ordinal < 0) return null;
    return { cursor_kind: 'ordered', cursor_ordinal: ordinal };
  }
  if (next.cursor_kind === 'opaque') {
    const token = next.cursor_token;
    if (typeof token !== 'string' || token.length < 1 || token.length > 4096) return null;
    return { cursor_kind: 'opaque', cursor_token: token };
  }
  return null;
}