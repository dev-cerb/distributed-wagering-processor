import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

import { AppService } from './app.service.js';
import { AppController } from './app.controller.js';

import { WalletsModule } from './wallets/wallets.module.js';
import { WagerTransactionsModule } from './wager-transactions/wager-transaction.module.js';
import { WagerProcessingModule } from './wager-transactions/wager-processing.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { DatabaseTransactionModule } from './shared/infrastructure/database-transaction.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MikroOrmModule.forRoot({
      driver: PostgreSqlDriver,
      clientUrl: process.env.DATABASE_URL,
      autoLoadEntities: true,
      extensions: [Migrator],
    }),
    WalletsModule,
    WagerTransactionsModule,
    LedgerModule,
    DatabaseTransactionModule,
    WagerProcessingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
