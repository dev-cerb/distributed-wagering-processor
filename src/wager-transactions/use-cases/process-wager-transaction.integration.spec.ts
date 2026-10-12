import { Test, TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../../app.module.js';
import { WalletsService } from '../../wallets/wallets.service.js';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case.js';
import { WalletEntity } from '../../wallets/entities/wallet.entity.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import { WalletLedgerEntryEntity } from '../../ledger/entities/wallet-ledger-entry.entity.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../domain/wager-transaction.js';

import { WalletLedgerRepositoryImpl } from '../../ledger/repositories/wallet-ledger.repository-impl.js';
import { vi } from 'vitest';

describe('ProcessWagerTransactionUseCase integration', () => {
  let module: TestingModule;
  let walletsService: WalletsService;
  let processWagerTransaction: ProcessWagerTransactionUseCase;
  let orm: MikroORM;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    walletsService = module.get(WalletsService);
    processWagerTransaction = module.get(ProcessWagerTransactionUseCase);
    orm = module.get(MikroORM);
  });

  afterAll(async () => {
    await orm.close(true);
    await module.close();
  });

  it('should reject a bet with insufficient funds without changing the wallet or creating a ledger entry', async () => {
    const playerId = `integration-${randomUUID()}`;

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const result = await processWagerTransaction.execute({
      providerId: 'integration-provider',
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-game',
      amount: '150.00',
      currency: 'BRL',
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe('INSUFFICIENT_FUNDS');

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(1);

      const rejectedTransactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Bet,
      });

      expect(rejectedTransactions).toHaveLength(1);
      expect(rejectedTransactions[0]?.status).toBe(
        WagerTransactionStatus.Rejected,
      );
      expect(rejectedTransactions[0]?.failureCode).toBe('INSUFFICIENT_FUNDS');

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });

  it('should process a bet and persist the wallet debit and ledger entry', async () => {
    const playerId = `integration-${randomUUID()}`;

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const result = await processWagerTransaction.execute({
      providerId: 'integration-provider',
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-game',
      amount: '30.00',
      currency: 'BRL',
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.idempotentReplay).toBe(false);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('70.00');
      expect(persistedWallet?.version).toBe(2);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Bet,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.status).toBe(WagerTransactionStatus.Processed);
      expect(transactions[0]?.amount).toBe('30.00');
      expect(transactions[0]?.currency).toBe('BRL');

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(2);

      const debitEntries = ledgerEntries.filter(
        (entry) => entry.direction === 'DEBIT',
      );

      expect(debitEntries).toHaveLength(1);
      expect(debitEntries[0]?.amount).toBe('30.00');
      expect(debitEntries[0]?.currency).toBe('BRL');
      expect(debitEntries[0]?.balanceBefore).toBe('100.00');
      expect(debitEntries[0]?.balanceAfter).toBe('70.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should not debit the wallet twice when the same bet is submitted again', async () => {
    const playerId = `integration-${randomUUID()}`;
    const externalTransactionId = randomUUID();
    const idempotencyKey = randomUUID();
    const roundId = randomUUID();

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const input = {
      providerId: 'integration-provider',
      externalTransactionId,
      idempotencyKey,
      walletId: wallet.id,
      playerId,
      roundId,
      gameId: 'integration-game',
      amount: '30.00',
      currency: 'BRL',
    };

    const firstResult = await processWagerTransaction.execute(input);

    expect(firstResult.status).toBe(WagerTransactionStatus.Processed);
    expect(firstResult.idempotentReplay).toBe(false);

    const secondResult = await processWagerTransaction.execute(input);

    expect(secondResult.status).toBe(WagerTransactionStatus.Processed);
    expect(secondResult.transactionId).toBe(firstResult.transactionId);
    expect(secondResult.idempotentReplay).toBe(true);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('70.00');
      expect(persistedWallet?.version).toBe(2);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Bet,
      });

      expect(transactions).toHaveLength(1);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(2);

      const debitEntries = ledgerEntries.filter(
        (entry) => entry.direction === 'DEBIT',
      );

      expect(debitEntries).toHaveLength(1);
      expect(debitEntries[0]?.amount).toBe('30.00');
      expect(debitEntries[0]?.balanceAfter).toBe('70.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should process only one of two concurrent bets when the wallet has insufficient funds for both', async () => {
    const playerId = `integration-${randomUUID()}`;

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const commonInput = {
      providerId: 'integration-provider',
      walletId: wallet.id,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-game',
      amount: '80.00',
      currency: 'BRL',
    };

    const [firstResult, secondResult] = await Promise.all([
      processWagerTransaction.execute({
        ...commonInput,
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
      processWagerTransaction.execute({
        ...commonInput,
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ]);

    const results = [firstResult, secondResult];

    expect(
      results.filter(
        (result) => result.status === WagerTransactionStatus.Processed,
      ),
    ).toHaveLength(1);

    expect(
      results.filter(
        (result) => result.status === WagerTransactionStatus.Rejected,
      ),
    ).toHaveLength(1);

    const rejectedResult = results.find(
      (result) => result.status === WagerTransactionStatus.Rejected,
    );

    expect(rejectedResult?.failureCode).toBe('INSUFFICIENT_FUNDS');

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('20.00');
      expect(persistedWallet?.version).toBe(2);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Bet,
      });

      expect(transactions).toHaveLength(2);

      expect(
        transactions.filter(
          (transaction) =>
            transaction.status === WagerTransactionStatus.Processed,
        ),
      ).toHaveLength(1);

      expect(
        transactions.filter(
          (transaction) =>
            transaction.status === WagerTransactionStatus.Rejected,
        ),
      ).toHaveLength(1);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(2);

      const debitEntries = ledgerEntries.filter(
        (entry) => entry.direction === 'DEBIT',
      );

      expect(debitEntries).toHaveLength(1);
      expect(debitEntries[0]?.amount).toBe('80.00');
      expect(debitEntries[0]?.balanceBefore).toBe('100.00');
      expect(debitEntries[0]?.balanceAfter).toBe('20.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should reject reuse of an idempotency key with a different payload', async () => {
    const playerId = `integration-${randomUUID()}`;
    const externalTransactionId = randomUUID();
    const idempotencyKey = randomUUID();

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const originalInput = {
      providerId: 'integration-provider',
      externalTransactionId,
      idempotencyKey,
      walletId: wallet.id,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-game',
      amount: '30.00',
      currency: 'BRL',
    };

    const firstResult = await processWagerTransaction.execute(originalInput);

    expect(firstResult.status).toBe(WagerTransactionStatus.Processed);
    expect(firstResult.idempotentReplay).toBe(false);

    await expect(
      processWagerTransaction.execute({
        ...originalInput,
        amount: '40.00',
      }),
    ).rejects.toMatchObject({
      status: 409,
    });

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('70.00');
      expect(persistedWallet?.version).toBe(2);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Bet,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.status).toBe(WagerTransactionStatus.Processed);
      expect(transactions[0]?.amount).toBe('30.00');

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(2);

      const debitEntries = ledgerEntries.filter(
        (entry) => entry.direction === 'DEBIT',
      );

      expect(debitEntries).toHaveLength(1);
      expect(debitEntries[0]?.amount).toBe('30.00');
      expect(debitEntries[0]?.balanceAfter).toBe('70.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should roll back the wallet and transaction when ledger persistence fails', async () => {
    const playerId = `integration-${randomUUID()}`;

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const ledgerRepository = module.get(WalletLedgerRepositoryImpl);

    const saveSpy = vi
      .spyOn(ledgerRepository, 'save')
      .mockRejectedValueOnce(new Error('Simulated ledger persistence failure'));

    try {
      await expect(
        processWagerTransaction.execute({
          providerId: 'integration-provider',
          externalTransactionId: randomUUID(),
          idempotencyKey: randomUUID(),
          walletId: wallet.id,
          playerId,
          roundId: randomUUID(),
          gameId: 'integration-game',
          amount: '30.00',
          currency: 'BRL',
        }),
      ).rejects.toThrow('Simulated ledger persistence failure');
    } finally {
      saveSpy.mockRestore();
    }

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(1);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Bet,
      });

      expect(transactions).toHaveLength(0);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0]?.direction).toBe('CREDIT');
      expect(ledgerEntries[0]?.amount).toBe('100.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should process a win and persist the wallet credit and ledger entry', async () => {
    const playerId = `integration-${randomUUID()}`;

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const result = await processWagerTransaction.execute({
      providerId: 'integration-provider',
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-game',
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Win,
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.idempotentReplay).toBe(false);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('130.00');
      expect(persistedWallet?.version).toBe(2);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Win,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.status).toBe(WagerTransactionStatus.Processed);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      const creditEntries = ledgerEntries.filter(
        (entry) => entry.direction === 'CREDIT',
      );

      expect(creditEntries).toHaveLength(2);
      expect(
        creditEntries.filter((entry) => entry.amount === '30.00'),
      ).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });

  it('should process a loss without changing the wallet or creating a ledger entry', async () => {
    const playerId = `integration-${randomUUID()}`;

    const wallet = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const result = await processWagerTransaction.execute({
      providerId: 'integration-provider',
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-game',
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Loss,
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(1);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Loss,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.status).toBe(WagerTransactionStatus.Processed);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0]?.direction).toBe('CREDIT');
      expect(ledgerEntries[0]?.amount).toBe('100.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should refund a processed bet and restore the wallet balance', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const betExternalId = randomUUID();

    const bet = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: betExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Bet,
    });

    expect(bet.status).toBe(WagerTransactionStatus.Processed);

    const refund = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: betExternalId,
    });

    expect(refund.status).toBe(WagerTransactionStatus.Processed);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(3);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
      });

      expect(
        transactions.filter(
          (transaction) =>
            transaction.kind === WagerTransactionKind.Bet &&
            transaction.status === WagerTransactionStatus.Processed,
        ),
      ).toHaveLength(1);

      expect(
        transactions.filter(
          (transaction) =>
            transaction.kind === WagerTransactionKind.Refund &&
            transaction.status === WagerTransactionStatus.Processed,
        ),
      ).toHaveLength(1);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(3);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'DEBIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'CREDIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });

  it('should reject a refund referencing a processed win without changing the wallet', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const winExternalId = randomUUID();

    await processWagerTransaction.execute({
      providerId,
      externalTransactionId: winExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Win,
    });

    const refund = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: winExternalId,
    });

    expect(refund.status).toBe(WagerTransactionStatus.Rejected);
    expect(refund.failureCode).toBe('INVALID_REFERENCE');

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('130.00');
      expect(persistedWallet?.version).toBe(2);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
      });

      expect(
        transactions.filter(
          (transaction) => transaction.kind === WagerTransactionKind.Refund,
        ),
      ).toHaveLength(1);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(2);
    } finally {
      checkEm.clear();
    }
  });

  it('should reject a second refund of the same bet without crediting the wallet twice', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const betExternalId = randomUUID();

    await processWagerTransaction.execute({
      providerId,
      externalTransactionId: betExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Bet,
    });

    const firstRefund = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: betExternalId,
    });

    expect(firstRefund.status).toBe(WagerTransactionStatus.Processed);

    const secondRefund = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: betExternalId,
    });

    expect(secondRefund.status).toBe(WagerTransactionStatus.Rejected);
    expect(secondRefund.failureCode).toBe('REFERENCE_ALREADY_REVERSED');

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(3);

      const refunds = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Refund,
      });

      expect(refunds).toHaveLength(2);
      expect(
        refunds.filter(
          (transaction) =>
            transaction.status === WagerTransactionStatus.Processed,
        ),
      ).toHaveLength(1);
      expect(
        refunds.filter(
          (transaction) =>
            transaction.status === WagerTransactionStatus.Rejected,
        ),
      ).toHaveLength(1);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(3);
    } finally {
      checkEm.clear();
    }
  });

  it('should rollback a processed bet and restore the wallet balance', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';
    const betExternalId = randomUUID();

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    await processWagerTransaction.execute({
      providerId,
      externalTransactionId: betExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Bet,
    });

    const rollback = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: betExternalId,
    });

    expect(rollback.status).toBe(WagerTransactionStatus.Processed);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(3);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(3);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'DEBIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'CREDIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });

  it('should rollback a processed win and reverse its credit', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';
    const winExternalId = randomUUID();

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    await processWagerTransaction.execute({
      providerId,
      externalTransactionId: winExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Win,
    });

    const rollback = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: winExternalId,
    });

    expect(rollback.status).toBe(WagerTransactionStatus.Processed);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(3);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(3);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'CREDIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'DEBIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });

  it('should rollback a processed refund and undo its credit', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';
    const betExternalId = randomUUID();
    const refundExternalId = randomUUID();

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    await processWagerTransaction.execute({
      providerId,
      externalTransactionId: betExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Bet,
    });

    await processWagerTransaction.execute({
      providerId,
      externalTransactionId: refundExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: betExternalId,
    });

    const rollback = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: refundExternalId,
    });

    expect(rollback.status).toBe(WagerTransactionStatus.Processed);

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet?.balance).toBe('70.00');
      expect(persistedWallet?.version).toBe(4);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(4);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'DEBIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(2);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'CREDIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });

  it('should process only one of two concurrent rollbacks of the same bet', async () => {
    const playerId = `integration-${randomUUID()}`;
    const providerId = 'integration-provider';
    const roundId = randomUUID();
    const gameId = 'integration-game';
    const betExternalId = randomUUID();

    const wallet = await walletsService.open({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const bet = await processWagerTransaction.execute({
      providerId,
      externalTransactionId: betExternalId,
      idempotencyKey: randomUUID(),
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Bet,
    });

    expect(bet.status).toBe(WagerTransactionStatus.Processed);

    const commonRollbackInput = {
      providerId,
      walletId: wallet.id,
      playerId,
      roundId,
      gameId,
      amount: '30.00',
      currency: 'BRL',
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: betExternalId,
    };

    const [firstRollback, secondRollback] = await Promise.all([
      processWagerTransaction.execute({
        ...commonRollbackInput,
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
      processWagerTransaction.execute({
        ...commonRollbackInput,
        externalTransactionId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
    ]);

    const results = [firstRollback, secondRollback];

    expect(
      results.filter(
        (result) => result.status === WagerTransactionStatus.Processed,
      ),
    ).toHaveLength(1);

    expect(
      results.filter(
        (result) => result.status === WagerTransactionStatus.Rejected,
      ),
    ).toHaveLength(1);

    const rejectedRollback = results.find(
      (result) => result.status === WagerTransactionStatus.Rejected,
    );

    expect(rejectedRollback?.failureCode).toBe('REFERENCE_ALREADY_REVERSED');

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: wallet.id,
      });

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('100.00');
      expect(persistedWallet?.version).toBe(3);

      const rollbacks = await checkEm.find(WagerTransactionEntity, {
        wallet: wallet.id,
        kind: WagerTransactionKind.Rollback,
      });

      expect(rollbacks).toHaveLength(2);

      expect(
        rollbacks.filter(
          (transaction) =>
            transaction.status === WagerTransactionStatus.Processed,
        ),
      ).toHaveLength(1);

      expect(
        rollbacks.filter(
          (transaction) =>
            transaction.status === WagerTransactionStatus.Rejected,
        ),
      ).toHaveLength(1);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: wallet.id,
      });

      expect(ledgerEntries).toHaveLength(3);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'DEBIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);

      expect(
        ledgerEntries.filter(
          (entry) => entry.direction === 'CREDIT' && entry.amount === '30.00',
        ),
      ).toHaveLength(1);
    } finally {
      checkEm.clear();
    }
  });
});
