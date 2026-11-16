// Supabase frontend client — uses anon/public key only (safe for browser)
// Uses plain fetch — no external SDK dependency required on frontend.
// NEVER import or use SUPABASE_SERVICE_ROLE_KEY here.

// Strip any trailing /rest/v1/ path baked into the env var so auth/storage URLs resolve correctly
const _rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_URL = _rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export { SUPABASE_URL, SUPABASE_ANON_KEY };

export function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function anonHeaders(extraHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extraHeaders,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function signInWithEmail(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.message || 'Login failed');
  return data; // { access_token, refresh_token, user, ... }
}

export async function signUpWithEmail(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.message || 'Sign up failed');
  return data;
}

export async function signOut(accessToken) {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: anonHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
}

export async function resetPasswordRequest(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ email }),
  });
  // Always succeed on the frontend regardless
  return res;
}

export async function updatePassword(accessToken, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: anonHeaders({ Authorization: `Bearer ${accessToken}` }),
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to update password');
  return data;
}

export async function getUser(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: anonHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ─── Auth health check (anon) ────────────────────────────────────────────────

export async function checkAnonAuthConnection() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: anonHeaders(),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Database health check (anon) ────────────────────────────────────────────

export async function checkAnonDbConnection() {
  try {
    // Just probe the REST endpoint — a 401 or 200 both mean the DB is reachable
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: anonHeaders(),
    });
    // 200 = ok, 401/403 = reachable but auth issue, both confirm DB is up
    return { ok: res.status < 500, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Test profile ID (placeholder until real auth is wired) ──────────────────
export const TEST_PROFILE_ID = 'test-profile-001';

// ─── Supabase write helpers (anon key — require RLS policies to allow inserts) ─

export async function saveAssessmentSession({ profileId, assessmentType }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assessment_sessions`, {
    method: 'POST',
    headers: { ...anonHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: profileId, assessment_type: assessmentType, started_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`saveAssessmentSession: ${res.status}`);
  return res.json();
}

export async function saveAssessmentAnswers({ sessionId, profileId, assessmentType, answers }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assessment_answers`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ session_id: sessionId, profile_id: profileId, assessment_type: assessmentType, answers }),
  });
  if (!res.ok) throw new Error(`saveAssessmentAnswers: ${res.status}`);
}

export async function saveAssessmentCalculation({ sessionId, profileId, assessmentType, name, inputs, results }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assessment_calculations`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ session_id: sessionId, profile_id: profileId, assessment_type: assessmentType, calculation_name: name, inputs, results }),
  });
  if (!res.ok) throw new Error(`saveAssessmentCalculation: ${res.status}`);
}

export async function saveGapAnalysis({ profileId, sessionId, gapType, score, dollarGap, severity, summary }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/gap_analysis`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ profile_id: profileId, session_id: sessionId, gap_type: gapType, score, dollar_gap: dollarGap, severity, summary }),
  });
  if (!res.ok) throw new Error(`saveGapAnalysis: ${res.status}`);
}

export async function saveProfileFinancials(profileId, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_financials`, {
    method: 'POST',
    headers: { ...anonHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ profile_id: profileId, ...data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`saveProfileFinancials: ${res.status}`);
}

// ─── Storage health check (anon) ─────────────────────────────────────────────

export async function checkAnonStorageConnection() {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      headers: anonHeaders(),
    });
    return { ok: res.status < 500, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}