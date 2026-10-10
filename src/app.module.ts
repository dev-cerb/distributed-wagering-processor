import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        clientUrl: configService.getOrThrow<string>('DATABASE_URL'),
        driver: PostgreSqlDriver,
        autoLoadEntities: true,
        allowGlobalContext: false,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
