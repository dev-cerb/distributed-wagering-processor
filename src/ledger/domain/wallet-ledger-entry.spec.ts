import { describe, expect, it } from 'vitest';

import { Money } from '../../shared/domain/money.js';
import { LedgerDirection } from '../../shared/domain/ledger-direction.js';
import { WalletLedgerEntry } from './wallet-ledger-entry.js';

describe('WalletLedgerEntry', () => {
  const money = (amount: string) => Money.from({ amount, currency: 'BRL' });

  const baseProps = {
    id: 'ledger-1',
    walletId: 'wallet-1',
    transactionId: 'transaction-1',
    direction: LedgerDirection.Debit,
    money: money('30.00'),
    balanceBefore: money('100.00'),
    balanceAfter: money('70.00'),
    createdAt: new Date('2026-10-11T12:00:00.000Z'),
  };

  describe('create', () => {
    it('should create a balanced debit entry', () => {
      const entry = WalletLedgerEntry.create(baseProps);

      expect(entry.direction).toBe(LedgerDirection.Debit);
      expect(entry.balanceBefore.toString()).toBe('100.00');
      expect(entry.balanceAfter.toString()).toBe('70.00');
      expect(entry.isBalanced()).toBe(true);
    });

    it('should create a balanced credit entry', () => {
      const entry = WalletLedgerEntry.create({
        ...baseProps,
        direction: LedgerDirection.Credit,
        money: money('30.00'),
        balanceBefore: money('100.00'),
        balanceAfter: money('130.00'),
      });

      expect(entry.direction).toBe(LedgerDirection.Credit);
      expect(entry.balanceAfter.toString()).toBe('130.00');
      expect(entry.isBalanced()).toBe(true);
    });

    it('should reject an entry with an incorrect balance', () => {
      expect(() =>
        WalletLedgerEntry.create({
          ...baseProps,
          balanceAfter: money('80.00'),
        }),
      ).toThrow('Ledger entry is not balanced');
    });
  });

  describe('rehydrate', () => {
    it('should restore a previously persisted entry', () => {
      const entry = WalletLedgerEntry.rehydrate(baseProps);

      expect(entry.id).toBe('ledger-1');
      expect(entry.walletId).toBe('wallet-1');
      expect(entry.transactionId).toBe('transaction-1');
      expect(entry.createdAt).toEqual(baseProps.createdAt);
      expect(entry.isBalanced()).toBe(true);
    });
  });
});
