/**
 * Galileo conversation persistence for the Magic Loop.
 *
 * Reuses existing infrastructure — no new tables:
 *   - Anonymous guests: guest_sessions.galileo_events (via guestSessionService)
 *   - Authenticated users (post-promotion): GalileoConversation entity
 *
 * For Phase 1, conversation is held in hook state as the primary source and
 * snapshotted to galileo_events at stage transitions (best-effort). This avoids
 * per-keystroke backend calls while keeping the conversation durable across
 * refreshes within the guest session window.
 */

import { base44 } from '@/api/base44Client';

/**
 * persistGuestConversation — overwrite galileo_events with the current
 * conversation snapshot. Best-effort; race conditions across tabs are an
 * accepted Phase 1 limitation.
 */
export async function persistGuestConversation(guestSessionId, messages) {
  if (!guestSessionId || !messages || messages.length === 0) return;
  try {
    await base44.functions.invoke('guestSessionService', {
      action: 'updateGuestSession',
      data: {
        guest_session_id: guestSessionId,
        updates: {
          galileo_events: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            stage: m.stage || null,
          })),
        },
      },
    });
  } catch {
    // Non-fatal — conversation is also held in local state.
  }
}

/**
 * loadGuestConversation — retrieve any persisted galileo_events on resume.
 */
export async function loadGuestConversation(guestSessionId) {
  if (!guestSessionId) return [];
  try {
    const res = await base44.functions.invoke('guestSessionService', {
      action: 'getGuestSession',
      data: { guest_session_id: guestSessionId },
    });
    const events = res.data?.session?.galileo_events || [];
    return events.map((e) => ({
      role: e.role,
      content: e.content,
      timestamp: e.timestamp,
      stage: e.stage || null,
    }));
  } catch {
    return [];
  }
}

/**
 * normalizeGuestMessages — map the GUEST event format onto the AUTHENTICATED
 * conversation format. The two are not identical.
 *
 * guest_sessions.galileo_events holds every conversation entry, including
 * non-message entries (questions, insights, preservation cards) that carry
 * neither `role` nor `content`. The GalileoConversation entity accepts only
 * role ∈ {user, assistant} with a string content, so those UI-only entries are
 * dropped rather than written as malformed turns.
 *
 * Order is preserved — the guest array is already chronological.
 */
export function normalizeGuestMessages(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter(
      (e) =>
        e &&
        (e.role === 'user' || e.role === 'assistant') &&
        typeof e.content === 'string' &&
        e.content.trim().length > 0
    )
    .map((e) => ({
      role: e.role,
      content: e.content,
      timestamp: e.timestamp || new Date().toISOString(),
    }));
}

/**
 * migrateConversationOnPromotion — carry the guest Magic Loop conversation into
 * the authenticated conversation store after account promotion succeeds.
 *
 * Contract:
 *  - Never creates an authenticated conversation without an explicit business_id.
 *  - Idempotent on the guest session: a promotion retry cannot duplicate the
 *    conversation, because `source_guest_session_id` is the stable promotion
 *    identifier and is looked up before creating.
 *  - Best-effort: the guest conversation row in guest_sessions is never deleted
 *    here, so a failure leaves it intact and recoverable.
 */
export async function migrateConversationOnPromotion(
  events,
  { businessId = null, guestSessionId = null, sessionType = 'magic_loop' } = {}
) {
  // Never persist an authenticated conversation with business_id = null, and
  // never infer the business — the canonical promoted id must be supplied.
  if (!businessId) {
    console.warn(
      '[migrateConversationOnPromotion] refused: no canonical business_id supplied — guest conversation left untouched'
    );
    return null;
  }

  const messages = normalizeGuestMessages(events);
  if (messages.length === 0) return null;

  try {
    // Idempotency — already migrated for this guest session? Return it as-is.
    if (guestSessionId) {
      const found = await base44.entities.GalileoConversation.filter({
        source_guest_session_id: guestSessionId,
      });
      const existing = Array.isArray(found) ? found[0] : found?.items?.[0];
      if (existing) return existing;
    }

    const conversation = await base44.entities.GalileoConversation.create({
      messages,
      questions_used: 0,
      // Phase 6B — explicit tenant scope. A guest conversation is anonymous; the
      // authenticated record MUST carry the promoted business_id.
      business_id: businessId,
      session_type: sessionType,
      source_guest_session_id: guestSessionId,
    });
    return conversation;
  } catch (err) {
    // Non-fatal — promotion already succeeded; the guest conversation is still
    // present in guest_sessions, so nothing is lost by this failure.
    console.warn('[migrateConversationOnPromotion] failed:', err?.message || err);
    return null;
  }
}