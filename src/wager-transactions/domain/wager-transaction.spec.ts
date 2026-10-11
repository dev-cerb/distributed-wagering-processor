import { describe, expect, it } from 'vitest';
import { Money } from '../../shared/domain/money.js';
import {
  InvalidTransactionStateError,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.js';

function createTransaction(
  kind: WagerTransactionKind = WagerTransactionKind.Bet,
) {
  return WagerTransaction.create({
    id: 'tx-1',
    providerId: 'provider-1',
    externalTransactionId: 'external-1',
    idempotencyKey: 'idem-1',
    payloadHash: 'hash-1',
    walletId: 'wallet-1',
    playerId: 'player-1',
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    money: Money.from({
      amount: '10.00',
      currency: 'BRL',
    }),
    referenceExternalTransactionId:
      kind === WagerTransactionKind.Refund ||
      kind === WagerTransactionKind.Rollback
        ? 'external-reference-1'
        : undefined,
  });
}

describe('WagerTransaction', () => {
  it('should start in PENDING', () => {
    const transaction = createTransaction();

    expect(transaction.status).toBe(WagerTransactionStatus.Pending);
  });

  it('should process a transaction', () => {
    const transaction = createTransaction();
    const processedAt = new Date('2026-01-01T12:00:00.000Z');

    transaction.markProcessed(undefined, processedAt);

    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(transaction.processedAt).toEqual(processedAt);
    expect(transaction.isTerminal()).toBe(true);
  });

  it('should require a reference for REFUND', () => {
    expect(() =>
      WagerTransaction.create({
        id: 'tx-refund',
        providerId: 'provider-1',
        externalTransactionId: 'external-refund',
        idempotencyKey: 'idem-refund',
        payloadHash: 'hash-refund',
        walletId: 'wallet-1',
        playerId: 'player-1',
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Refund,
        money: Money.from({
          amount: '10.00',
          currency: 'BRL',
        }),
      }),
    ).toThrow();
  });

  it('should not allow a transition after processing', () => {
    const transaction = createTransaction();

    transaction.markProcessed(undefined, new Date());

    expect(() => transaction.reject('INVALID')).toThrow(
      InvalidTransactionStateError,
    );
  });

  it('should mark LOSS as not affecting the balance', () => {
    const transaction = createTransaction(WagerTransactionKind.Loss);

    expect(transaction.affectsBalance()).toBe(false);
  });

  it('should compare payload hashes', () => {
    const transaction = createTransaction();

    expect(transaction.matchesPayload('hash-1')).toBe(true);
    expect(transaction.matchesPayload('different-hash')).toBe(false);
  });

  it('should mark a transaction as PENDING_REFERENCE', () => {
    const transaction = createTransaction();

    transaction.markPendingReference();

    expect(transaction.status).toBe(WagerTransactionStatus.PendingReference);
  });

  it('should reject a transaction and store the failure code', () => {
    const transaction = createTransaction();

    transaction.reject('INVALID');

    expect(transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(transaction.failureCode).toBe('INVALID');
  });

  it('should fail a transaction and store the failure code', () => {
    const transaction = createTransaction();

    transaction.fail('INFRASTRUCTURE_ERROR');

    expect(transaction.status).toBe(WagerTransactionStatus.Failed);
    expect(transaction.failureCode).toBe('INFRASTRUCTURE_ERROR');
  });

  it('should return DEBIT for BET', () => {
    const transaction = createTransaction(WagerTransactionKind.Bet);

    expect(transaction.ledgerDirectionFor()).toBe('DEBIT');
  });

  it('should return CREDIT for WIN', () => {
    const transaction = createTransaction(WagerTransactionKind.Win);

    expect(transaction.ledgerDirectionFor()).toBe('CREDIT');
  });

  it('should return CREDIT for OPENING', () => {
    const transaction = createTransaction(WagerTransactionKind.Opening);

    expect(transaction.ledgerDirectionFor()).toBe('CREDIT');
  });

  it('should return CREDIT for REFUND', () => {
    const transaction = createTransaction(WagerTransactionKind.Refund);

    expect(transaction.ledgerDirectionFor()).toBe('CREDIT');
  });

  it('should return CREDIT when rolling back a BET', () => {
    const transaction = createTransaction(WagerTransactionKind.Rollback);
    const reference = createTransaction(WagerTransactionKind.Bet);

    expect(transaction.ledgerDirectionFor(reference)).toBe('CREDIT');
  });

  it('should return DEBIT when rolling back a WIN', () => {
    const transaction = createTransaction(WagerTransactionKind.Rollback);
    const reference = createTransaction(WagerTransactionKind.Win);

    expect(transaction.ledgerDirectionFor(reference)).toBe('DEBIT');
  });

  it('should throw when LOSS requests a ledger direction', () => {
    const transaction = createTransaction(WagerTransactionKind.Loss);

    expect(() => transaction.ledgerDirectionFor()).toThrow();
  });

  it('should throw when ROLLBACK has no reference', () => {
    const transaction = createTransaction(WagerTransactionKind.Rollback);

    expect(() => transaction.ledgerDirectionFor()).toThrow();
  });
});
