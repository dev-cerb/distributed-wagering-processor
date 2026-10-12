import { Test, TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../app.module.js';
import { WalletsService } from './wallets.service.js';
import { WalletEntity } from './entities/wallet.entity.js';
import { WagerTransactionEntity } from '../wager-transactions/entities/wager-transaction.entity.js';
import { WalletLedgerEntryEntity } from '../ledger/entities/wallet-ledger-entry.entity.js';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../wager-transactions/domain/wager-transaction.js';
import { LedgerDirection } from '../shared/domain/ledger-direction.js';

describe('WalletsService integration', () => {
  let module: TestingModule;
  let walletsService: WalletsService;
  let orm: MikroORM;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    walletsService = module.get(WalletsService);
    orm = module.get(MikroORM);
  });

  afterAll(async () => {
    await orm.close(true);
    await module.close();
  });

  it('should create an opening transaction and credit ledger entry for a positive initial balance', async () => {
    const playerId = `integration-${randomUUID()}`;

    const result = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '100.00',
        currency: 'BRL',
      },
    });

    const checkEm = orm.em.fork();

    try {
      const wallet = await checkEm.findOne(WalletEntity, {
        id: result.id,
      });

      expect(wallet).not.toBeNull();
      expect(wallet?.playerId).toBe(playerId);
      expect(wallet?.balance).toBe('100.00');
      expect(wallet?.version).toBe(1);

      const openingTransaction = await checkEm.findOne(WagerTransactionEntity, {
        wallet: result.id,
        kind: WagerTransactionKind.Opening,
      });

      expect(openingTransaction).not.toBeNull();
      expect(openingTransaction?.status).toBe(WagerTransactionStatus.Processed);
      expect(openingTransaction?.amount).toBe('100.00');
      expect(openingTransaction?.currency).toBe('BRL');

      const ledgerEntry = await checkEm.findOne(WalletLedgerEntryEntity, {
        wallet: result.id,
      });

      expect(ledgerEntry).not.toBeNull();
      expect(ledgerEntry?.direction).toBe(LedgerDirection.Credit);
      expect(ledgerEntry?.amount).toBe('100.00');
      expect(ledgerEntry?.currency).toBe('BRL');
      expect(ledgerEntry?.balanceBefore).toBe('0.00');
      expect(ledgerEntry?.balanceAfter).toBe('100.00');
    } finally {
      checkEm.clear();
    }
  });

  it('should create only the wallet when the initial balance is zero', async () => {
    const playerId = `integration-${randomUUID()}`;

    const result = await walletsService.open({
      playerId,
      initialBalance: {
        amount: '0.00',
        currency: 'BRL',
      },
    });

    const checkEm = orm.em.fork();

    try {
      const wallet = await checkEm.findOne(WalletEntity, {
        id: result.id,
      });

      expect(wallet).not.toBeNull();
      expect(wallet?.playerId).toBe(playerId);
      expect(wallet?.balance).toBe('0.00');
      expect(wallet?.version).toBe(1);

      const transactions = await checkEm.find(WagerTransactionEntity, {
        wallet: result.id,
        kind: WagerTransactionKind.Opening,
      });

      expect(transactions).toHaveLength(0);

      const ledgerEntries = await checkEm.find(WalletLedgerEntryEntity, {
        wallet: result.id,
      });

      expect(ledgerEntries).toHaveLength(0);
    } finally {
      checkEm.clear();
    }
  });
});
