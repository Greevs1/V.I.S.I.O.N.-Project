/**
 * Account Promotion Scene
 * 
 * Elegant save-progress moment after guided assessments.
 * Invites visitor to create free account to preserve their work.
 * 
 * Design:
 * - Black background, white text, warm gold accents
 * - Minimalist, advisory tone (no hard sales language)
 * - No pricing, no trial language, no aggressive signup wall
 * 
 * Behavior:
 * - "Create Free Account": launches auth flow, then promotes guest session
 * - "Continue Without Saving": keeps guest session active, no auth created
 * - Error handling: if promotion fails, preserve guest session and show retry option
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId, clearGuestSession } from '@/lib/anonymousSession';
import { promoteSavedItemsToSession } from '@/lib/galileo/saveManager';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

const HEADLINE = "Excellent. I've finished building your Enterprise Blueprint.";
const SUPPORTING_COPY = "I'm ready to generate your first strategic recommendations. Create your free account so I can save everything we've built together and continue guiding you.";
const SECONDARY_NOTE = "Your Blueprint will remain available for a limited time if you continue as a guest.";

export default function AccountPromotionScene({ onComplete, onSkip }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [isPromoting, setIsPromoting] = useState(false);
  const [promotionError, setPromotionError] = useState(null);
  const [showRetry, setShowRetry] = useState(false);
  const [hasCheckedPromotion, setHasCheckedPromotion] = useState(false);

  // Detect when user returns after authentication
  useEffect(() => {
    const checkPromotion = async () => {
      if (isLoadingAuth) return;
      if (hasCheckedPromotion) return;

      const shouldPromote = sessionStorage.getItem('vision_promote_guest_session') === 'true';
      const guestSessionId = sessionStorage.getItem('vision_guest_session_id') || getGuestSessionId();

      if (isAuthenticated && shouldPromote && guestSessionId && !hasCheckedPromotion) {
        setHasCheckedPromotion(true);
        await handlePromoteGuestSession(guestSessionId);
      }
    };

    checkPromotion();
  }, [isAuthenticated, isLoadingAuth, hasCheckedPromotion]);

  const handlePromoteGuestSession = async (guestSessionId) => {
    setIsPromoting(true);
    setPromotionError(null);

    try {
      const res = await base44.functions.invoke('guestSessionService', {
        action: 'promoteGuestSession',
        guest_session_id: guestSessionId,
      });

      if (res.data?.success || res.data?.already_promoted) {
        // Reassociate the guest's saved items with the business promotion created
        // before the guest store is retired.
        promoteSavedItemsToSession(
          guestSessionId,
          res.data?.promotion_summary?.business_ids?.[0] || null
        );
        // Clear guest session from localStorage
        clearGuestSession();
        // Clear promotion intent from sessionStorage
        sessionStorage.removeItem('vision_promote_guest_session');
        sessionStorage.removeItem('vision_guest_session_id');
        
        // Transition to dashboard
        onComplete?.();
      } else {
        throw new Error(res.data?.error || 'Promotion failed');
      }
    } catch (error) {
      console.error('Failed to promote guest session:', error);
      setPromotionError('Your account was created, but I need a moment to finish saving your progress.');
      setShowRetry(true);
      // Do NOT clear guest session - keep it for retry
    } finally {
      setIsPromoting(false);
    }
  };

  const handleCreateAccount = async () => {
    setIsPromoting(true);
    setPromotionError(null);
    setShowRetry(false);

    try {
      const guestSessionId = getGuestSessionId();

      if (!guestSessionId) {
        throw new Error('No guest session found. Please start over.');
      }

      // Store intent in sessionStorage to trigger promotion after auth
      sessionStorage.setItem('vision_promote_guest_session', 'true');
      sessionStorage.setItem('vision_guest_session_id', guestSessionId);

      // Store promotion intent, then redirect to the Journey-specific signup screen
      window.location.href = '/journey-signup';
      
    } catch (error) {
      console.error('Failed to initiate account creation:', error);
      setPromotionError('Failed to start account creation. Please try again.');
      setShowRetry(true);
      setIsPromoting(false);
    }
  };

  const handleContinueWithoutSaving = () => {
    // Keep guest session active
    // Transition to dashboard placeholder (or results preview)
    onSkip?.();
  };

  const handleRetry = () => {
    setShowRetry(false);
    const guestSessionId = sessionStorage.getItem('vision_guest_session_id') || getGuestSessionId();
    if (guestSessionId && isAuthenticated) {
      handlePromoteGuestSession(guestSessionId);
    } else {
      handleCreateAccount();
    }
  };

  // Show loading while checking auth state
  if (isLoadingAuth && !hasCheckedPromotion) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-6 h-6 border-2 border-[#D4A853]/30 border-t-[#D4A853] rounded-full animate-spin mx-auto" />
          <p className="text-white/60 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-lg space-y-8"
      >
        {/* Header */}
        <div className="space-y-4 text-center">
          <h2 className="text-4xl font-display font-bold text-white tracking-tight">
            {HEADLINE}
          </h2>
          <p className="text-white/70 font-light text-lg leading-relaxed">
            {SUPPORTING_COPY}
          </p>
        </div>

        {/* Error Message (if promotion failed) */}
        {promotionError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-4"
          >
            <p className="text-sm text-red-400 text-center">
              {promotionError}
            </p>
          </motion.div>
        )}

        {/* Actions */}
        <div className="space-y-4 pt-4">
          {!showRetry ? (
            <>
              <Button
                onClick={handleCreateAccount}
                disabled={isPromoting}
                className="w-full h-14 bg-[#D4A853] text-black font-semibold text-lg hover:bg-[#D4A853]/90 transition-colors"
              >
                {isPromoting ? 'Creating Account...' : 'Create Free Account'}
              </Button>

              <Button
                onClick={handleContinueWithoutSaving}
                variant="ghost"
                disabled={isPromoting}
                className="w-full h-12 text-white/60 hover:text-white text-base"
              >
                Continue as Guest
              </Button>
            </>
          ) : (
            <Button
              onClick={handleRetry}
              disabled={isPromoting}
              className="w-full h-14 bg-[#D4A853] text-black font-semibold text-lg hover:bg-[#D4A853]/90 transition-colors"
            >
              {isAuthenticated ? 'Try Again' : 'Create Account & Retry'}
            </Button>
          )}

          {/* Secondary Note */}
          <p className="text-xs text-white/40 text-center pt-4">
            {SECONDARY_NOTE}
          </p>
        </div>
      </motion.div>
    </div>
  );
}