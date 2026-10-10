import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';

import { AppService } from './app.service.js';
import { AppController } from './app.controller.js';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
