import { Test, TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { DatabaseTransactionService } from './database-transaction.service.js';
import { WalletEntity } from '../../wallets/entities/wallet.entity.js';

describe('DatabaseTransactionService (integration)', () => {
  let moduleRef: TestingModule;
  let transactionService: DatabaseTransactionService;
  let orm: MikroORM;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    transactionService = moduleRef.get(DatabaseTransactionService);
    orm = moduleRef.get(MikroORM);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should rollback database changes when the callback fails', async () => {
    const id = randomUUID();

    await expect(
      transactionService.execute(async (em) => {
        const wallet = em.create(WalletEntity, {
          id,
          playerId: randomUUID(),
          currency: 'BRL',
          balance: '100.00',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        em.persist(wallet);
        await em.flush();

        throw new Error('Simulated failure');
      }),
    ).rejects.toThrow('Simulated failure');

    const checkEm = orm.em.fork();
    const persistedWallet = await checkEm.findOne(WalletEntity, { id });

    expect(persistedWallet).toBeNull();

    checkEm.clear();
  });
});
