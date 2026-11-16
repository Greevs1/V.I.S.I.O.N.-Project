/**
 * VISION — CONNECTED BUSINESS
 * CB-005B — THE SHARED SERVICE-ROLE SUPABASE CLIENT
 *
 * WHY THIS EXISTS
 *   A backend function may import from `base44/shared/`, but it may NOT import a file
 *   that belongs to another function — the function bundler refuses it, and the
 *   deploy fails with "relative imports can't reach outside the function". The client
 *   factory that used to live inside `functions/lib/supabaseClient` was therefore
 *   unreachable from a new function, and copying it would have created the second
 *   implementation that this platform's own documentation warns about in
 *   projectUrl.ts — two clients that drift, and a drift that shows up as PGRST125 on
 *   every query in exactly one of the two paths.
 *
 *   So the factory lives here, in `base44/shared/supabase/`, where any function can
 *   reach it, and it builds its project URL through the ONE canonical normalizer.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It does not log the key, hash the key, or return the key. It reports whether a
 *   key EXISTS and how long it is, which is enough to diagnose a misconfiguration and
 *   not enough to leak one.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeSupabaseProjectUrl } from './projectUrl.ts';

export type ServiceClientResult = {
  client: any;
  logs: string[];
  config: { url: string; keyExists: boolean; urlExists: boolean; keyLength: number };
};

/** The service-role client, or a thrown configuration error — never a half-built client. */
export function createServiceRoleClient(): ServiceClientResult {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); };

  const rawUrl = typeof Deno !== 'undefined' ? Deno.env.get('VITE_SUPABASE_URL') : undefined;
  const serviceKey = typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') : undefined;

  const url = normalizeSupabaseProjectUrl(rawUrl);
  const keyExists = Boolean(serviceKey);
  const urlExists = Boolean(url);

  log(`url_present=${urlExists} key_present=${keyExists}`);
  if (!urlExists || !keyExists) {
    log('configuration_error: missing Supabase URL or service-role key');
    throw new Error('Supabase configuration missing. Check environment variables.');
  }
  if (String(serviceKey).length < 20) {
    log('configuration_error: service-role key is implausibly short');
    throw new Error('Invalid service role key length');
  }

  const client = createClient(url, String(serviceKey), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    client,
    logs,
    config: { url, keyExists, urlExists, keyLength: String(serviceKey).length },
  };
}

/** Environment status without creating a client. Never returns a key value. */
export function getServiceRoleEnvStatus(): { urlExists: boolean; keyExists: boolean; urlCleaned: string | null; keyLength: number } {
  const rawUrl = typeof Deno !== 'undefined' ? Deno.env.get('VITE_SUPABASE_URL') : undefined;
  const serviceKey = typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') : undefined;
  const url = normalizeSupabaseProjectUrl(rawUrl);
  return {
    urlExists: Boolean(url),
    keyExists: Boolean(serviceKey),
    urlCleaned: url || null,
    keyLength: serviceKey ? String(serviceKey).length : 0,
  };
}