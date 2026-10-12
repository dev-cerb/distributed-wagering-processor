import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { WalletLedgerEntryEntity } from './entities/wallet-ledger-entry.entity.js';
import { WalletLedgerRepositoryImpl } from './repositories/wallet-ledger.repository-impl.js';

@Module({
  imports: [MikroOrmModule.forFeature([WalletLedgerEntryEntity])],
  providers: [WalletLedgerRepositoryImpl],
  exports: [WalletLedgerRepositoryImpl],
})
export class LedgerModule {}
