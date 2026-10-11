import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';
import { WalletEntity } from './entities/wallet.entity.js';
import { WalletRepositoryImpl } from './repositories/wallet.repository-impl.js';

@Module({
  imports: [MikroOrmModule.forFeature([WalletEntity])],
  controllers: [WalletsController],
  providers: [WalletsService, WalletRepositoryImpl],
  exports: [WalletsService, WalletRepositoryImpl],
})
export class WalletsModule {}
