/**
 * Experience Layout Component
 *
 * Chrome-less, full-screen container for the Enterprise Journey™.
 * No sidebar, no navbar, no navigation.
 * Pure black background. Blueprint bar slot at top.
 *
 * Sign In link sits in a dedicated top bar so it never overlaps the Blueprint bar.
 * Journey content area is the overflow-y-auto scroll container — all auto-scroll
 * helpers target this element.
 */

import React from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function ExperienceLayout({ children, blueprintBar, journeyState, assessmentKey }) {
  const { navigateToLogin } = useAuth();

  // Hide Sign In during INTRO — let the video be the first thing users see
  const showSignIn = journeyState !== 'INTRO';

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden flex flex-col">

      {/* ── Top bar: Sign In (hidden during INTRO video) ──────────────── */}
      {showSignIn && (
        <div className="w-full flex justify-end shrink-0 px-6 sm:px-10 pt-3 pb-1 z-50">
          <button
            onClick={navigateToLogin}
            className="text-[13px] font-medium text-white/35 hover:text-white/60 transition-colors duration-200 cursor-pointer"
          >
            Already have an account?{' '}
            <span className="text-[#D4A853] hover:text-[#E8C070] transition-colors duration-200">Sign In</span>
          </button>
        </div>
      )}

      {/* ── Blueprint bar (below Sign In, never overlaps) ─────────────── */}
      {blueprintBar && (
        <div className="w-full flex justify-center shrink-0">
          {blueprintBar}
        </div>
      )}

      {/* ── Journey content — THE overflow-y-auto scroll container ────── */}
      {/* All journeyScroll helpers walk up the DOM to find this element  */}
      <div className="flex-1 overflow-y-auto min-h-0" data-journey-scroll="true">
        <div className="w-full min-h-full max-w-4xl mx-auto px-4 sm:px-8 py-6 pb-16 flex flex-col justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}