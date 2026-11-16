/**
 * useMembership — determines whether the current user has a paid membership.
 * 
 * Access tiers:
 *   'free'    — unauthenticated or no active subscription
 *   'member'  — active paying member
 *   'advisor' — advisor/super_admin role (always full access)
 * 
 * Membership is determined by:
 *   1. Supabase profile.membership_tier or profile.subscription_status
 *   2. Role-based override (super_admin / advisor always = full access)
 *   3. Fallback: 'free'
 */
import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';

export function useMembership() {
  const { user, supabaseProfile, role, isAuthenticated } = useAuth();

  const tier = useMemo(() => {
    // Advisors, admins, and experts always have full access
    if (role === 'super_admin' || role === 'advisor' || role === 'admin' || role === 'expert') return 'advisor';

    // Check Supabase profile membership fields
    const p = supabaseProfile || {};
    const membershipTier = p.membership_tier || p.subscription_tier;
    const subscriptionStatus = p.subscription_status;

    if (membershipTier === 'member' || membershipTier === 'pro' || membershipTier === 'premium') {
      return 'member';
    }
    if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
      return 'member';
    }

    // Authenticated users without a paid tier are still 'free' for gating purposes
    return 'free';
  }, [role, supabaseProfile]);

  const isPaid = tier === 'member' || tier === 'advisor';
  const isAdvisorOrAdmin = tier === 'advisor';

  return { tier, isPaid, isAdvisorOrAdmin };
}