import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WagerTransactionEntity } from './entities/wager-transaction.entity.js';
import { WagerTransactionRepositoryImpl } from './repositories/wager-transaction.repository-impl.js';

@Module({
  imports: [MikroOrmModule.forFeature([WagerTransactionEntity])],
  providers: [WagerTransactionRepositoryImpl],
  exports: [WagerTransactionRepositoryImpl],
})
export class WagerTransactionsModule {}
