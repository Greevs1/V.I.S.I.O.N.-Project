/**
 * Galileo Capability Framework — Permission Model
 * Phase 13.4B.1
 *
 * Capabilities declare permission requirements. The framework enforces
 * permissions — never the LLM.
 *
 * Permission levels:
 *   read             — Read-only, no writes
 *   draft            — Can create drafts (not published)
 *   confirmed_write  — Requires explicit confirmation before writing
 *   prohibited       — Not allowed for this context/role
 *
 * The framework checks:
 *   1. Is the capability prohibited for this role?
 *   2. Does the user's role support the capability's required permission?
 *   3. Does the execution mode match the allowed permission?
 */
import type {
  CapabilityMetadata,
  CapabilityExecutionContext,
  PermissionLevel,
  ExecutionMode,
} from './types.ts';

export interface PermissionValidationResult {
  valid: boolean;
  reason?: string;
  requiredLevel?: PermissionLevel;
  userLevel?: PermissionLevel;
}

/**
 * Role → permission level mapping.
 * Platform-agnostic: roles are strings, not hardcoded to any domain.
 * Future domains add their roles here without changing the framework.
 */
const ROLE_PERMISSION_MAP: Record<string, PermissionLevel[]> = {
  super_admin: ['read', 'draft', 'confirmed_write'],
  admin: ['read', 'draft', 'confirmed_write'],
  advisor: ['read', 'draft', 'confirmed_write'],
  team_member: ['read', 'draft'],
  owner: ['read'],
  viewer: ['read'],
  guest: ['read'],
};

/**
 * Execution mode → required permission level.
 * Ensures a 'draft' mode capability can't execute without draft permission.
 */
const MODE_PERMISSION_MAP: Record<ExecutionMode, PermissionLevel> = {
  read: 'read',
  draft: 'draft',
  review: 'read',
  recommend: 'read',
  confirm: 'confirmed_write',
  execute: 'confirmed_write',
};

export function getUserPermissionLevels(role: string): PermissionLevel[] {
  return ROLE_PERMISSION_MAP[role] || ['read'];
}

export function validatePermissions(
  capability: CapabilityMetadata,
  input: CapabilityExecutionContext
): PermissionValidationResult {
  // Check 1: Is the capability prohibited for this role?
  if (capability.requiredPermissions.includes('prohibited')) {
    return {
      valid: false,
      reason: `Capability "${capability.id}" is prohibited`,
      requiredLevel: 'prohibited',
    };
  }

  // Check 2: Does the user's role support the capability?
  if (!capability.supportedRoles.includes(input.userRole)) {
    return {
      valid: false,
      reason: `Role "${input.userRole}" is not supported by capability "${capability.id}"`,
    };
  }

  // Check 3: Does the user have the required permission level?
  const userLevels = getUserPermissionLevels(input.userRole);
  const requiredLevel = MODE_PERMISSION_MAP[input.executionMode];

  if (!userLevels.includes(requiredLevel)) {
    return {
      valid: false,
      reason: `Role "${input.userRole}" lacks "${requiredLevel}" permission for mode "${input.executionMode}"`,
      requiredLevel,
      userLevel: userLevels[0],
    };
  }

  // Check 4: Does the capability allow this execution mode's permission?
  if (!capability.requiredPermissions.includes(requiredLevel)) {
    // Capabilities can allow read even if they also support draft
    const hasRead = capability.requiredPermissions.includes('read');
    if (requiredLevel === 'read' && hasRead) {
      return { valid: true };
    }
    return {
      valid: false,
      reason: `Capability "${capability.id}" does not allow "${requiredLevel}" permission`,
      requiredLevel,
    };
  }

  return { valid: true };
}

export function canExecute(
  capability: CapabilityMetadata,
  role: string,
  mode: ExecutionMode
): boolean {
  const userLevels = getUserPermissionLevels(role);
  const requiredLevel = MODE_PERMISSION_MAP[mode];
  return (
    capability.supportedRoles.includes(role) &&
    !capability.requiredPermissions.includes('prohibited') &&
    userLevels.includes(requiredLevel) &&
    capability.requiredPermissions.includes(requiredLevel)
  );
}