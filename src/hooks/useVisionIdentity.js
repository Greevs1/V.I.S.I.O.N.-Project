/**
 * useVisionIdentity — the authenticated person's display identity.
 *
 * Reads only real profile data. Never invents a name: if nothing is known,
 * firstName is null and the UI falls back to a nameless greeting.
 */

import { useAuth } from '@/lib/AuthContext';

export function useVisionIdentity() {
  const { user, supabaseProfile } = useAuth();

  const profileFull = [supabaseProfile?.first_name, supabaseProfile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const fullName = profileFull || user?.full_name || '';
  const firstName =
    supabaseProfile?.first_name ||
    (fullName ? fullName.split(/\s+/)[0] : null) ||
    (user?.email ? user.email.split('@')[0] : null);

  const initials = fullName
    ? fullName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : null;

  return { firstName, fullName: fullName || null, initials };
}