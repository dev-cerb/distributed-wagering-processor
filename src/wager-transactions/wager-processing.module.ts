import { Module } from '@nestjs/common';

import { WalletsModule } from '../wallets/wallets.module.js';
import { WagerTransactionsModule } from './wager-transaction.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { DatabaseTransactionModule } from '../shared/infrastructure/database-transaction.module.js';

import { ProcessWagerTransactionUseCase } from './use-cases/process-wager-transaction.use-case.js';

@Module({
  imports: [
    WalletsModule,
    WagerTransactionsModule,
    LedgerModule,
    DatabaseTransactionModule,
  ],
  providers: [ProcessWagerTransactionUseCase],
  exports: [ProcessWagerTransactionUseCase],
})
export class WagerProcessingModule {}
