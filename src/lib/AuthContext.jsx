import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { clearAnonymousSession } from '@/lib/anonymousSession';

// HMR-safe context: persist on globalThis so the context object survives
// Vite hot-module reloads. Without this, HMR recreates the context object
// while the old Provider still holds the previous reference, causing
// "useAuth must be used within AuthProvider".
const AuthContext = globalThis.__AuthContext ??= createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);                     // Base44 user
  const [supabaseProfile, setSupabaseProfile] = useState(null); // Supabase profile row
  const [supabaseBusiness, setSupabaseBusiness] = useState(null); // Supabase business row

  // Phase 1B — Multi-Business Context (frontend-only, sessionStorage-backed)
  const [allBusinesses, setAllBusinesses] = useState([]);
  const [activeContext, setActiveContextState] = useState({
    type: 'business',
    businessId: null,
    businessIds: [],
    initialized: false,
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: { 'X-App-Id': appParams.appId },
        token: appParams.token,
        interceptResponses: true
      });

      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);

        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            // Platform says auth required — treat as unauthenticated guest, never redirect to /login
            setIsAuthenticated(false);
            setAuthChecked(true);
          } else if (reason === 'user_not_registered') {
            setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
          } else {
            setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
          }
        } else {
          // Any other error — still allow guest access, don't redirect
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      // Fetch Supabase profile in background (non-blocking for auth)
      fetchSupabaseProfile();
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      // Never set auth_required as an error — unauthenticated is a valid guest state
    }
  };

  /**
   * Sync Base44 user to Supabase profile (find or create), then load full profile + business.
   * This ensures every Base44 user has a matching Supabase profile with base44_user_id set.
   */
  const fetchSupabaseProfile = async () => {
    setIsLoadingProfile(true);
    try {
      // Step 1: Ensure profile exists and base44_user_id is linked
      await base44.functions.invoke('syncBase44UserToSupabaseProfile', {});
      // Step 2: Load full profile + business (parallel with ownership load)
      const [profileRes] = await Promise.all([
        base44.functions.invoke('supabaseUserData', { action: 'getFullProfile' }),
      ]);
      const profile = profileRes.data?.profile || null;
      const business = profileRes.data?.business || null;
      setSupabaseProfile(profile);
      setSupabaseBusiness(business);

      // Step 3: Load business ownership (non-blocking, parallel-safe)
      await resolveBusinessContext(profile);
    } catch (err) {
      console.warn('Could not load Supabase profile (non-blocking):', err);
      // Mark initialized even on failure so components don't wait forever
      setActiveContextState(prev => ({ ...prev, initialized: true }));
    } finally {
      setIsLoadingProfile(false);
    }
  };

  /**
   * Resolves business ownership from business_owners table and sets activeContext.
   * Falls back to profile.primary_business_id if ownership query fails or returns empty.
   * Restores from sessionStorage if a previously selected context is still valid.
   */
  const resolveBusinessContext = async (profile) => {
    try {
      const profileId = profile?.id;
      const primaryBusinessId = profile?.primary_business_id || null;

      // Query business_owners for all businesses this profile owns
      const ownershipRes = await base44.functions.invoke('supabaseUserData', {
        action: 'getBusinessOwnership',
        profile_id: profileId,
      });

      const owned = ownershipRes.data?.businesses || [];
      setAllBusinesses(owned);

      const businessIds = owned.map(b => b.id);

      // Attempt to restore saved context from sessionStorage
      let restoredBusinessId = null;
      try {
        const saved = sessionStorage.getItem('vision_active_context');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Only restore if the saved businessId is still valid for this profile
          if (parsed.businessId && businessIds.includes(parsed.businessId)) {
            restoredBusinessId = parsed.businessId;
          }
        }
      } catch {}

      // Resolve final businessId: restored → primary_business_id → first owned → null
      const resolvedBusinessId =
        restoredBusinessId ||
        (businessIds.includes(primaryBusinessId) ? primaryBusinessId : null) ||
        businessIds[0] ||
        primaryBusinessId ||
        null;

      const resolved = {
        type: 'business',
        businessId: resolvedBusinessId,
        businessIds,
        initialized: true,
      };

      setActiveContextState(resolved);

      // Persist resolved context to sessionStorage
      try {
        sessionStorage.setItem('vision_active_context', JSON.stringify(resolved));
      } catch {}
    } catch (err) {
      console.warn('Business ownership resolution failed (non-blocking):', err);
      // Fall back to primary_business_id from profile
      const fallback = {
        type: 'business',
        businessId: profile?.primary_business_id || null,
        businessIds: [],
        initialized: true,
      };
      setActiveContextState(fallback);
      try {
        sessionStorage.setItem('vision_active_context', JSON.stringify(fallback));
      } catch {}
    }
  };

  /**
   * Public setter — allows components (future Context Selector) to switch active business.
   * Persists to sessionStorage. Never writes to the database.
   */
  const setActiveContext = (newContext) => {
    const updated = { ...newContext, initialized: true };
    setActiveContextState(updated);
    try {
      sessionStorage.setItem('vision_active_context', JSON.stringify(updated));
    } catch {}
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setSupabaseProfile(null);
    setSupabaseBusiness(null);
    setAllBusinesses([]);
    setActiveContextState({ type: 'business', businessId: null, businessIds: [], initialized: false });
    setIsAuthenticated(false);
    // Clear cached user ID so the next user gets a fresh assessment state
    try { sessionStorage.removeItem('cii_current_user_id'); } catch {}
    // Clear multi-business context on logout
    try { sessionStorage.removeItem('vision_active_context'); } catch {}
    // Rotate the anonymous session so no anonymous data bleeds into the next session
    try { clearAnonymousSession(); } catch {}
    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  /**
   * Derived role from Supabase profile.
   * Falls back to Base44 user role if profile not yet loaded.
   * Possible values: owner | advisor | team_member | super_admin
   */
  const role = supabaseProfile?.role || user?.role || null;
  const onboardingCompleted = supabaseProfile?.onboarding_completed ?? null;

  // Derived: true only when profile has more than one business in business_owners
  const isMultiBusiness = allBusinesses.length > 1;

  return (
    <AuthContext.Provider value={{
      user,
      supabaseProfile,
      supabaseBusiness,
      role,
      onboardingCompleted,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      isLoadingProfile,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      fetchSupabaseProfile,
      // Phase 1B — Multi-Business Context
      activeContext,
      setActiveContext,
      allBusinesses,
      isMultiBusiness,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};