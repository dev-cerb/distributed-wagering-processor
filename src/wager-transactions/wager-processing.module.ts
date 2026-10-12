import { Module } from '@nestjs/common';

import { WalletsModule } from '../wallets/wallets.module.js';
import { WagerTransactionsModule } from './wager-transaction.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { DatabaseTransactionModule } from '../shared/infrastructure/database-transaction.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';

import { ProcessWagerTransactionUseCase } from './use-cases/process-wager-transaction.use-case.js';

import { WagerTransactionsController } from './wager-transactions.controller.js';

import { ProviderWagerTransactionsController } from './provider-wager-transactions.controller.js';

@Module({
  imports: [
    WalletsModule,
    WagerTransactionsModule,
    LedgerModule,
    DatabaseTransactionModule,
    OutboxModule,
  ],
  controllers: [
    WagerTransactionsController,
    ProviderWagerTransactionsController,
  ],
  providers: [ProcessWagerTransactionUseCase],
  exports: [ProcessWagerTransactionUseCase],
})
export class WagerProcessingModule {}
