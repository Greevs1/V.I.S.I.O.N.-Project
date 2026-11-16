/**
 * Safety — Phase 13.4C.1
 *
 * The Executive Intelligence Engine CANNOT:
 *   write, publish, assign, approve, modify, delete.
 *
 * Its only responsibility is deciding.
 *
 * Pure validation. No LLM.
 */
import type { SafetyCheck } from './types.ts';

const FORBIDDEN_ACTIONS = [
  'write', 'publish', 'assign', 'approve', 'modify', 'delete',
  'create', 'update', 'remove', 'execute_write', 'grant_access',
];

const ALLOWED_ACTIONS = [
  'decide', 'recommend', 'assess', 'analyze', 'select', 'plan',
  'read', 'review', 'explain', 'summarize', 'prioritize',
];

export function validateSafety(action: string): SafetyCheck {
  const violations: string[] = [];
  const actionLower = action.toLowerCase();

  for (const forbidden of FORBIDDEN_ACTIONS) {
    if (actionLower.includes(forbidden)) {
      violations.push(`Forbidden action detected: ${forbidden}`);
    }
  }

  const isReadOnly = violations.length === 0;
  const allowedActions = ALLOWED_ACTIONS.filter((a) => actionLower.includes(a));

  return {
    isReadOnly,
    violations,
    allowedActions,
  };
}

export function assertReadOnly(action: string): void {
  const check = validateSafety(action);
  if (!check.isReadOnly) {
    throw new Error(`Safety violation: ${check.violations.join(', ')}`);
  }
}

export function getSafetyPolicy(): { canWrite: boolean; canPublish: boolean; canAssign: boolean; canApprove: boolean; canModify: boolean; canDelete: boolean } {
  return {
    canWrite: false,
    canPublish: false,
    canAssign: false,
    canApprove: false,
    canModify: false,
    canDelete: false,
  };
}