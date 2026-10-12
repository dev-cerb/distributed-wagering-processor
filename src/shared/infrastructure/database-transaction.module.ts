import { Module } from '@nestjs/common';
import { DatabaseTransactionService } from './database-transaction.service.js';

@Module({
  providers: [DatabaseTransactionService],
  exports: [DatabaseTransactionService],
})
export class DatabaseTransactionModule {}
