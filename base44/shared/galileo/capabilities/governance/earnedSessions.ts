/**
 * Galileo Capability Governance — Earned Sessions
 * Phase 13.4B.1.5
 *
 * Users may earn additional Executive Sessions by completing valuable actions.
 * No gamification. No UI. Framework only.
 *
 * Earnable actions:
 *   - Complete assessments
 *   - Upload financials
 *   - Upload tax returns
 *   - Verify extracted information
 *   - Complete Build Value
 *   - Complete Growth Plan
 *   - Invite team member
 *   - Advisor invitation
 *   - Referral
 */
import type { MembershipTier } from '../types.ts';
import type { EarnedSessionAction, EarnedSessionRecord } from './types.ts';
import { sessionAccounting, generateTxnId } from './accounting.ts';
import { getTierDefinition } from './tiers.ts';
import { governanceAnalytics } from './analytics.ts';

export const EARNED_SESSION_ACTIONS: EarnedSessionAction[] = [
  {
    key: 'complete_assessment',
    label: 'Complete Assessment',
    description: 'Complete any assessment',
    sessionsAwarded: 1,
    category: 'assessment',
    repeatable: true,
    maxPerMonth: 6,
  },
  {
    key: 'upload_financials',
    label: 'Upload Financials',
    description: 'Upload financial documents',
    sessionsAwarded: 1,
    category: 'document',
    repeatable: true,
    maxPerMonth: 3,
  },
  {
    key: 'upload_tax_return',
    label: 'Upload Tax Return',
    description: 'Upload a tax return',
    sessionsAwarded: 1,
    category: 'document',
    repeatable: true,
    maxPerMonth: 3,
  },
  {
    key: 'verify_extracted_info',
    label: 'Verify Extracted Information',
    description: 'Verify extracted financial data',
    sessionsAwarded: 1,
    category: 'verification',
    repeatable: true,
    maxPerMonth: 5,
  },
  {
    key: 'complete_build_value',
    label: 'Complete Build Value',
    description: 'Complete the Build Value assessment',
    sessionsAwarded: 2,
    category: 'growth',
    repeatable: false,
  },
  {
    key: 'complete_growth_plan',
    label: 'Complete Growth Plan',
    description: 'Complete the Growth Plan workspace',
    sessionsAwarded: 2,
    category: 'growth',
    repeatable: false,
  },
  {
    key: 'invite_team_member',
    label: 'Invite Team Member',
    description: 'Invite a team member to the platform',
    sessionsAwarded: 1,
    category: 'team',
    repeatable: true,
    maxPerMonth: 3,
  },
  {
    key: 'advisor_invitation',
    label: 'Advisor Invitation',
    description: 'Accept an advisor invitation',
    sessionsAwarded: 1,
    category: 'team',
    repeatable: false,
  },
  {
    key: 'referral',
    label: 'Referral',
    description: 'Refer a business owner to the platform',
    sessionsAwarded: 3,
    category: 'referral',
    repeatable: true,
    maxPerMonth: 5,
  },
];

class EarnedSessionEngineImpl {
  private history = new Map<string, EarnedSessionRecord[]>();

  getAction(actionKey: string): EarnedSessionAction | undefined {
    return EARNED_SESSION_ACTIONS.find((a) => a.key === actionKey);
  }

  getAvailableActions(profileId: string): EarnedSessionAction[] {
    return EARNED_SESSION_ACTIONS.filter((a) => this.canEarn(profileId, a.key));
  }

  canEarn(profileId: string, actionKey: string): boolean {
    const action = this.getAction(actionKey);
    if (!action) return false;

    // Non-repeatable actions can only be earned once
    if (!action.repeatable) {
      const records = this.history.get(profileId) || [];
      return !records.some((r) => r.actionKey === actionKey);
    }

    // Repeatable actions have a monthly cap
    if (action.maxPerMonth) {
      const records = this.history.get(profileId) || [];
      const now = new Date();
      const thisMonth = records.filter((r) => {
        const d = new Date(r.timestamp);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      return thisMonth.length < action.maxPerMonth;
    }

    return true;
  }

  awardEarnedSession(
    profileId: string,
    actionKey: string,
    tier: MembershipTier
  ): { awarded: boolean; sessionsAwarded: number; record?: EarnedSessionRecord } {
    const action = this.getAction(actionKey);
    if (!action) {
      return { awarded: false, sessionsAwarded: 0 };
    }

    // Advisors don't earn (they're unlimited)
    const tierDef = getTierDefinition(tier);
    if (tierDef && tierDef.executiveSessions.monthly === -1 && !tierDef.executiveSessions.earned) {
      return { awarded: false, sessionsAwarded: 0 };
    }

    if (!this.canEarn(profileId, actionKey)) {
      return { awarded: false, sessionsAwarded: 0 };
    }

    const record: EarnedSessionRecord = {
      id: generateTxnId(),
      profileId,
      actionKey,
      sessionsAwarded: action.sessionsAwarded,
      timestamp: new Date().toISOString(),
    };

    const list = this.history.get(profileId) || [];
    list.push(record);
    this.history.set(profileId, list);

    // Record the earned session in accounting
    sessionAccounting.recordTransaction({
      id: record.id,
      profileId,
      type: 'earned',
      amount: action.sessionsAwarded,
      reason: `Earned: ${action.label}`,
      timestamp: record.timestamp,
    });

    // Track in analytics
    governanceAnalytics.trackSessionEarned(profileId, action.sessionsAwarded);

    return { awarded: true, sessionsAwarded: action.sessionsAwarded, record };
  }

  getEarnedHistory(profileId: string): EarnedSessionRecord[] {
    return this.history.get(profileId) || [];
  }

  clear(): void {
    this.history.clear();
  }
}

export const earnedSessionEngine = new EarnedSessionEngineImpl();