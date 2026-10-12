import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';
import { WalletEntity } from './entities/wallet.entity.js';
import { WalletRepositoryImpl } from './repositories/wallet.repository-impl.js';

import { WagerTransactionsModule } from '../wager-transactions/wager-transaction.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { DatabaseTransactionModule } from '../shared/infrastructure/database-transaction.module.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([WalletEntity]),
    WagerTransactionsModule,
    LedgerModule,
    DatabaseTransactionModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService, WalletRepositoryImpl],
  exports: [WalletsService, WalletRepositoryImpl],
})
export class WalletsModule {}
