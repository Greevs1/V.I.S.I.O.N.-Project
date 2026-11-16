/**
 * Magic Loop analytics — thin wrapper over the existing base44.analytics SDK.
 *
 * Tracks the Phase 1 funnel. No new analytics platform. No sensitive
 * document contents are logged — only funnel context and identifiers.
 */

import { base44 } from '@/api/base44Client';

const EVENT_NAMES = {
  GUEST_STARTED: 'galileo_guest_started',
  CONTEXT_SELECTED: 'context_selected',
  INTENT_SELECTED: 'intent_selected',
  FIRST_QUESTION_ANSWERED: 'first_question_answered',
  PRELIMINARY_MODEL_CREATED: 'preliminary_business_model_created',
  FIRST_INSIGHT_SHOWN: 'first_insight_shown',
  INVESTIGATE_SELECTED: 'investigate_selected',
  CONNECT_BUSINESS_SHOWN: 'connect_business_shown',
  DOCUMENT_UPLOAD_STARTED: 'document_upload_started',
  DOCUMENT_UPLOADED: 'document_uploaded',
  DOCUMENT_ANALYSIS_COMPLETED: 'document_analysis_completed',
  BUSINESS_MODEL_UPDATED: 'business_model_updated',
  OPPORTUNITY_SHOWN: 'opportunity_shown',
  SHOW_ME_WHY_SELECTED: 'show_me_why_selected',
  STRATEGY_EXPLORED: 'strategy_explored',
  GUIDE_ME_SELECTED: 'guide_me_selected',
  EXPERT_SELECTED: 'expert_selected',
  SAVE_BUSINESS_SHOWN: 'save_business_shown',
  SAVE_BUSINESS_CLICKED: 'save_business_clicked',
  ACCOUNT_PROMOTION_STARTED: 'account_promotion_started',
  ACCOUNT_CREATED: 'account_created',
  MAGIC_LOOP_COMPLETED: 'magic_loop_completed',
};

/**
 * track — emit a Magic Loop funnel event.
 *
 * @param {string} eventName — one of EVENT_NAMES
 * @param {object} properties — non-sensitive funnel context
 * @param {string|null} guestSessionId — anonymous identifier
 * @param {string|null} userId — authenticated identifier (post-promotion)
 */
export function trackMagicLoop(eventName, properties = {}, guestSessionId = null, userId = null) {
  try {
    base44.analytics.track({
      eventName,
      properties: {
        ...properties,
        guest_session_id: guestSessionId || undefined,
        user_id: userId || undefined,
        source: 'galileo_magic_loop',
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-fatal — analytics must never break the experience.
  }
}

export { EVENT_NAMES };