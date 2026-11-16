/**
 * VISION 6D.0b.2.1 — THE ONE SUPABASE PROJECT-URL NORMALIZER.
 *
 * WHY THIS EXISTS (proven in production, not hypothesised)
 *
 * `VITE_SUPABASE_URL` is stored in this workspace WITH an API path and a trailing
 * slash — e.g. `https://<project>.supabase.co/rest/v1/`. A client built from that
 * raw value asks for `.../rest/v1/rest/v1/...`, and PostgREST answers PGRST125
 * "Invalid path specified in request URL" for EVERY query.
 *
 * That is exactly how the 6D.0b.2 production acceptance test failed:
 *   upload normalized the value  → its client worked (the document WAS stored)
 *   the durable worker did not   → its very first canonical read was rejected
 *   the worker then read that rejection as "the document does not exist" and
 *   recorded the job terminal with zero attempts.
 *
 * TWO implementations is how those two paths drifted. There is now ONE: every
 * backend Supabase client on the canonical ingestion path builds its project URL
 * through this function, so the two cannot disagree again.
 *
 * SCOPE: only a known Supabase API path segment (and anything after it) and
 * trailing slashes are removed. Nothing else in the URL is touched — no scheme
 * rewriting, no host guessing, no hardcoded project, no credential handling.
 *
 *   https://project.supabase.co            → https://project.supabase.co
 *   https://project.supabase.co/           → https://project.supabase.co
 *   https://project.supabase.co/rest/v1    → https://project.supabase.co
 *   https://project.supabase.co/rest/v1/   → https://project.supabase.co
 */

const API_PATH_SEGMENT = /\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/;

export function normalizeSupabaseProjectUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return raw.replace(API_PATH_SEGMENT, '').replace(/\/+$/, '');
}