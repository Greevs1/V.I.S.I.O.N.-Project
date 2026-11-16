/**
 * Anonymous Session Storage Utility
 * Manages guest_session_id in localStorage for pre-auth experience.
 * All guest data is stored server-side in guest_sessions table via backend functions.
 * 
 * BACKWARD COMPATIBILITY LAYER:
 * This file provides both new Guest Session APIs and legacy Anonymous Session aliases
 * to ensure existing code continues to work without modification.
 */

const GUEST_SESSION_ID_KEY = 'vision_guest_session_id';

/**
 * Generate a UUID v4 for guest session
 */
const generateGuestSessionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ============================================================================
// NEW GUEST SESSION APIs (PREFERRED)
// ============================================================================

/**
 * Get or create guest_session_id in localStorage
 * @returns {string} guest_session_id
 */
export const getGuestSessionId = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  
  let sessionId = localStorage.getItem(GUEST_SESSION_ID_KEY);
  
  if (!sessionId) {
    sessionId = generateGuestSessionId();
    localStorage.setItem(GUEST_SESSION_ID_KEY, sessionId);
  }
  
  return sessionId;
};

/**
 * Clear guest session from localStorage (called after successful promotion)
 */
export const clearGuestSession = () => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(GUEST_SESSION_ID_KEY);
};

/**
 * Check if guest session exists
 * @returns {boolean}
 */
export const hasGuestSession = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!localStorage.getItem(GUEST_SESSION_ID_KEY);
};

// ============================================================================
// LEGACY ALIASES FOR BACKWARD COMPATIBILITY
// All functions below are deprecated but maintained for existing code.
// Migration logic is now handled server-side by guestSessionService.
// ============================================================================

// Direct aliases (1:1 mapping)
export const getAnonymousSessionId = getGuestSessionId;
export const createAnonymousSessionId = generateGuestSessionId;
export const clearAnonymousSession = clearGuestSession;
export const hasAnonymousData = hasGuestSession;

// No-op functions (behavior moved to guestSessionService backend)
export const migrateAnonymousData = async () => {
  return { success: true, migrated: false, message: 'Handled by guestSessionService' };
};

export const saveAnonymousDocumentMeta = () => {
  return { success: true, saved: false, message: 'Handled by guestSessionService' };
};

export const saveAnonymousAssessment = () => {
  return { success: true, saved: false, message: 'Handled by guestSessionService' };
};

export const saveAnonymousBusiness = () => {
  return { success: true, saved: false, message: 'Handled by guestSessionService' };
};

export const getAnonymousData = () => {
  return null;
};

export const updateAnonymousData = async () => {
  return { success: true, updated: false, message: 'Handled by guestSessionService' };
};

export const saveAnonymousProgress = async () => {
  return { success: true, saved: false, message: 'Handled by guestSessionService' };
};