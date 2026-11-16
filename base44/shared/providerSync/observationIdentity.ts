/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — OBSERVATION IDENTITY
 *
 * §4's two axes, and the canonicalisation that keeps them apart:
 *
 *   PROVIDER OBJECT IDENTITY      object_type + provider_object_id
 *   OBSERVATION VERSION IDENTITY  value_kind + source_version
 *   CONTENT                       payload (canonical, bounded, stored as jsonb)
 *
 * THE DEDUPLICATION KEY IS COMPUTED BY THE DATABASE, from the job row and these
 * values, as sha256 over exactly DEDUP_KEY_FIELDS in order. This module computes the
 * same key for two reasons only: to deduplicate a single batch before sending it, and
 * to act as a DRIFT TRIPWIRE — the ingest function refuses a candidate key that is
 * not byte-identical to its own. The field order below is therefore load-bearing, and
 * the harness asserts it against the SQL.
 *
 * WHY source_version IS IN THE KEY AND payload_hash IS NOT
 *   A provider that reports a NEW source_version has genuinely changed the record:
 *   that is a new observation row, never a collapsed duplicate. A provider that
 *   re-delivers the SAME source_version with a different payload is a conflict, and
 *   a conflict must be visible rather than silently merged — so the payload is
 *   fingerprinted, but the fingerprint deliberately does not decide identity.
 *
 * NO CREDENTIAL EVER PASSES THROUGH THIS MODULE. Payloads are additionally screened
 * with the certified provider metadata guard, so a token smuggled inside provider
 * data is refused before it can reach the observation store.
 */

import { findUnsafeMetadataKeys } from '../providers/vocabulary.ts';
import { EXECUTION_LIMITS } from './executionPolicy.ts';

export const OBSERVATION_OBJECT_TYPES = [
  'account', 'balance', 'transaction', 'journal_entry', 'invoice', 'payment',
  'bill', 'payout', 'contact', 'vendor', 'customer', 'category', 'statement', 'other',
] as const;

export const OBSERVATION_VALUE_KINDS = [
  'amount', 'currency', 'balance', 'quantity', 'rate', 'status', 'date',
  'period', 'description', 'identifier', 'text', 'reference', 'json',
] as const;

/** The canonical key material, in the ONLY order the database will accept. */
export const DEDUP_KEY_FIELDS = [
  'business_id',
  'provider',
  'business_connection_id',
  'object_type',
  'provider_object_id',
  'value_kind',
  'source_version',
] as const;

export const IDENTITY_BOUNDS = {
  MAX_PROVIDER_OBJECT_ID: 256,
  MAX_SOURCE_VERSION: 256,
  MAX_PAYLOAD_BYTES: EXECUTION_LIMITS.MAX_OBSERVATION_PAYLOAD_BYTES,
  MAX_PAYLOAD_DEPTH: 8,
} as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const isPlainObject = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * canonicalizeValue — deterministic, bounded, and free of anything that cannot be
 * represented in jsonb. Object keys are sorted so two logically identical payloads
 * canonicalise identically; undefined members are dropped; non-finite numbers are
 * REFUSED (not coerced) because NaN silently becoming null is exactly the kind of
 * quiet corruption this layer exists to prevent.
 */
export function canonicalizeValue(value: unknown, depth = 0): { ok: boolean; value?: unknown; code?: string } {
  if (depth > IDENTITY_BOUNDS.MAX_PAYLOAD_DEPTH) return { ok: false, code: 'payload_depth_exceeded' };
  if (value === null) return { ok: true, value: null };
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return { ok: true, value };
  if (type === 'number') {
    return Number.isFinite(value as number)
      ? { ok: true, value }
      : { ok: false, code: 'non_finite_number' };
  }
  if (type === 'undefined') return { ok: true, value: undefined };
  if (type === 'bigint' || type === 'function' || type === 'symbol') return { ok: false, code: 'unsupported_value_type' };
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const entry of value) {
      const converted = canonicalizeValue(entry, depth + 1);
      if (!converted.ok) return converted;
      out.push(converted.value === undefined ? null : converted.value);
    }
    return { ok: true, value: out };
  }
  if (!isPlainObject(value)) return { ok: false, code: 'unsupported_object_type' };
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const converted = canonicalizeValue(source[key], depth + 1);
    if (!converted.ok) return converted;
    if (converted.value === undefined) continue;
    out[key] = converted.value;
  }
  return { ok: true, value: out };
}

/**
 * canonicalizePayload — an OBJECT envelope, bounded in bytes. The byte count is
 * measured on the canonical text, which is what the database stores and bounds.
 */
export function canonicalizePayload(payload: unknown): {
  ok: boolean; canonical?: Record<string, unknown>; text?: string; bytes?: number; code?: string;
} {
  if (!isPlainObject(payload)) return { ok: false, code: 'payload_must_be_object' };
  const unsafe = findUnsafeMetadataKeys(payload);
  if (unsafe.length > 0) return { ok: false, code: 'credential_shaped_payload_key' };
  const converted = canonicalizeValue(payload);
  if (!converted.ok) return { ok: false, code: converted.code };
  const canonical = converted.value as Record<string, unknown>;
  const text = JSON.stringify(canonical);
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > IDENTITY_BOUNDS.MAX_PAYLOAD_BYTES) return { ok: false, code: 'payload_too_large' };
  return { ok: true, canonical, text, bytes };
}

/** sha256 hex over UTF-8 bytes. Uses Web Crypto, available in Deno and in Node >= 18. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The key material, joined in DEDUP_KEY_FIELDS order with '|'. */
export function dedupKeyMaterial(parts: {
  business_id: string; provider: string; business_connection_id: string;
  object_type: string; provider_object_id: string; value_kind: string; source_version: string;
}): string {
  return [
    parts.business_id,
    parts.provider,
    parts.business_connection_id,
    parts.object_type,
    parts.provider_object_id,
    parts.value_kind,
    parts.source_version,
  ].join('|');
}

export async function observationDedupKey(parts: Parameters<typeof dedupKeyMaterial>[0]): Promise<string> {
  return sha256Hex(dedupKeyMaterial(parts));
}

const isBoundedText = (value: unknown, max: number): boolean => (
  typeof value === 'string' && value.length >= 1 && value.length <= max && !CONTROL_CHARS.test(value)
);

/** Validate one draft against the closed vocabularies and the bounds. */
export function validateDraft(draft: unknown): { ok: boolean; code?: string; normalized?: any } {
  if (!isPlainObject(draft)) return { ok: false, code: 'draft_must_be_object' };
  const d = draft as Record<string, unknown>;

  const objectType = d.object_type;
  if ((OBSERVATION_OBJECT_TYPES as readonly string[]).indexOf(String(objectType)) === -1) {
    return { ok: false, code: 'unsupported_object_type' };
  }
  const valueKind = d.value_kind;
  if ((OBSERVATION_VALUE_KINDS as readonly string[]).indexOf(String(valueKind)) === -1) {
    return { ok: false, code: 'unsupported_value_kind' };
  }
  if (!isBoundedText(d.provider_object_id, IDENTITY_BOUNDS.MAX_PROVIDER_OBJECT_ID)) {
    return { ok: false, code: 'provider_object_id_out_of_bounds' };
  }
  if (!isBoundedText(d.source_version, IDENTITY_BOUNDS.MAX_SOURCE_VERSION)) {
    return { ok: false, code: 'source_version_out_of_bounds' };
  }

  let sourceUpdatedAt: string | null = null;
  if (d.source_updated_at !== undefined && d.source_updated_at !== null) {
    if (typeof d.source_updated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(d.source_updated_at)) {
      return { ok: false, code: 'source_updated_at_not_iso8601' };
    }
    const parsed = Date.parse(d.source_updated_at);
    if (!Number.isFinite(parsed)) return { ok: false, code: 'source_updated_at_not_iso8601' };
    sourceUpdatedAt = d.source_updated_at;
  }

  const payload = canonicalizePayload(d.payload);
  if (!payload.ok) return { ok: false, code: payload.code };

  return {
    ok: true,
    normalized: {
      object_type: String(objectType),
      provider_object_id: String(d.provider_object_id),
      value_kind: String(valueKind),
      source_version: String(d.source_version),
      source_updated_at: sourceUpdatedAt,
      payload: payload.canonical,
      payload_bytes: payload.bytes,
    },
  };
}

/**
 * buildIngestBatch — the complete, bounded request the worker is allowed to send.
 * Each observation carries the canonical payload and the candidate dedup key (the
 * drift tripwire); payload_hash is deliberately NOT sent, because the database
 * computes it from the stored jsonb.
 *
 * Batch-level failures are returned, never thrown: a page that exceeds a bound is a
 * classification the worker must act on, not an exception it should lose.
 */
export async function buildIngestBatch(input: {
  businessId: string;
  provider: string;
  connectionId: string;
  drafts: unknown[];
}): Promise<{
  ok: boolean; code?: string; observations: any[]; errors: Array<{ index: number; code: string }>; bytes: number; batchDeduplicated: number;
}> {
  const drafts = Array.isArray(input?.drafts) ? input.drafts : [];
  const errors: Array<{ index: number; code: string }> = [];
  const observations: any[] = [];
  const seen = new Set<string>();
  let batchDeduplicated = 0;
  let bytes = 0;

  for (let index = 0; index < drafts.length; index += 1) {
    const validated = validateDraft(drafts[index]);
    if (!validated.ok) {
      errors.push({ index, code: validated.code || 'invalid_draft' });
      continue;
    }
    const normalized = validated.normalized;
    const dedupKey = await observationDedupKey({
      business_id: input.businessId,
      provider: input.provider,
      business_connection_id: input.connectionId,
      object_type: normalized.object_type,
      provider_object_id: normalized.provider_object_id,
      value_kind: normalized.value_kind,
      source_version: normalized.source_version,
    });
    // Within one batch, the same logical observation delivered twice is one write.
    if (seen.has(dedupKey)) {
      batchDeduplicated += 1;
      continue;
    }
    seen.add(dedupKey);
    bytes += normalized.payload_bytes;
    observations.push({ ...normalized, dedup_key: dedupKey });
  }

  // Batches are NOT rejected for size here: a page larger than one ingest unit is
  // normal, and it is split by chunkObservations() so the total is still bounded per
  // chunk. What IS rejected is a page containing something that cannot be stored.
  if (errors.length > 0) return { ok: false, code: 'batch_contains_invalid_observations', observations: [], errors, bytes, batchDeduplicated };
  return { ok: true, observations, errors, bytes, batchDeduplicated };
}

/**
 * chunkObservations — split a page into ingest units bounded by BOTH count and bytes.
 * The last chunk is the one that carries the checkpoint advance, so the cursor can
 * never move ahead of an observation in the same page.
 */
export function chunkObservations(observations: unknown[], limits?: { maxCount?: number; maxBytes?: number }): any[][] {
  const list = Array.isArray(observations) ? observations : [];
  const maxCount = typeof limits?.maxCount === 'number' ? limits.maxCount : EXECUTION_LIMITS.MAX_BATCH_OBSERVATIONS;
  const maxBytes = typeof limits?.maxBytes === 'number' ? limits.maxBytes : EXECUTION_LIMITS.MAX_BATCH_BYTES;
  const chunks: any[][] = [];
  let current: any[] = [];
  let bytes = 0;

  for (const observation of list as any[]) {
    const size = typeof observation?.payload_bytes === 'number'
      ? observation.payload_bytes
      : JSON.stringify(observation?.payload || {}).length;
    if (current.length > 0 && (current.length + 1 > maxCount || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(observation);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}