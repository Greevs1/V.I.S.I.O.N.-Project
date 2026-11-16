/**
 * Galileo Capability Governance — Executive Session Engine
 * Phase 13.4B.1.5
 *
 * The reusable Executive Session service.
 *
 * Functions:
 *   - canExecuteCapability()
 *   - consumeExecutiveSession()
 *   - refundExecutiveSession()
 *   - grantExecutiveSession()
 *   - previewCapability()
 *   - trackCapabilityUsage()
 *
 * No payment integration. No Stripe. No billing. Framework only.
 *
 * Executive Sessions are consumed ONLY when advanced reasoning occurs.
 * Simple conversations never consume sessions.
 */
import type { ExecutionLevel, MembershipTier } from '../types.ts';
import type {
  CapabilityPreview,
  SessionTransaction,
  SoftLimitResponse,
  UsageOutcome,
} from './types.ts';
import { capabilityRegistry } from '../registry.ts';
import { sessionAccounting, generateTxnId } from './accounting.ts';
import { isUnlimitedTier } from './tiers.ts';
import { buildPreview } from './preview.ts';
import { governanceAnalytics } from './analytics.ts';

export interface SessionExecutionContext {
  tier: MembershipTier;
  isAssignedAdvisor: boolean;
  businessId?: string;
  valuationId?: string;
}

export interface ConsumeResult {
  consumed: boolean;
  transaction?: SessionTransaction;
  softLimit?: SoftLimitResponse;
}

function buildSoftLimitResponse(
  capabilityId: string,
  executionLevel: ExecutionLevel
): SoftLimitResponse {
  return {
    capabilityId,
    executionLevel,
    message:
      "I've identified another opportunity. A full Executive Session is required to continue this analysis.",
    finding:
      'Galileo has identified potential opportunities that require deeper analysis.',
    options: [
      {
        key: 'save_for_later',
        label: 'Save for Later',
        description: 'Save this analysis for when you have sessions available.',
      },
      {
        key: 'upgrade',
        label: 'Upgrade',
        description: 'Upgrade your tier for more Executive Sessions.',
      },
      {
        key: 'notify_advisor',
        label: 'Notify Advisor',
        description: 'Ask your advisor to run this analysis.',
      },
      {
        key: 'continue_quick',
        label: 'Continue with Quick Explanation',
        description: 'Get a quick explanation without strategic reasoning.',
      },
    ],
  };
}

class SessionEngineImpl {
  /**
   * Can this user execute this capability at this execution level?
   *
   * Rules:
   *   1. Free capabilities → always true
   *   2. Quick mode → always unlimited
   *   3. Unlimited tiers (advisor, enterprise) → always true
   *   4. Assigned advisors → always true
   *   5. Otherwise → check remaining sessions
   */
  canExecuteCapability(
    profileId: string,
    capabilityId: string,
    executionLevel: ExecutionLevel,
    context: SessionExecutionContext
  ): boolean {
    const capability = capabilityRegistry.get(capabilityId);
    if (!capability) return false;

    const governance = capability.governance;
    if (!governance) return true; // No governance = free

    // Free capabilities are always available
    if (!governance.requiresExecutiveSession) return true;

    // Quick mode is always unlimited
    if (executionLevel === 'quick') return true;

    // Unlimited tiers
    if (isUnlimitedTier(context.tier)) return true;

    // Assigned advisors are unlimited
    if (context.isAssignedAdvisor) return true;

    // Check remaining sessions
    const account = sessionAccounting.getOrCreateAccount(profileId, context.tier);
    if (account.remaining === -1) return true; // Unlimited
    return account.remaining > 0;
  }

  /**
   * Consume an Executive Session.
   *
   * Returns:
   *   - consumed: true if a session was consumed
   *   - transaction: the recorded transaction
   *   - softLimit: if sessions are exhausted, the graceful response
   */
  consumeExecutiveSession(
    profileId: string,
    capabilityId: string,
    executionLevel: ExecutionLevel,
    context: SessionExecutionContext
  ): ConsumeResult {
    // Track the request
    governanceAnalytics.trackCapabilityRequest(profileId, capabilityId);

    // Check if can execute
    if (!this.canExecuteCapability(profileId, capabilityId, executionLevel, context)) {
      return {
        consumed: false,
        softLimit: buildSoftLimitResponse(capabilityId, executionLevel),
      };
    }

    const capability = capabilityRegistry.get(capabilityId);
    const governance = capability?.governance;

    // Don't consume for free capabilities
    if (!governance?.requiresExecutiveSession) {
      return { consumed: false };
    }

    // Don't consume for quick mode
    if (executionLevel === 'quick') {
      return { consumed: false };
    }

    // Don't consume for unlimited tiers or assigned advisors
    if (isUnlimitedTier(context.tier) || context.isAssignedAdvisor) {
      const transaction: SessionTransaction = {
        id: generateTxnId(),
        profileId,
        type: 'consumed',
        amount: 0,
        capabilityId,
        executionLevel,
        reason: 'Unlimited tier — no session consumed',
        timestamp: new Date().toISOString(),
      };
      sessionAccounting.recordTransaction(transaction);
      return { consumed: false, transaction };
    }

    // Consume 1 session
    const cost = governance.estimatedSessionCost || 1;
    const transaction: SessionTransaction = {
      id: generateTxnId(),
      profileId,
      type: 'consumed',
      amount: cost,
      capabilityId,
      executionLevel,
      reason: `Executive Session consumed for ${capability?.title}`,
      timestamp: new Date().toISOString(),
    };
    sessionAccounting.recordTransaction(transaction);
    governanceAnalytics.trackSessionConsumed(profileId, capabilityId);

    return { consumed: true, transaction };
  }

  /**
   * Refund an Executive Session.
   */
  refundExecutiveSession(
    profileId: string,
    transactionId: string,
    reason: string
  ): SessionTransaction | undefined {
    const transactions = sessionAccounting.getTransactions(profileId);
    const original = transactions.find((t) => t.id === transactionId);
    if (!original || original.type !== 'consumed') return undefined;

    const refund: SessionTransaction = {
      id: generateTxnId(),
      profileId,
      type: 'refunded',
      amount: original.amount,
      capabilityId: original.capabilityId,
      executionLevel: original.executionLevel,
      reason: `Refunded: ${reason}`,
      timestamp: new Date().toISOString(),
    };
    sessionAccounting.recordTransaction(refund);
    return refund;
  }

  /**
   * Grant Executive Sessions to a user.
   */
  grantExecutiveSession(
    profileId: string,
    amount: number,
    reason: string
  ): SessionTransaction {
    const txn: SessionTransaction = {
      id: generateTxnId(),
      profileId,
      type: 'granted',
      amount,
      reason: `Granted: ${reason}`,
      timestamp: new Date().toISOString(),
    };
    sessionAccounting.recordTransaction(txn);
    return txn;
  }

  /**
   * Preview a capability without consuming a session.
   */
  previewCapability(profileId: string, capabilityId: string): CapabilityPreview {
    governanceAnalytics.trackPreviewConversion(profileId, capabilityId);
    return buildPreview(capabilityId);
  }

  /**
   * Track capability usage (analytics only, no conversation storage).
   */
  trackCapabilityUsage(
    profileId: string,
    capabilityId: string,
    executionLevel: ExecutionLevel,
    outcome: UsageOutcome,
    duration: number
  ): void {
    governanceAnalytics.trackCapabilityUsage(
      profileId,
      capabilityId,
      executionLevel,
      outcome,
      duration
    );
  }

  /**
   * Get the session account for a user.
   */
  getAccount(profileId: string, tier: MembershipTier) {
    return sessionAccounting.getOrCreateAccount(profileId, tier);
  }

  /**
   * Reset all session state (for testing).
   */
  reset(): void {
    sessionAccounting.clear();
    governanceAnalytics.clear();
  }
}

export const sessionEngine = new SessionEngineImpl();