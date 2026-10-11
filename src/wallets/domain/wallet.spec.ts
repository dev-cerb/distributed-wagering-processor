import { describe, expect, it } from 'vitest';
import { Money } from '../../shared/domain/money.js';
import { Wallet } from './wallet.js';

describe('Wallet', () => {
  const initialBalance = Money.from({
    amount: '100.00',
    currency: 'BRL',
  });

  const createWallet = () =>
    Wallet.open({
      id: 'wallet-1',
      playerId: 'player-1',
      initialBalance,
    });

  describe('open', () => {
    it('should create a wallet with the initial balance and version 1', () => {
      const wallet = createWallet();

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.currency).toBe('BRL');
      expect(wallet.version).toBe(1);
    });

    it('should reject an empty wallet id', () => {
      expect(() =>
        Wallet.open({
          id: '',
          playerId: 'player-1',
          initialBalance,
        }),
      ).toThrow();
    });

    it('should reject an empty player id', () => {
      expect(() =>
        Wallet.open({
          id: 'wallet-1',
          playerId: '',
          initialBalance,
        }),
      ).toThrow();
    });

    it('should reject a negative balance', () => {
      expect(() =>
        Wallet.open({
          id: 'wallet-1',
          playerId: 'player-1',
          initialBalance: Money.from({
            amount: '-100.00',
            currency: 'BRL',
          }),
        }),
      ).toThrow();
    });
  });

  describe('debit', () => {
    it('should decrease the balance and increment the version', () => {
      const wallet = createWallet();

      const movement = wallet.debit(
        Money.from({ amount: '30.00', currency: 'BRL' }),
      );

      expect(wallet.balance.toString()).toBe('70.00');
      expect(wallet.version).toBe(2);
      expect(movement.direction).toBe('DEBIT');
      expect(movement.balanceBefore.toString()).toBe('100.00');
      expect(movement.balanceAfter.toString()).toBe('70.00');
    });

    it('should reject a debit greater than the balance', () => {
      const wallet = createWallet();

      expect(() =>
        wallet.debit(Money.from({ amount: '150.00', currency: 'BRL' })),
      ).toThrow();

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.version).toBe(1);
    });

    it('should reject a debit in a different currency', () => {
      const wallet = createWallet();

      expect(() =>
        wallet.debit(Money.from({ amount: '10.00', currency: 'USD' })),
      ).toThrow();

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.version).toBe(1);
    });

    it('should reject a zero debit', () => {
      const wallet = createWallet();

      expect(() => wallet.debit(Money.zero('BRL'))).toThrow();

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.version).toBe(1);
    });
  });

  describe('credit', () => {
    it('should increase the balance and increment the version', () => {
      const wallet = createWallet();

      const movement = wallet.credit(
        Money.from({ amount: '50.00', currency: 'BRL' }),
      );

      expect(wallet.balance.toString()).toBe('150.00');
      expect(wallet.version).toBe(2);
      expect(movement.direction).toBe('CREDIT');
      expect(movement.balanceBefore.toString()).toBe('100.00');
      expect(movement.balanceAfter.toString()).toBe('150.00');
    });

    it('should reject a credit in a different currency', () => {
      const wallet = createWallet();

      expect(() =>
        wallet.credit(Money.from({ amount: '10.00', currency: 'USD' })),
      ).toThrow();

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.version).toBe(1);
    });

    it('should reject a zero credit', () => {
      const wallet = createWallet();

      expect(() => wallet.credit(Money.zero('BRL'))).toThrow();

      expect(wallet.balance.toString()).toBe('100.00');
      expect(wallet.version).toBe(1);
    });
  });
});
