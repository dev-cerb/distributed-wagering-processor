import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WagerTransactionEntity } from './entities/wager-transaction.entity.js';
import { WagerTransactionRepositoryImpl } from './repositories/wager-transaction.repository-impl.js';

import { WagerTransactionsService } from './wager-transactions.service.js';

@Module({
  imports: [MikroOrmModule.forFeature([WagerTransactionEntity])],
  providers: [WagerTransactionRepositoryImpl, WagerTransactionsService],
  exports: [WagerTransactionRepositoryImpl, WagerTransactionsService],
})
export class WagerTransactionsModule {}
