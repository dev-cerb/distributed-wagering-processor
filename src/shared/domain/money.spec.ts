import { describe, expect, it } from 'vitest';

import { Money } from './money.js';

describe('Money', () => {
  describe('from', () => {
    it('should create money with a valid amount and currency', () => {
      const money = Money.from({
        amount: '25.00',
        currency: 'BRL',
      });

      expect(money.toString()).toBe('25.00');
      expect(money.currency).toBe('BRL');
    });

    it.each(['', '-10.00', '10.999', '10.000'])(
      'should reject invalid amount: %s',
      (amount) => {
        expect(() => Money.from({ amount, currency: 'BRL' })).toThrow();
      },
    );

    it('should reject an invalid currency', () => {
      expect(() =>
        Money.from({
          amount: '25.00',
          currency: 'xyz',
        }),
      ).toThrow();
    });
  });

  describe('zero', () => {
    it('should create zero for the given currency', () => {
      const money = Money.zero('BRL');

      expect(money.toString()).toBe('0.00');
      expect(money.currency).toBe('BRL');
      expect(money.isZero()).toBe(true);
    });
  });

  describe('arithmetic operations', () => {
    it('should add money values', () => {
      const a = Money.from({
        amount: '10.00',
        currency: 'BRL',
      });
      const b = Money.from({
        amount: '5.50',
        currency: 'BRL',
      });

      expect(a.add(b).toString()).toBe('15.50');
    });

    it('should subtract money values', () => {
      const a = Money.from({
        amount: '10.00',
        currency: 'BRL',
      });
      const b = Money.from({
        amount: '3.25',
        currency: 'BRL',
      });

      expect(a.subtract(b).toString()).toBe('6.75');
    });

    it('should negate a money value without changing the original', () => {
      const money = Money.from({
        amount: '25.00',
        currency: 'BRL',
      });

      expect(money.negate().toString()).toBe('-25.00');
      expect(money.toString()).toBe('25.00');
    });

    it('should reject operations with different currencies', () => {
      const brl = Money.from({
        amount: '10.00',
        currency: 'BRL',
      });
      const usd = Money.from({
        amount: '10.00',
        currency: 'USD',
      });

      expect(() => brl.add(usd)).toThrow();
      expect(() => brl.subtract(usd)).toThrow();
      expect(() => brl.isLessThan(usd)).toThrow();
    });
  });

  describe('comparisons and serialization', () => {
    it('should compare values', () => {
      const a = Money.from({
        amount: '10.00',
        currency: 'BRL',
      });
      const b = Money.from({
        amount: '20.00',
        currency: 'BRL',
      });

      expect(a.isPositive()).toBe(true);
      expect(a.isNegative()).toBe(false);
      expect(a.isZero()).toBe(false);
      expect(a.isLessThan(b)).toBe(true);
      expect(a.equals(b)).toBe(false);
    });

    it('should serialize using two decimal places', () => {
      const money = Money.from({
        amount: '25',
        currency: 'BRL',
      });

      expect(money.toString()).toBe('25.00');
      expect(money.toJSON()).toEqual({
        amount: '25.00',
        currency: 'BRL',
      });
    });
  });
});
