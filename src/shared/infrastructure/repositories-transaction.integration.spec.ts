import { Test, TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { DatabaseTransactionService } from './database-transaction.service.js';

import { Money } from '../domain/money.js';
import { LedgerDirection } from '../domain/ledger-direction.js';

import { Wallet } from '../../wallets/domain/wallet.js';
import { WalletEntity } from '../../wallets/entities/wallet.entity.js';
import { WalletRepositoryImpl } from '../../wallets/repositories/wallet.repository-impl.js';

import {
  WagerTransaction,
  WagerTransactionKind,
} from '../../wager-transactions/domain/wager-transaction.js';
import { WagerTransactionEntity } from '../../wager-transactions/entities/wager-transaction.entity.js';
import { WagerTransactionRepositoryImpl } from '../../wager-transactions/repositories/wager-transaction.repository-impl.js';

import { WalletLedgerEntry } from '../../ledger/domain/wallet-ledger-entry.js';
import { WalletLedgerEntryEntity } from '../../ledger/entities/wallet-ledger-entry.entity.js';
import { WalletLedgerRepositoryImpl } from '../../ledger/repositories/wallet-ledger.repository-impl.js';

describe('Repositories transaction (integration)', () => {
  let moduleRef: TestingModule;
  let transactionService: DatabaseTransactionService;
  let orm: MikroORM;

  let walletRepository: WalletRepositoryImpl;
  let wagerTransactionRepository: WagerTransactionRepositoryImpl;
  let walletLedgerRepository: WalletLedgerRepositoryImpl;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    transactionService = moduleRef.get(DatabaseTransactionService);
    orm = moduleRef.get(MikroORM);

    walletRepository = moduleRef.get(WalletRepositoryImpl);
    wagerTransactionRepository = moduleRef.get(WagerTransactionRepositoryImpl);
    walletLedgerRepository = moduleRef.get(WalletLedgerRepositoryImpl);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should persist the wallet, transaction and ledger entry together', async () => {
    const walletId = randomUUID();
    const transactionId = randomUUID();
    const ledgerEntryId = randomUUID();
    const playerId = randomUUID();

    const initialBalance = Money.from({
      amount: '100.00',
      currency: 'BRL',
    });

    const betAmount = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance,
    });

    const movement = wallet.debit(betAmount);

    const transaction = WagerTransaction.create({
      id: transactionId,
      providerId: 'integration-test-provider',
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      payloadHash: 'a'.repeat(64),
      walletId,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-test-game',
      kind: WagerTransactionKind.Bet,
      money: betAmount,
    });

    transaction.markProcessed(undefined, new Date());

    const ledgerEntry = WalletLedgerEntry.create({
      id: ledgerEntryId,
      walletId,
      transactionId,
      direction: LedgerDirection.Debit,
      money: movement.money,
      balanceBefore: movement.balanceBefore,
      balanceAfter: movement.balanceAfter,
      createdAt: movement.occurredAt,
    });

    await transactionService.execute(async (em) => {
      await walletRepository.save(wallet, em);
      await wagerTransactionRepository.save(transaction, em);
      await walletLedgerRepository.save(ledgerEntry, em);

      await em.flush();
    });

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: walletId,
      });

      const persistedTransaction = await checkEm.findOne(
        WagerTransactionEntity,
        { id: transactionId },
      );

      const persistedLedgerEntry = await checkEm.findOne(
        WalletLedgerEntryEntity,
        { id: ledgerEntryId },
      );

      expect(persistedWallet).not.toBeNull();
      expect(persistedWallet?.balance).toBe('80.00');
      expect(persistedWallet?.version).toBe(2);

      expect(persistedTransaction).not.toBeNull();
      expect(persistedTransaction?.status).toBe('PROCESSED');

      expect(persistedLedgerEntry).not.toBeNull();
      expect(persistedLedgerEntry?.direction).toBe('DEBIT');
      expect(persistedLedgerEntry?.balanceBefore).toBe('100.00');
      expect(persistedLedgerEntry?.balanceAfter).toBe('80.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should rollback all repository changes when the transaction fails', async () => {
    const walletId = randomUUID();
    const transactionId = randomUUID();
    const ledgerEntryId = randomUUID();
    const playerId = randomUUID();

    const initialBalance = Money.from({
      amount: '100.00',
      currency: 'BRL',
    });

    const betAmount = Money.from({
      amount: '20.00',
      currency: 'BRL',
    });

    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance,
    });

    const movement = wallet.debit(betAmount);

    const transaction = WagerTransaction.create({
      id: transactionId,
      providerId: 'integration-test-provider',
      externalTransactionId: randomUUID(),
      idempotencyKey: randomUUID(),
      payloadHash: 'b'.repeat(64),
      walletId,
      playerId,
      roundId: randomUUID(),
      gameId: 'integration-test-game',
      kind: WagerTransactionKind.Bet,
      money: betAmount,
    });

    transaction.markProcessed(undefined, new Date());

    const ledgerEntry = WalletLedgerEntry.create({
      id: ledgerEntryId,
      walletId,
      transactionId,
      direction: LedgerDirection.Debit,
      money: movement.money,
      balanceBefore: movement.balanceBefore,
      balanceAfter: movement.balanceAfter,
      createdAt: movement.occurredAt,
    });

    await expect(
      transactionService.execute(async (em) => {
        await walletRepository.save(wallet, em);
        await wagerTransactionRepository.save(transaction, em);
        await walletLedgerRepository.save(ledgerEntry, em);

        await em.flush();

        throw new Error('Simulated transaction failure');
      }),
    ).rejects.toThrow('Simulated transaction failure');

    const checkEm = orm.em.fork();

    try {
      const persistedWallet = await checkEm.findOne(WalletEntity, {
        id: walletId,
      });

      const persistedTransaction = await checkEm.findOne(
        WagerTransactionEntity,
        { id: transactionId },
      );

      const persistedLedgerEntry = await checkEm.findOne(
        WalletLedgerEntryEntity,
        { id: ledgerEntryId },
      );

      expect(persistedWallet).toBeNull();
      expect(persistedTransaction).toBeNull();
      expect(persistedLedgerEntry).toBeNull();
    } finally {
      checkEm.clear();
    }
  });
});
