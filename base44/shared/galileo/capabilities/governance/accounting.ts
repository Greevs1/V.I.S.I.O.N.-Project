/**
 * Galileo Capability Governance — Session Accounting
 * Phase 13.4B.1.5
 *
 * Tracks Executive Session accounting: earned, used, remaining, expired,
 * granted, refunded, and manual adjustments.
 *
 * In-memory ledger only. No persistence yet. No conversation storage.
 * Only metadata.
 */
import type { MembershipTier } from '../types.ts';
import type { SessionAccount, SessionTransaction } from './types.ts';
import { getTierMonthlySessions } from './tiers.ts';

function generateTxnId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

class SessionAccountingImpl {
  private accounts = new Map<string, SessionAccount>();
  private transactions = new Map<string, SessionTransaction[]>();

  getOrCreateAccount(profileId: string, tier: MembershipTier): SessionAccount {
    let account = this.accounts.get(profileId);
    if (!account) {
      const monthly = getTierMonthlySessions(tier);
      account = {
        profileId,
        tier,
        earned: 0,
        used: 0,
        remaining: monthly, // -1 = unlimited
        expired: 0,
        granted: 0,
        refunded: 0,
        manualAdjustments: 0,
        lastResetDate: new Date().toISOString(),
      };
      this.accounts.set(profileId, account);
    }
    return account;
  }

  recordTransaction(transaction: SessionTransaction): void {
    const list = this.transactions.get(transaction.profileId) || [];
    list.push(transaction);
    this.transactions.set(transaction.profileId, list);

    const account = this.accounts.get(transaction.profileId);
    if (!account) return;

    switch (transaction.type) {
      case 'earned':
        account.earned += transaction.amount;
        if (account.remaining !== -1) account.remaining += transaction.amount;
        break;
      case 'consumed':
        account.used += transaction.amount;
        if (account.remaining !== -1) account.remaining -= transaction.amount;
        break;
      case 'refunded':
        account.refunded += transaction.amount;
        if (account.remaining !== -1) account.remaining += transaction.amount;
        break;
      case 'granted':
        account.granted += transaction.amount;
        if (account.remaining !== -1) account.remaining += transaction.amount;
        break;
      case 'expired':
        account.expired += transaction.amount;
        if (account.remaining !== -1) account.remaining -= transaction.amount;
        break;
      case 'adjusted':
        account.manualAdjustments += transaction.amount;
        if (account.remaining !== -1) account.remaining += transaction.amount;
        break;
    }
  }

  getBalance(profileId: string): number {
    const account = this.accounts.get(profileId);
    return account?.remaining ?? 0;
  }

  getAccount(profileId: string): SessionAccount | undefined {
    return this.accounts.get(profileId);
  }

  getTransactions(profileId: string): SessionTransaction[] {
    return this.transactions.get(profileId) || [];
  }

  getAccountSummary(profileId: string): SessionAccount | undefined {
    return this.accounts.get(profileId);
  }

  adjustAccount(profileId: string, amount: number, reason: string): SessionTransaction {
    const txn: SessionTransaction = {
      id: generateTxnId(),
      profileId,
      type: 'adjusted',
      amount,
      reason,
      timestamp: new Date().toISOString(),
    };
    this.recordTransaction(txn);
    return txn;
  }

  resetAccount(profileId: string, tier: MembershipTier): SessionAccount {
    this.accounts.delete(profileId);
    this.transactions.delete(profileId);
    return this.getOrCreateAccount(profileId, tier);
  }

  clear(): void {
    this.accounts.clear();
    this.transactions.clear();
  }
}

export const sessionAccounting = new SessionAccountingImpl();
export { generateTxnId };