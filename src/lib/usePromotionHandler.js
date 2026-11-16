/**
 * Promotion Handler Hook
 * 
 * Handles guest session promotion after successful authentication.
 * Detects auth state change and triggers promoteGuestSession.
 * 
 * Usage:
 * - Call usePromotionHandler in EnterpriseJourney after auth is confirmed
 * - Checks sessionStorage for promotion intent
 * - Calls guestSessionService.promoteGuestSession
 * - Clears guest session on success
 * - Handles errors gracefully
 */

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId, clearGuestSession } from '@/lib/anonymousSession';

export function usePromotionHandler({ onPromotionComplete, onPromotionError }) {
  const [isPromoting, setIsPromoting] = useState(false);
  const [promotionResult, setPromotionResult] = useState(null);
  const [promotionError, setPromotionError] = useState(null);

  const promoteGuestSession = useCallback(async () => {
    // Check if promotion is pending
    const shouldPromote = sessionStorage.getItem('vision_promote_guest_session') === 'true';
    const guestSessionId = sessionStorage.getItem('vision_guest_session_id') || getGuestSessionId();

    if (!shouldPromote || !guestSessionId) {
      return null; // No promotion needed
    }

    setIsPromoting(true);
    setPromotionError(null);

    try {
      // Verify auth exists
      const user = await base44.auth.me();
      if (!user) {
        throw new Error('Authentication required for promotion');
      }

      console.log('[PromotionHandler] Starting guest session promotion:', {
        guestSessionId,
        userEmail: user.email,
      });

      // Call promoteGuestSession
      const res = await base44.functions.invoke('guestSessionService', {
        action: 'promoteGuestSession',
        guest_session_id: guestSessionId,
      });

      if (!res.data?.success && !res.data?.already_promoted) {
        throw new Error(res.data?.error || 'Promotion failed');
      }

      const summary = res.data.promotion_summary || res.data;

      console.log('[PromotionHandler] Promotion successful:', {
        businessIds: summary.business_ids?.length || 0,
        assessmentIds: summary.assessment_ids?.length || 0,
        documentIds: summary.document_ids?.length || 0,
        alreadyPromoted: res.data.already_promoted || false,
      });

      // Clear guest session from localStorage only on success
      clearGuestSession();

      // Clear promotion intent
      sessionStorage.removeItem('vision_promote_guest_session');
      sessionStorage.removeItem('vision_guest_session_id');

      setPromotionResult({
        success: true,
        summary,
        alreadyPromoted: res.data.already_promoted || false,
      });

      // Notify parent component
      onPromotionComplete?.(summary);

      return summary;

    } catch (error) {
      console.error('[PromotionHandler] Promotion failed:', error);
      setPromotionError(error.message);
      setPromotionResult({ success: false, error: error.message });

      // Notify parent component
      onPromotionError?.(error.message);

      // DO NOT clear guest session on failure
      // Keep guest_session_id so user can retry
      throw error;

    } finally {
      setIsPromoting(false);
    }
  }, [onPromotionComplete, onPromotionError]);

  // Auto-detect and promote when auth becomes available
  useEffect(() => {
    const checkAndPromote = async () => {
      const shouldPromote = sessionStorage.getItem('vision_promote_guest_session') === 'true';
      
      if (shouldPromote && !isPromoting && !promotionResult) {
        try {
          await promoteGuestSession();
        } catch (error) {
          // Error already handled in promoteGuestSession
        }
      }
    };

    checkAndPromote();
  }, [promoteGuestSession, isPromoting, promotionResult]);

  return {
    isPromoting,
    promotionResult,
    promotionError,
    promoteGuestSession,
    clearPromotionState: () => {
      setPromotionResult(null);
      setPromotionError(null);
    },
  };
}