/**
 * JourneySignupScreen
 *
 * Dedicated signup screen shown when a guest completes the Enterprise Journey.
 * Route: /journey-signup
 *
 * Fields: Full Name, Email, Username, Password
 * Flow:
 *   1. Register (email + password)
 *   2. OTP verification
 *   3. updateMe (full_name) + try to store username via supabaseProfileData
 *   4. promoteGuestSession → only then redirect to /galileo
 *   If promotion fails: stay on page, show retry. Never silently redirect.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { getGuestSessionId, clearGuestSession } from '@/lib/anonymousSession';
import { promoteSavedItemsToSession } from '@/lib/galileo/saveManager';
import { loadGuestConversation, migrateConversationOnPromotion } from '@/lib/galileo/magicLoopConversation';

export default function JourneySignup() {
  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  // OTP step
  const [showOtp, setShowOtp]       = useState(false);
  const [otpCode, setOtpCode]       = useState('');

  // Promotion step (shown after OTP success if promotion fails)
  const [showPromotionFailure, setShowPromotionFailure] = useState(false);
  const [promotionRetrying, setPromotionRetrying]       = useState(false);

  // ── Step 1: Register ────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setShowOtp(true);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: OTP + Promotion ─────────────────────────────────────────────────
  const handleVerify = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }

      // Store full name
      if (fullName.trim()) {
        try {
          await base44.auth.updateMe({ full_name: fullName.trim() });
        } catch (nameErr) {
          console.warn('[JourneySignup] updateMe full_name failed (non-fatal):', nameErr.message);
        }
      }

      // Store username — best-effort, non-blocking
      if (username.trim()) {
        try {
          await base44.functions.invoke('supabaseProfileData', {
            action: 'upsertField',
            data: { username: username.trim().toLowerCase().replace(/\s+/g, '_') },
          });
        } catch (unErr) {
          console.warn('[JourneySignup] username storage failed (non-fatal):', unErr.message);
        }
      }

      // Promote guest session — required before redirect
      await runPromotion();
    } catch (err) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  // ── Promotion logic (separated so retry can call it too) ────────────────────
  const runPromotion = async () => {
    const guestSessionId = sessionStorage.getItem('vision_guest_session_id') || getGuestSessionId();

    if (!guestSessionId) {
      // No session to promote — go straight to Galileo
      window.location.href = '/galileo';
      return;
    }

    // Read the guest Galileo conversation BEFORE promotion. getGuestSession
    // returns a null session once status flips to 'promoted', so the guest
    // conversation is only reachable while the session is still active. Reading
    // (never clearing) preserves it until promotion has succeeded.
    const guestConversation = await loadGuestConversation(guestSessionId);

    try {
      const res = await base44.functions.invoke('guestSessionService', {
        action: 'promoteGuestSession',
        data: { guest_session_id: guestSessionId },
      });

      const promoSuccess = res.data?.promotion_summary?.success || res.data?.already_promoted;
      if (promoSuccess) {
        // The canonical promoted business, from the promotion result itself —
        // never inferred from the profile.
        const promotedBusinessId = res.data?.promotion_summary?.business_ids?.[0] || null;

        // Reassociate the guest's saved items with the business promotion created,
        // so the unscoped guest store cannot remain the long-term source for an
        // authenticated multi-business user.
        promoteSavedItemsToSession(guestSessionId, promotedBusinessId);

        // Continue the conversation inside the authenticated store, scoped to the
        // promoted business. Runs BEFORE any guest client state is retired, so the
        // guest conversation is never cleared ahead of authenticated persistence.
        // Best-effort — a failure here must not dead-end the user, and the guest
        // conversation row survives either way.
        await migrateConversationOnPromotion(guestConversation, {
          businessId: promotedBusinessId,
          guestSessionId,
        });
        // ── Hydrate dashboard from journey answers ────────────────────────────
        // BLOCKING: do not redirect until hydration succeeds.
        // Inline answers (sessionStorage) are sent as primary source.
        // guest_session_id is also sent so the backend can merge from Supabase.
        const guestAnswers = (() => {
          try { return JSON.parse(sessionStorage.getItem('vision_journey_assessments') || '{}'); } catch { return {}; }
        })();
        const hasInlineAnswers = Object.keys(guestAnswers).length > 0;

        // If no answers anywhere, skip hydration and go to Galileo
        if (!hasInlineAnswers) {
          clearGuestSession();
          sessionStorage.removeItem('vision_promote_guest_session');
          sessionStorage.removeItem('vision_guest_session_id');
          sessionStorage.removeItem('vision_journey_assessments');
          window.location.href = '/galileo';
          return;
        }

        const hydrateRes = await base44.functions.invoke('hydrateDashboardFromJourney', {
          guest_session_id: guestSessionId,
          assessment_answers: guestAnswers,
        });

        if (!hydrateRes.data?.success) {
          // Hydration failed — show retry, preserve session data
          console.warn('[JourneySignup] hydration returned non-success:', hydrateRes.data);
          setShowPromotionFailure(true);
          return;
        }

        // Hydration succeeded — clear guest session and redirect
        clearGuestSession();
        sessionStorage.removeItem('vision_promote_guest_session');
        sessionStorage.removeItem('vision_guest_session_id');
        sessionStorage.removeItem('vision_journey_assessments');

        window.location.href = '/galileo';
      } else {
        // Unexpected non-success result — treat as failure
        console.warn('[JourneySignup] promoteGuestSession returned non-success:', res.data);
        setShowPromotionFailure(true);
      }
    } catch (promoErr) {
      console.error('[JourneySignup] promoteGuestSession failed:', promoErr.message);
      // Stay on page — show retry UI
      setShowPromotionFailure(true);
    }
  };

  const handleRetryPromotion = async () => {
    setPromotionRetrying(true);
    setShowPromotionFailure(false);
    try {
      await runPromotion();
    } finally {
      setPromotionRetrying(false);
    }
  };

  const handleSkipPromotion = () => {
    // Warn user, then let them in without promotion
    const confirmed = window.confirm(
      'Continue without saving this Blueprint?\n\nYour analysis data will not be transferred to your new account.'
    );
    if (confirmed) {
      window.location.href = '/galileo';
    }
  };

  const handleResend = async () => {
    setError('');
    try {
      await base44.auth.resendOtp(email);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    }
  };

  // ── Promotion Failure Screen ─────────────────────────────────────────────────
  if (showPromotionFailure) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6">
        <div className="mb-10 text-center">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 mb-2">V.I.S.I.O.N. Platform™</p>
          <div className="w-8 h-px bg-[#D4A853]/40 mx-auto" />
        </div>

        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold text-white">Almost there</h1>
            <p className="text-white/55 text-sm leading-relaxed">
              Your account was created, but I need one more moment to save your Blueprint.
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-400/90">
            Your Blueprint data is preserved. Tap below to finish saving it.
          </div>

          <div className="space-y-3 pt-2">
            <Button
              onClick={handleRetryPromotion}
              disabled={promotionRetrying}
              className="w-full h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90"
            >
              {promotionRetrying
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving Blueprint...</>
                : 'Try Saving Again'}
            </Button>

            <button
              onClick={handleSkipPromotion}
              className="w-full text-white/35 text-xs hover:text-white/55 transition-colors py-2"
            >
              Continue without saving this Blueprint
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── OTP Step ─────────────────────────────────────────────────────────────────
  if (showOtp) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6">
        <div className="mb-10 text-center">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 mb-2">V.I.S.I.O.N. Platform™</p>
          <div className="w-8 h-px bg-[#D4A853]/40 mx-auto" />
        </div>

        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-display font-bold text-white">Check your email</h1>
            <p className="text-white/50 text-sm">
              We sent a 6-digit code to <strong className="text-white/80">{email}</strong>
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-[#D4A853]/80">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving your Blueprint...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={otpCode}
              onChange={setOtpCode}
              autoFocus
              autoComplete="one-time-code"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            onClick={handleVerify}
            disabled={loading || otpCode.length < 6}
            className="w-full h-12 bg-[#D4A853] text-black font-semibold hover:bg-[#D4A853]/90"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {loading ? 'Saving Blueprint...' : 'Save My Blueprint'}
          </Button>

          <p className="text-white/35 text-xs">
            Didn't receive it?{' '}
            <button
              onClick={handleResend}
              className="text-[#D4A853]/70 hover:text-[#D4A853] underline-offset-2 hover:underline"
            >
              Resend code
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Registration Step ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 overflow-y-auto py-12">
      {/* Brand mark */}
      <div className="mb-10 text-center">
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 mb-2">V.I.S.I.O.N. Platform™</p>
        <div className="w-8 h-px bg-[#D4A853]/40 mx-auto" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        {/* Headline */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-display font-bold text-white">Save Your Enterprise Blueprint</h1>
          <p className="text-white/55 text-sm leading-relaxed">
            Create your free account so Galileo can save everything we've built and continue guiding you.
            We'll send a quick verification code after this.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-white/60 text-xs">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              autoFocus
              autoComplete="name"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[#D4A853]/60"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white/60 text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[#D4A853]/60"
            />
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-white/60 text-xs">Username</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="janesmith"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[#D4A853]/60"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-white/60 text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[#D4A853]/60"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#D4A853] text-black font-semibold text-base hover:bg-[#D4A853]/90 mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {loading ? 'Creating account...' : 'Save My Blueprint'}
          </Button>
        </form>

        <p className="text-center text-white/35 text-xs pt-2">
          Already have an account?{' '}
          <Link to="/login" className="text-[#D4A853]/70 hover:text-[#D4A853] underline-offset-2 hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}