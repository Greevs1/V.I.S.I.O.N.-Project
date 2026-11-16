/**
 * Galileo Capability Governance — Orchestrator Interface
 * Phase 13.4B.1.5
 *
 * The future Galileo Orchestrator must be able to ask:
 *   - Can this capability execute?
 *   - Should preview be shown?
 *   - Should Quick mode run?
 *   - Should Executive mode run?
 *   - Should another capability be suggested?
 *
 * This interface is built now. No orchestration yet.
 */
import type { ExecutionLevel } from '../types.ts';
import type { OrchestratorContext, OrchestratorDecision } from './types.ts';
import { capabilityRegistry } from '../registry.ts';
import { sessionEngine } from './sessionEngine.ts';
import { isPreviewAvailable } from './preview.ts';
import { isUnlimitedTier } from './tiers.ts';

class OrchestratorInterfaceImpl {
  /**
   * Evaluate a capability request and return a decision.
   *
   * The future Galileo Orchestrator will call this to determine:
   *   1. Can the user execute this capability?
   *   2. Should a preview be shown instead?
   *   3. Should Quick mode run (unlimited, no session)?
   *   4. Should Advisor mode run (consumes session)?
   *   5. Should Executive mode run (unlimited for paid tiers)?
   *   6. Should an alternative capability be suggested?
   */
  evaluate(ctx: OrchestratorContext): OrchestratorDecision {
    const capability = capabilityRegistry.get(ctx.capabilityId);
    if (!capability) {
      return {
        canExecute: false,
        shouldPreview: false,
        shouldQuick: false,
        shouldAdvisor: false,
        shouldExecutive: false,
        reason: 'Capability not found.',
      };
    }

    const governance = capability.governance;
    const canExecute = sessionEngine.canExecuteCapability(
      ctx.profileId,
      ctx.capabilityId,
      ctx.executionLevel,
      { tier: ctx.tier, isAssignedAdvisor: ctx.isAssignedAdvisor }
    );

    // Determine execution level flags
    const shouldQuick = canExecute && ctx.executionLevel === 'quick';
    const shouldAdvisor = canExecute && ctx.executionLevel === 'advisor';
    const shouldExecutive = canExecute && ctx.executionLevel === 'executive';

    // Should preview be shown?
    // Preview is shown when:
    //   - The capability supports preview
    //   - The user cannot execute at the requested level
    //   - The user's tier supports preview
    const shouldPreview =
      !canExecute &&
      isPreviewAvailable(ctx.capabilityId) &&
      governance?.requiresExecutiveSession === true;

    // Suggest alternative?
    let suggestedAlternative: string | undefined;
    if (!canExecute) {
      suggestedAlternative = this.suggestAlternative(ctx);
    }

    // Build soft limit if exhausted
    let softLimit;
    if (!canExecute && governance?.requiresExecutiveSession) {
      const result = sessionEngine.consumeExecutiveSession(
        ctx.profileId,
        ctx.capabilityId,
        ctx.executionLevel,
        { tier: ctx.tier, isAssignedAdvisor: ctx.isAssignedAdvisor }
      );
      softLimit = result.softLimit;
    }

    let reason: string;
    if (canExecute) {
      reason = `Can execute at ${ctx.executionLevel} level.`;
    } else if (shouldPreview) {
      reason = 'Sessions exhausted — show preview.';
    } else {
      reason = 'Cannot execute — sessions exhausted.';
    }

    return {
      canExecute,
      shouldPreview,
      shouldQuick,
      shouldAdvisor,
      shouldExecutive,
      suggestedAlternative,
      reason,
      softLimit,
    };
  }

  canExecute(ctx: OrchestratorContext): boolean {
    return sessionEngine.canExecuteCapability(
      ctx.profileId,
      ctx.capabilityId,
      ctx.executionLevel,
      { tier: ctx.tier, isAssignedAdvisor: ctx.isAssignedAdvisor }
    );
  }

  shouldPreview(ctx: OrchestratorContext): boolean {
    const capability = capabilityRegistry.get(ctx.capabilityId);
    if (!capability) return false;
    const canExecute = this.canExecute(ctx);
    return !canExecute && isPreviewAvailable(ctx.capabilityId);
  }

  shouldQuick(ctx: OrchestratorContext): boolean {
    return this.canExecute(ctx) && ctx.executionLevel === 'quick';
  }

  shouldAdvisor(ctx: OrchestratorContext): boolean {
    return this.canExecute(ctx) && ctx.executionLevel === 'advisor';
  }

  shouldExecutive(ctx: OrchestratorContext): boolean {
    return this.canExecute(ctx) && ctx.executionLevel === 'executive';
  }

  /**
   * Suggest an alternative capability when the user cannot execute.
   *
   * Strategy:
   *   1. If the user can't execute at 'advisor' level, suggest 'quick' level
   *   2. Find a related free capability in the same category
   */
  suggestAlternative(ctx: OrchestratorContext): string | undefined {
    const capability = capabilityRegistry.get(ctx.capabilityId);
    if (!capability) return undefined;

    // If the capability supports quick mode, suggest that
    const governance = capability.governance;
    if (governance?.executionLevels.includes('quick')) {
      return `${ctx.capabilityId} (quick mode)`;
    }

    // Find a related free capability in the same category
    const sameCategory = capabilityRegistry.listByCategory(capability.category);
    const free = sameCategory.find((c) => {
      if (c.id === ctx.capabilityId) return false;
      const g = c.governance;
      return g && !g.requiresExecutiveSession;
    });

    return free?.id;
  }
}

export const orchestratorInterface = new OrchestratorInterfaceImpl();